import type { GameState, ChatMessage, Player } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { generateId } from './gameLogic';

const ROOMS_LIST_KEY = 'void_empires_rooms_list';
const PLAYER_ID_KEY = 'void_empires_player_id';
const PLAYER_NAME_KEY = 'void_empires_player_name';
const ACTIVE_GAME_KEY = 'void_empires_active_game';
const PUBLIC_LOBBY_TTL_MS = 1000 * 60 * 60 * 6; // hide abandoned public lobbies after 6 hours
const getRoomKey = (code: string) => `void_empires_room_${code.toUpperCase()}`;
const localChannel = new BroadcastChannel('void_empires_local_sync');

export type DbMode = 'local' | 'supabase';

type GameRowStatus = 'lobby' | 'active' | 'finished';

export type PublicGameSummary = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  mapSize: GameState['mapSize'];
  npcCount: number;
  isPublic: boolean;
  updatedAt: string;
};

function toGameRowStatus(status: GameState['status']): GameRowStatus {
  if (status === 'playing') return 'active';
  if (status === 'completed') return 'finished';
  return 'lobby';
}

function randomUuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getLocalPlayerIdentity(preferredName?: string) {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = randomUuid();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }

  let name = preferredName?.trim() || localStorage.getItem(PLAYER_NAME_KEY) || '';
  if (!name) {
    name = `StarPilot_${Math.floor(1000 + Math.random() * 9000)}`;
  }
  localStorage.setItem(PLAYER_NAME_KEY, name);
  return { id, name };
}

