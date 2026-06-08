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

export const PLAYER_COLOR_VALUES = ['green', 'blue', 'purple', 'yellow', 'red', 'cyan', 'orange', 'pink'] as const;

export function normalizeCommanderName(value?: string): string {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((word) => {
      const lettersOnly = word.replace(/[^A-Za-z]/g, '');
      const shouldTitleCase = lettersOnly.length > 0 && (word === word.toLowerCase() || word === word.toUpperCase());
      if (!shouldTitleCase) return word;

      return word
        .split(/([-'])/)
        .map((part) => {
          if (part === '-' || part === "'" || part.length === 0) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('');
    })
    .join(' ');
}

export type DbMode = 'local' | 'supabase';

type GameRowStatus = 'lobby' | 'active' | 'finished';

export type PublicGameSummary = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  mapSize: GameState['mapSize'];
  galaxyType?: GameState['galaxyType'];
  npcCount: number;
  isPublic: boolean;
  updatedAt: string;
};

function toGameRowStatus(status: GameState['status']): GameRowStatus {
  if (status === 'playing') return 'active';
  if (status === 'completed') return 'finished';
  return 'lobby';
}


export function getStateVersion(state: GameState | null | undefined): number {
  const value = state?.stateVersion;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function normalizeGameState(state: GameState): GameState {
  return {
    ...state,
    stateVersion: getStateVersion(state),
    pendingActions: state.pendingActions || [],
    alliances: state.alliances || [],
    chat: state.chat || []
  };
}

function stampGameState(state: GameState, version: number): GameState {
  const now = new Date().toISOString();
  return normalizeGameState({
    ...state,
    stateVersion: version,
    lastUpdated: now,
    lastActionAt: state.lastActionAt || now
  });
}


type UpdateRoomStateOptions = {
  /** Version the caller originally edited from. Defaults to state.stateVersion. */
  expectedVersion?: number;
  /** The exact local state before the caller made its changes. Used to replay only the actual delta on conflict. */
  baseState?: GameState | null;
  /** Keep true for normal actions. Disable only if a caller wants strict compare-and-swap behavior. */
  retryMergedConflict?: boolean;
};

function jsonStable(value: unknown): string {
  return JSON.stringify(value);
}

function sameEntity(a: unknown, b: unknown): boolean {
  return jsonStable(a) === jsonStable(b);
}

function mergeEntityArrayByDelta<T extends { id: string }>(
  latest: T[],
  base: T[],
  attempted: T[]
): T[] {
  const baseById = new Map(base.map(item => [item.id, item]));
  const latestById = new Map(latest.map(item => [item.id, item]));
  const attemptedById = new Map(attempted.map(item => [item.id, item]));
  let merged = [...latest];

  // Remove entities this client intentionally removed from its base snapshot.
  for (const baseItem of base) {
    if (!attemptedById.has(baseItem.id)) {
      merged = merged.filter(item => item.id !== baseItem.id);
      latestById.delete(baseItem.id);
    }
  }

  // Add or update only entities this client actually changed.
  for (const attemptedItem of attempted) {
    const baseItem = baseById.get(attemptedItem.id);
    const latestItem = latestById.get(attemptedItem.id);
    const isNew = !baseItem;
    const changedByClient = isNew || !sameEntity(baseItem, attemptedItem);
    if (!changedByClient) continue;

    if (!latestItem) {
      merged.push(attemptedItem);
    } else {
      merged = merged.map(item => item.id === attemptedItem.id ? attemptedItem : item);
    }
  }

  return merged;
}

function mergeActionLogByDelta(latest: string[], base: string[], attempted: string[]): string[] {
  const newLines = attempted.slice(base.length);
  if (newLines.length === 0) return latest;
  return [...latest, ...newLines].slice(-120);
}

function mergePlayersByDelta(latest: Player[], base: Player[], attempted: Player[]): Player[] {
  const baseById = new Map(base.map(player => [player.id, player]));
  const attemptedById = new Map(attempted.map(player => [player.id, player]));
  let merged = mergeEntityArrayByDelta(latest, base, attempted);

  // Resources are special: merge the resource delta so income/upkeep from the latest state is not erased.
  merged = merged.map(latestPlayer => {
    const basePlayer = baseById.get(latestPlayer.id);
    const attemptedPlayer = attemptedById.get(latestPlayer.id);
    if (!basePlayer || !attemptedPlayer) return latestPlayer;
    const resourceDelta = Number(((attemptedPlayer.resources || 0) - (basePlayer.resources || 0)).toFixed(3));
    if (resourceDelta === 0) return latestPlayer;
    return {
      ...latestPlayer,
      resources: Number(((latestPlayer.resources || 0) + resourceDelta).toFixed(3))
    };
  });

  return merged;
}

function mergeNodeByDelta(latestNode: GameState['nodes'][number], baseNode: GameState['nodes'][number], attemptedNode: GameState['nodes'][number]): GameState['nodes'][number] {
  const merged: GameState['nodes'][number] = { ...latestNode };
  const scalarKeys: (keyof GameState['nodes'][number])[] = [
    'claimedBy',
    'development',
    'resourceGeneration',
    'hasShipyard',
    'hasFtlInhibitor',
    'hasGateway',
    'groundUnitsBuiltThisTurn',
    'isNpcPlanet',
    'isDysonSphere',
    'biome'
  ];

  for (const key of scalarKeys) {
    if (!sameEntity(baseNode[key], attemptedNode[key])) {
      (merged as unknown as Record<string, unknown>)[key as string] = attemptedNode[key];
    }
  }

  merged.ships = mergeEntityArrayByDelta(latestNode.ships, baseNode.ships, attemptedNode.ships);
  merged.groundUnits = mergeEntityArrayByDelta(latestNode.groundUnits, baseNode.groundUnits, attemptedNode.groundUnits);
  return merged;
}

function mergeGameStateDelta(latest: GameState, base: GameState, attempted: GameState): GameState {
  const latestNodesById = new Map(latest.nodes.map(node => [node.id, node]));
  const baseNodesById = new Map(base.nodes.map(node => [node.id, node]));
  const attemptedNodesById = new Map(attempted.nodes.map(node => [node.id, node]));

  let nodes = [...latest.nodes];
  for (const baseNode of base.nodes) {
    if (!attemptedNodesById.has(baseNode.id)) {
      nodes = nodes.filter(node => node.id !== baseNode.id);
    }
  }
  for (const attemptedNode of attempted.nodes) {
    const baseNode = baseNodesById.get(attemptedNode.id);
    const latestNode = latestNodesById.get(attemptedNode.id);
    if (!baseNode) {
      if (!latestNode) nodes.push(attemptedNode);
      continue;
    }
    if (!latestNode) continue;
    if (sameEntity(baseNode, attemptedNode)) continue;
    nodes = nodes.map(node => node.id === attemptedNode.id ? mergeNodeByDelta(latestNode, baseNode, attemptedNode) : node);
  }

  const merged: GameState = {
    ...latest,
    nodes,
    players: mergePlayersByDelta(latest.players, base.players, attempted.players),
    pendingActions: mergeEntityArrayByDelta(latest.pendingActions || [], base.pendingActions || [], attempted.pendingActions || []),
    alliances: mergeEntityArrayByDelta(latest.alliances || [], base.alliances || [], attempted.alliances || []),
    chat: mergeEntityArrayByDelta(latest.chat || [], base.chat || [], attempted.chat || []),
    actionLog: mergeActionLogByDelta(latest.actionLog || [], base.actionLog || [], attempted.actionLog || []),
    lastAction: attempted.lastAction || latest.lastAction,
    lastActionAt: attempted.lastActionAt || latest.lastActionAt,
    lastUpdated: attempted.lastUpdated || latest.lastUpdated
  };

  const topLevelKeys: (keyof GameState)[] = [
    'status',
    'creatorId',
    'maxPlayers',
    'mapSize',
    'galaxyType',
    'npcCount',
    'isPublic',
    'activePlayerIndex',
    'phase',
    'turnNumber',
    'winnerId',
    'activeCombatNodeId',
    'activeCombatUpdatedAt',
    'activeCombatSummary',
    'turnTimerMinutes',
    'turnStartedAt',
    'realtimeIncomeLastAt'
  ];

  for (const key of topLevelKeys) {
    if (!sameEntity(base[key], attempted[key])) {
      (merged as unknown as Record<string, unknown>)[key as string] = attempted[key];
    }
  }

  return normalizeGameState(merged);
}

async function fetchSupabaseState(code: string): Promise<GameState | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from('games').select('state').eq('id', code).maybeSingle();
  if (error || !data) return null;
  return normalizeGameState(data.state as GameState);
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

  let name = normalizeCommanderName(preferredName || localStorage.getItem(PLAYER_NAME_KEY) || '');
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
  return PLAYER_COLOR_VALUES[slotIndex] || 'blue';
}

function firstAvailableColor(players: Player[], fallbackSlot: number): Player['color'] {
  const used = new Set(players.map((player) => player.color));
  return PLAYER_COLOR_VALUES.find((color) => !used.has(color)) || colorForSlot(fallbackSlot);
}

function makePlayer(id: string, name: string, slotIndex: number, ready: boolean, color: Player['color'] = colorForSlot(slotIndex)): Player {
  return {
    id,
    uuid: id,
    playerNumber: slotIndex + 1,
    name: normalizeCommanderName(name) || `Player ${slotIndex + 1}`,
    color,
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
  isPublic = true,
  galaxyType: NonNullable<GameState['galaxyType']> = 'spiral4'
): GameState {
  const now = new Date().toISOString();
  return {
    roomId: code,
    name: `Room ${code}`,
    creatorId: creator.id,
    maxPlayers,
    mapSize,
    galaxyType,
    npcCount,
    isPublic,
    status: 'lobby',
    stateVersion: 0,
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
    galaxyType: state.galaxyType || 'spiral4',
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
  createRoom(creatorName: string, maxPlayers: number, mapSize: GameState['mapSize'], npcCount: number, isPublic = true, galaxyType: NonNullable<GameState['galaxyType']> = 'spiral4') {
    const code = generateRoomCode();
    const identity = getLocalPlayerIdentity(creatorName);
    const creatorPlayer = makePlayer(identity.id, identity.name, 0, true);
    const state = makeInitialState(code, creatorPlayer, maxPlayers, mapSize, npcCount, isPublic, galaxyType);
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
    const state = normalizeGameState(JSON.parse(data) as GameState);
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
    const newPlayer = makePlayer(identity.id, identity.name, state.players.length, false, firstAvailableColor(state.players, state.players.length));
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
        const state = normalizeGameState(JSON.parse(data) as GameState);
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
  isPublic = true,
  galaxyType: NonNullable<GameState['galaxyType']> = 'spiral4'
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
      const state = makeInitialState(code, creatorPlayer, maxPlayers, mapSize, npcCount, isPublic, galaxyType);
      const { error } = await client.from('games').insert([{ id: code, state, status: 'lobby' }]);
      if (error) throw new Error(`Supabase games table error: ${error.message}. Run supabase_schema.sql in the Supabase SQL editor first.`);

      await client.from('players').insert([{ game_id: code, display_name: creatorPlayer.name, player_number: 1, is_ready: true }]);
      localStorage.setItem(ACTIVE_GAME_KEY, code);
      return { code, state };
    }
  }
  return localDb.createRoom(creatorName, maxPlayers, mapSize, npcCount, isPublic, galaxyType);
}


export async function getGameRoomState(code: string): Promise<GameState | null> {
  const cleanCode = code.trim().toUpperCase();
  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.from('games').select('state').eq('id', cleanCode).maybeSingle();
      if (error || !data) return null;
      return normalizeGameState(data.state as GameState);
    }
  }
  const data = localStorage.getItem(getRoomKey(cleanCode));
  return data ? normalizeGameState(JSON.parse(data) as GameState) : null;
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
    players: remaining.map((p, idx) => ({ ...p, playerNumber: idx + 1 })),
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
      await updateRoomState(cleanCode, updatedState);
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
      const identity = getLocalPlayerIdentity(playerName);
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error } = await client.from('games').select('*').eq('id', cleanCode).single();
        if (error || !data) throw new Error(`Room ${cleanCode} not found.`);
        const state = normalizeGameState(data.state as GameState);
        const existing = state.players.find(p => p.id === identity.id);
        if (existing) {
          existing.name = identity.name;
          state.lastAction = 'rejoin_lobby';
          state.lastActionAt = new Date().toISOString();
          const saved = await updateRoomState(cleanCode, state);
          localStorage.setItem(ACTIVE_GAME_KEY, cleanCode);
          return saved;
        }
        if (state.status !== 'lobby') throw new Error('Game already started and this device is not one of the saved players.');
        if (state.players.length >= state.maxPlayers) throw new Error('Room is full.');

        const newPlayer = makePlayer(identity.id, identity.name, state.players.length, false, firstAvailableColor(state.players, state.players.length));
        const updatedState: GameState = {
          ...state,
          players: [...state.players, newPlayer],
          actionLog: [...state.actionLog, `${newPlayer.name} joined the lobby.`],
          lastAction: 'join_lobby',
          lastActionAt: new Date().toISOString()
        };
        const saved = await updateRoomState(cleanCode, updatedState);
        if (saved.players.some(p => p.id === newPlayer.id)) {
          await client.from('players').insert([{ game_id: cleanCode, display_name: newPlayer.name, player_number: newPlayer.playerNumber, is_ready: false }]);
          localStorage.setItem(ACTIVE_GAME_KEY, cleanCode);
          return saved;
        }
      }
      throw new Error('Could not join because the lobby changed at the same time. Try again.');
    }
  }
  return localDb.joinRoom(cleanCode, playerName);
}

