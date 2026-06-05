import type { GameState, ChatMessage, Player } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { generateId } from './gameLogic';

const ROOMS_LIST_KEY = 'void_empires_rooms_list';
const PLAYER_ID_KEY = 'void_empires_player_id';
const PLAYER_NAME_KEY = 'void_empires_player_name';
const ACTIVE_GAME_KEY = 'void_empires_active_game';
const getRoomKey = (code: string) => `void_empires_room_${code.toUpperCase()}`;
const localChannel = new BroadcastChannel('void_empires_local_sync');

export type DbMode = 'local' | 'supabase';

type GameRowStatus = 'lobby' | 'active' | 'finished';

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

function makeInitialState(code: string, creator: Player, maxPlayers: number, mapSize: GameState['mapSize'], npcCount: number): GameState {
  const now = new Date().toISOString();
  return {
    roomId: code,
    name: `Room ${code}`,
    creatorId: creator.id,
    maxPlayers,
    mapSize,
    npcCount,
    status: 'lobby',
    players: [creator],
    activePlayerIndex: 0,
    phase: 0,
    nodes: [],
    turnNumber: 1,
    actionLog: [`Room created by ${creator.name}`],
    winnerId: null,
    chat: [],
    lastUpdated: now,
    lastAction: 'create_lobby',
    lastActionAt: now
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
  createRoom(creatorName: string, maxPlayers: number, mapSize: GameState['mapSize'], npcCount: number) {
    const code = generateRoomCode();
    const identity = getLocalPlayerIdentity(creatorName);
    const creatorPlayer = makePlayer(identity.id, identity.name, 0, true);
    const state = makeInitialState(code, creatorPlayer, maxPlayers, mapSize, npcCount);
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
  }
};

export async function createGameRoom(
  creatorName: string,
  maxPlayers: number,
  mapSize: GameState['mapSize'],
  npcCount: number
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
      const state = makeInitialState(code, creatorPlayer, maxPlayers, mapSize, npcCount);
      const { error } = await client.from('games').insert([{ id: code, state, status: 'lobby' }]);
      if (error) throw new Error(`Supabase games table error: ${error.message}. Run supabase_schema.sql in the Supabase SQL editor first.`);

      await client.from('players').insert([{ game_id: code, display_name: creatorPlayer.name, player_number: 1, is_ready: true }]);
      localStorage.setItem(ACTIVE_GAME_KEY, code);
      return { code, state };
    }
  }
  return localDb.createRoom(creatorName, maxPlayers, mapSize, npcCount);
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