export function getSavedPlayerName() {
  return getLocalPlayerIdentity().name;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function colorForSlot(slotIndex: number): Player['color'] {
  return (['green', 'blue', 'purple', 'yellow'] as Player['color'][])[slotIndex] || 'blue';
}

function makePlayer(id: string, name: string, slotIndex: number, ready: boolean): Player {
  return {
    id,
    uuid: id,
    playerNumber: slotIndex + 1,
    name: name || `Player ${slotIndex + 1}`,
    color: colorForSlot(slotIndex),
    ready,
    resources: 20,
    isNpc: false,
    homeworldId: ''
  };
}

function makeInitialState(
  code: string,
  creator: Player,
  maxPlayers: number,
  mapSize: GameState['mapSize'],
  npcCount: number,
  isPublic = true
): GameState {
  const now = new Date().toISOString();
  return {
    roomId: code,
    name: `Room ${code}`,
    creatorId: creator.id,
    maxPlayers,
    mapSize,
    npcCount,
    isPublic,
    status: 'lobby',
    players: [creator],
    activePlayerIndex: 0,
    phase: 0,
    nodes: [],
    turnNumber: 1,
    actionLog: [`Room created by ${creator.name}`],
    winnerId: null,
    chat: [],
    alliances: [],
    lastUpdated: now,
    lastAction: 'create_lobby',
    lastActionAt: now,
    activeCombatNodeId: null
  };
}

function summarizePublicGame(code: string, state: GameState, updatedAt?: string): PublicGameSummary | null {
  const stamp = updatedAt || state.lastUpdated || state.lastActionAt;
  if (stamp && Date.now() - new Date(stamp).getTime() > PUBLIC_LOBBY_TTL_MS) return null;
  if (state.status !== 'lobby') return null;
  if (state.isPublic === false) return null;
  if (state.players.length >= state.maxPlayers) return null;
  return {
    code: code.toUpperCase(),
    hostName: state.players[0]?.name || 'Unknown Host',
    playerCount: state.players.length,
    maxPlayers: state.maxPlayers,
    mapSize: state.mapSize,
    npcCount: state.npcCount,
    isPublic: true,
    updatedAt: stamp || new Date().toISOString()
  };
}

export function getDbMode(): DbMode {
  if (isSupabaseConfigured()) return 'supabase';
  const preference = localStorage.getItem('void_empires_db_mode') || localStorage.getItem('sc2_db_mode');
  return preference === 'supabase' ? 'supabase' : 'local';
}

export function setDbMode(mode: DbMode) {
  localStorage.setItem('void_empires_db_mode', mode);
}

const localDb = {
  createRoom(creatorName: string, maxPlayers: number, mapSize: GameState['mapSize'], npcCount: number, isPublic = true) {
    const code = generateRoomCode();
    const identity = getLocalPlayerIdentity(creatorName);
    const creatorPlayer = makePlayer(identity.id, identity.name, 0, true);
    const state = makeInitialState(code, creatorPlayer, maxPlayers, mapSize, npcCount, isPublic);
    localStorage.setItem(getRoomKey(code), JSON.stringify(state));
    const rooms = JSON.parse(localStorage.getItem(ROOMS_LIST_KEY) || '[]');
    if (!rooms.includes(code)) localStorage.setItem(ROOMS_LIST_KEY, JSON.stringify([...rooms, code]));
    localStorage.setItem(ACTIVE_GAME_KEY, code);
    localChannel.postMessage({ type: 'UPDATE', code, state });
    return { code, state };
  },

  joinRoom(code: string, playerName: string): GameState {
    const cleanCode = code.trim().toUpperCase();
    const data = localStorage.getItem(getRoomKey(cleanCode));
    if (!data) throw new Error(`Room ${cleanCode} not found.`);
    const state = JSON.parse(data) as GameState;
    const identity = getLocalPlayerIdentity(playerName);
    const existing = state.players.find(p => p.id === identity.id);
    if (existing) {
      existing.name = identity.name;
      localStorage.setItem(ACTIVE_GAME_KEY, cleanCode);
      localDb.updateGameState(cleanCode, state);
      return state;
    }
    if (state.status !== 'lobby') throw new Error('Game already started and this device is not a saved player.');
    if (state.players.length >= state.maxPlayers) throw new Error('Room is full.');
    const newPlayer = makePlayer(identity.id, identity.name, state.players.length, false);
    state.players.push(newPlayer);
    state.actionLog.push(`${newPlayer.name} joined the lobby.`);
    state.lastUpdated = new Date().toISOString();
    state.lastAction = 'join_lobby';
    state.lastActionAt = state.lastUpdated;
    localStorage.setItem(ACTIVE_GAME_KEY, cleanCode);
    localDb.updateGameState(cleanCode, state);
    return state;
  },

  updateGameState(code: string, state: GameState) {
    const cleanCode = code.toUpperCase();
    localStorage.setItem(getRoomKey(cleanCode), JSON.stringify(state));
    localChannel.postMessage({ type: 'UPDATE', code: cleanCode, state });
  },

  listPublicRooms(): PublicGameSummary[] {
    const rooms = JSON.parse(localStorage.getItem(ROOMS_LIST_KEY) || '[]') as string[];
    return rooms
      .map(code => {
        const data = localStorage.getItem(getRoomKey(code));
        if (!data) return null;
        const state = JSON.parse(data) as GameState;
        return summarizePublicGame(code, state);
      })
      .filter((room): room is PublicGameSummary => Boolean(room))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
};

export async function createGameRoom(
  creatorName: string,
  maxPlayers: number,
  mapSize: GameState['mapSize'],
  npcCount: number,
  isPublic = true
): Promise<{ code: string; state: GameState }> {
  const mode = getDbMode();
  if (mode === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const identity = getLocalPlayerIdentity(creatorName);
      const creatorPlayer = makePlayer(identity.id, identity.name, 0, true);
      let code = generateRoomCode();
      for (let i = 0; i < 4; i++) {
        const { data } = await client.from('games').select('id').eq('id', code).maybeSingle();
        if (!data) break;
        code = generateRoomCode();
      }
      const state = makeInitialState(code, creatorPlayer, maxPlayers, mapSize, npcCount, isPublic);
      const { error } = await client.from('games').insert([{ id: code, state, status: 'lobby' }]);
      if (error) throw new Error(`Supabase games table error: ${error.message}. Run supabase_schema.sql in the Supabase SQL editor first.`);

      await client.from('players').insert([{ game_id: code, display_name: creatorPlayer.name, player_number: 1, is_ready: true }]);
      localStorage.setItem(ACTIVE_GAME_KEY, code);
      return { code, state };
    }
  }
  return localDb.createRoom(creatorName, maxPlayers, mapSize, npcCount, isPublic);
}


export async function getGameRoomState(code: string): Promise<GameState | null> {
  const cleanCode = code.trim().toUpperCase();
  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.from('games').select('state').eq('id', cleanCode).maybeSingle();
      if (error || !data) return null;
      return data.state as GameState;
    }
  }
  const data = localStorage.getItem(getRoomKey(cleanCode));
  return data ? JSON.parse(data) as GameState : null;
}