export async function updateRoomState(code: string, state: GameState, options: UpdateRoomStateOptions = {}): Promise<GameState> {
  const cleanCode = code.trim().toUpperCase();
  let expectedVersion = options.expectedVersion ?? getStateVersion(state);
  const retryMergedConflict = options.retryMergedConflict !== false;
  let attemptedState = normalizeGameState(state);
  let baseState = options.baseState ? normalizeGameState(options.baseState) : null;

  const tryLocal = () => {
    const stamped = stampGameState(attemptedState, expectedVersion + 1);
    localDb.updateGameState(cleanCode, stamped);
    return stamped;
  };

  if (getDbMode() === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const stamped = stampGameState(attemptedState, expectedVersion + 1);
        const { data, error } = await client
          .from('games')
          .update({ state: stamped, updated_at: stamped.lastUpdated, status: toGameRowStatus(stamped.status) })
          .eq('id', cleanCode)
          .filter('state->>stateVersion', 'eq', String(expectedVersion))
          .select('state')
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (data) return normalizeGameState(data.state as GameState);

        const latest = await fetchSupabaseState(cleanCode);
        if (!latest) throw new Error(`Room ${cleanCode} not found.`);

        // One-time upgrade path for old rooms created before stateVersion existed.
        if (expectedVersion === 0 && getStateVersion(latest) === 0 && attemptedState.lastUpdated === latest.lastUpdated) {
          const { data: migrated, error: migrateError } = await client
            .from('games')
            .update({ state: stamped, updated_at: stamped.lastUpdated, status: toGameRowStatus(stamped.status) })
            .eq('id', cleanCode)
            .select('state')
            .maybeSingle();
          if (migrateError) throw new Error(migrateError.message);
          if (migrated) return normalizeGameState(migrated.state as GameState);
        }

        if (!retryMergedConflict || !baseState) {
          console.warn('Skipped stale state save to prevent rollback.', {
            room: cleanCode,
            attemptedVersion: expectedVersion,
            latestVersion: latest.stateVersion
          });
          return latest;
        }

        // Another client saved first. Replay only this client's actual changes on top of the latest state,
        // then try again. This prevents the visible "action happened then reverted" problem.
        attemptedState = mergeGameStateDelta(latest, baseState, attemptedState);
        baseState = latest;
        expectedVersion = getStateVersion(latest);
      }

      const latest = await fetchSupabaseState(cleanCode);
      if (latest) return latest;
    }
  }

  return tryLocal();
}

export async function updateLobbySettings(
  code: string,
  currentState: GameState,
  actorPlayerId: string,
  changes: Partial<Pick<GameState, 'maxPlayers' | 'mapSize' | 'galaxyType' | 'npcCount' | 'isPublic'>>
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
      `Lobby settings updated: ${nextMaxPlayers} players, ${changes.mapSize ?? currentState.mapSize} map, ${(changes.galaxyType ?? currentState.galaxyType ?? 'spiral4')} galaxy, ${changes.npcCount ?? currentState.npcCount} NPC systems, ${(changes.isPublic ?? currentState.isPublic !== false) ? 'public' : 'private'}.`
    ]
  };

  return await updateRoomState(code, updatedState);
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
        .map((row: any) => summarizePublicGame(row.id, normalizeGameState(row.state as GameState), row.updated_at))
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
          (payload) => onUpdate(normalizeGameState(payload.new.state as GameState))
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
    if (event.data?.code === cleanCode && event.data?.type === 'UPDATE' && event.data.state) onUpdate(normalizeGameState(event.data.state));
  };
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === getRoomKey(cleanCode) && event.newValue) onUpdate(normalizeGameState(JSON.parse(event.newValue)));
  };
  localChannel.addEventListener('message', onBroadcast);
  window.addEventListener('storage', onStorageChange);
  const data = localStorage.getItem(getRoomKey(cleanCode));
  if (data) onUpdate(normalizeGameState(JSON.parse(data)));
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
        const state = normalizeGameState(data.state as GameState);
        state.chat = [...(state.chat || []), newMessage];
        state.lastAction = 'chat';
        state.lastActionAt = newMessage.timestamp;
        state.lastUpdated = newMessage.timestamp;
        await updateRoomState(cleanCode, state);
      }
      return;
    }
  }

  const data = localStorage.getItem(getRoomKey(cleanCode));
  if (data) {
    const state = normalizeGameState(JSON.parse(data) as GameState);
    state.chat = [...(state.chat || []), newMessage];
    localDb.updateGameState(cleanCode, state);
  }
}