export async function leaveGameRoom(code: string, playerId: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const state = await getGameRoomState(cleanCode);
  if (!state) {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    return;
  }

  // Only remove players from lobbies. Active games stay intact so players can resume manually.
  if (state.status !== 'lobby') {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    return;
  }

  const leaving = state.players.find(p => p.id === playerId);
  const remaining = state.players.filter(p => p.id !== playerId);

  if (remaining.length === 0) {
    if (getDbMode() === 'supabase') {
      const client = getSupabaseClient();
      if (client) {
        await client.from('players').delete().eq('game_id', cleanCode);
        await client.from('games').delete().eq('id', cleanCode);
      }
    } else {
      localStorage.removeItem(getRoomKey(cleanCode));
      const rooms = JSON.parse(localStorage.getItem(ROOMS_LIST_KEY) || '[]') as string[];
      localStorage.setItem(ROOMS_LIST_KEY, JSON.stringify(rooms.filter(r => r !== cleanCode)));
      localChannel.postMessage({ type: 'UPDATE', code: cleanCode, state: null });
    }
    localStorage.removeItem(ACTIVE_GAME_KEY);
    return;
  }

  const updatedState: GameState = {
    ...state,
    players: remaining.map((p, idx) => ({ ...p, playerNumber: idx + 1, color: colorForSlot(idx) })),
    creatorId: state.creatorId === playerId ? remaining[0].id : state.creatorId,
    maxPlayers: Math.max(state.maxPlayers, remaining.length) as GameState['maxPlayers'],
    actionLog: [...state.actionLog, `${leaving?.name || 'A commander'} left the lobby.`],
    lastAction: 'leave_lobby',
    lastActionAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };

  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      await client.from('games').update({ state: updatedState, updated_at: updatedState.lastUpdated, status: 'lobby' }).eq('id', cleanCode);
      await client.from('players').delete().eq('game_id', cleanCode).eq('display_name', leaving?.name || '');
    }
  } else {
    localDb.updateGameState(cleanCode, updatedState);
  }
  localStorage.removeItem(ACTIVE_GAME_KEY);
}

export async function joinGameRoom(code: string, playerName: string): Promise<GameState> {
  const mode = getDbMode();
  const cleanCode = code.trim().toUpperCase();
  if (mode === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.from('games').select('*').eq('id', cleanCode).single();
      if (error || !data) throw new Error(`Room ${cleanCode} not found.`);
      const state = data.state as GameState;
      const identity = getLocalPlayerIdentity(playerName);
      const existing = state.players.find(p => p.id === identity.id);
      if (existing) {
        existing.name = identity.name;
        state.lastUpdated = new Date().toISOString();
        await client.from('games').update({ state, updated_at: state.lastUpdated, status: toGameRowStatus(state.status) }).eq('id', cleanCode);
        localStorage.setItem(ACTIVE_GAME_KEY, cleanCode);
        return state;
      }
      if (state.status !== 'lobby') throw new Error('Game already started and this device is not one of the saved players.');
      if (state.players.length >= state.maxPlayers) throw new Error('Room is full.');

      const newPlayer = makePlayer(identity.id, identity.name, state.players.length, false);
      state.players.push(newPlayer);
      state.actionLog.push(`${newPlayer.name} joined the lobby.`);
      state.lastAction = 'join_lobby';
      state.lastActionAt = new Date().toISOString();
      state.lastUpdated = state.lastActionAt;

      const { error: updateError } = await client
        .from('games')
        .update({ state, updated_at: state.lastUpdated, status: 'lobby' })
        .eq('id', cleanCode);
      if (updateError) throw new Error(updateError.message);
      await client.from('players').insert([{ game_id: cleanCode, display_name: newPlayer.name, player_number: newPlayer.playerNumber, is_ready: false }]);
      localStorage.setItem(ACTIVE_GAME_KEY, cleanCode);
      return state;
    }
  }
  return localDb.joinRoom(cleanCode, playerName);
}

export async function updateRoomState(code: string, state: GameState): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const stamped: GameState = {
    ...state,
    lastUpdated: new Date().toISOString(),
    lastActionAt: state.lastActionAt || new Date().toISOString()
  };

  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const { error } = await client
        .from('games')
        .update({ state: stamped, updated_at: stamped.lastUpdated, status: toGameRowStatus(stamped.status) })
        .eq('id', cleanCode);
      if (error) throw new Error(error.message);
      return;
    }
  }
  localDb.updateGameState(cleanCode, stamped);
}

export async function updateLobbySettings(
  code: string,
  currentState: GameState,
  actorPlayerId: string,
  changes: Partial<Pick<GameState, 'maxPlayers' | 'mapSize' | 'npcCount' | 'isPublic'>>
): Promise<GameState> {
  if (currentState.status !== 'lobby') throw new Error('Settings can only be changed before the game starts.');
  if (currentState.creatorId !== actorPlayerId) throw new Error('Only the host can change lobby settings.');

  const nextMaxPlayers = changes.maxPlayers ?? currentState.maxPlayers;
  if (nextMaxPlayers < currentState.players.length) {
    throw new Error(`Cannot lower slots below ${currentState.players.length} joined player(s).`);
  }

  const updatedState: GameState = {
    ...currentState,
    ...changes,
    maxPlayers: nextMaxPlayers,
    lastAction: 'lobby_settings',
    lastActionAt: new Date().toISOString(),
    actionLog: [
      ...currentState.actionLog,
      `Lobby settings updated: ${nextMaxPlayers} players, ${changes.mapSize ?? currentState.mapSize} map, ${changes.npcCount ?? currentState.npcCount} NPC systems, ${(changes.isPublic ?? currentState.isPublic !== false) ? 'public' : 'private'}.`
    ]
  };

  await updateRoomState(code, updatedState);
  return updatedState;
}

export async function listPublicGameRooms(): Promise<PublicGameSummary[]> {
  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from('games')
        .select('id,state,updated_at,status')
        .eq('status', 'lobby')
        .order('updated_at', { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data || [])
        .map((row: any) => summarizePublicGame(row.id, row.state as GameState, row.updated_at))
        .filter((room: PublicGameSummary | null): room is PublicGameSummary => Boolean(room));
    }
  }
  return localDb.listPublicRooms();
}

export function subscribeToPublicGameRooms(onUpdate: (rooms: PublicGameSummary[]) => void): () => void {
  let cancelled = false;
  const refresh = async () => {
    try {
      const rooms = await listPublicGameRooms();
      if (!cancelled) onUpdate(rooms);
    } catch (error) {
      console.warn('Failed to refresh public rooms:', error);
      if (!cancelled) onUpdate([]);
    }
  };

  void refresh();

  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const channel = client
        .channel('public-lobbies')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
          void refresh();
        })
        .subscribe();
      return () => {
        cancelled = true;
        client.removeChannel(channel);
      };
    }
  }

  const onBroadcast = () => { void refresh(); };
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === ROOMS_LIST_KEY || event.key?.startsWith('void_empires_room_')) void refresh();
  };
  localChannel.addEventListener('message', onBroadcast);
  window.addEventListener('storage', onStorageChange);
  return () => {
    cancelled = true;
    localChannel.removeEventListener('message', onBroadcast);
    window.removeEventListener('storage', onStorageChange);
  };
}

export function subscribeToRoom(code: string, onUpdate: (state: GameState) => void): () => void {
  const cleanCode = code.trim().toUpperCase();
  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const channel = client
        .channel(`game:${cleanCode}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${cleanCode}` },
          (payload) => onUpdate(payload.new.state as GameState)
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Supabase realtime connection issue:', status);
          }
        });
      return () => { client.removeChannel(channel); };
    }
  }

  const onBroadcast = (event: MessageEvent) => {
    if (event.data?.code === cleanCode && event.data?.type === 'UPDATE') onUpdate(event.data.state);
  };
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === getRoomKey(cleanCode) && event.newValue) onUpdate(JSON.parse(event.newValue));
  };
  localChannel.addEventListener('message', onBroadcast);
  window.addEventListener('storage', onStorageChange);
  const data = localStorage.getItem(getRoomKey(cleanCode));
  if (data) onUpdate(JSON.parse(data));
  return () => {
    localChannel.removeEventListener('message', onBroadcast);
    window.removeEventListener('storage', onStorageChange);
  };
}

export async function sendRoomChatMessage(code: string, fromPlayer: Player, text: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const newMessage: ChatMessage = {
    id: generateId(),
    playerId: fromPlayer.id,
    playerName: fromPlayer.name,
    playerColor: fromPlayer.color,
    text,
    timestamp: new Date().toISOString()
  };

  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client.from('games').select('state').eq('id', cleanCode).single();
      if (data) {
        const state = data.state as GameState;
        state.chat = [...(state.chat || []), newMessage];
        state.lastAction = 'chat';
        state.lastActionAt = newMessage.timestamp;
        state.lastUpdated = newMessage.timestamp;
        await client.from('games').update({ state, updated_at: state.lastUpdated, status: toGameRowStatus(state.status) }).eq('id', cleanCode);
      }
      return;
    }
  }

  const data = localStorage.getItem(getRoomKey(cleanCode));
  if (data) {
    const state = JSON.parse(data) as GameState;
    state.chat = [...(state.chat || []), newMessage];
    localDb.updateGameState(cleanCode, state);
  }
}
