import type { GameState, ChatMessage, Player } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { generateId } from './gameLogic';

// Local storage keys
const ROOMS_LIST_KEY = 'sc2_rooms_list';
const getRoomKey = (code: string) => `sc2_room_${code.toUpperCase()}`;

// Broadcaster for local tab-to-tab sync
const localChannel = new BroadcastChannel('sc2_local_sync');

// Helper to generate a room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export type DbMode = 'local' | 'supabase';

export function getDbMode(): DbMode {
  // Auto-use Supabase when env vars are baked in or user configured it
  if (isSupabaseConfigured()) return 'supabase';
  const preference = localStorage.getItem('sc2_db_mode');
  return preference === 'supabase' ? 'supabase' : 'local';
}

export function setDbMode(mode: DbMode) {
  localStorage.setItem('sc2_db_mode', mode);
}

// -------------------------------------------------------------
// LOCAL MODE ACTIONS
// -------------------------------------------------------------
const localDb = {
  createRoom(creatorName: string, maxPlayers: number, mapSize: GameState['mapSize'], npcCount: number): GameState {
    const code = generateRoomCode();
    const playerId = 'p1-' + generateId();
    
    const creatorPlayer: Player = {
      id: playerId,
      name: creatorName || 'Player 1',
      color: 'green',
      ready: true,
      resources: 20,
      isNpc: false,
      homeworldId: ''
    };

    const state: GameState = {
      roomId: 'local-' + generateId(),
      name: `Room ${code}`,
      creatorId: playerId,
      maxPlayers,
      mapSize,
      npcCount,
      status: 'lobby',
      players: [creatorPlayer],
      activePlayerIndex: 0,
      phase: 0,
      nodes: [],
      turnNumber: 1,
      actionLog: [`Room created by ${creatorPlayer.name}`],
      winnerId: null,
      chat: [],
      lastUpdated: new Date().toISOString()
    };

    // Save to local storage
    localStorage.setItem(getRoomKey(code), JSON.stringify(state));
    
    // Add to list of rooms
    const rooms = JSON.parse(localStorage.getItem(ROOMS_LIST_KEY) || '[]');
    if (!rooms.includes(code)) {
      rooms.push(code);
      localStorage.setItem(ROOMS_LIST_KEY, JSON.stringify(rooms));
    }

    localChannel.postMessage({ type: 'UPDATE', code, state });
    return state;
  },

  joinRoom(code: string, playerName: string): GameState {
    const cleanCode = code.trim().toUpperCase();
    const key = getRoomKey(cleanCode);
    const data = localStorage.getItem(key);
    if (!data) {
      throw new Error(`Room ${cleanCode} not found.`);
    }

    const state: GameState = JSON.parse(data);
    
    // Check if player is already in the game (rejoining)
    const existingPlayer = state.players.find(p => p.name.trim().toLowerCase() === playerName.trim().toLowerCase());
    if (existingPlayer) {
      return state;
    }

    if (state.status !== 'lobby') {
      throw new Error('Game already started.');
    }
    if (state.players.length >= state.maxPlayers) {
      throw new Error('Room is full.');
    }

    const colors: Player['color'][] = ['blue', 'purple', 'yellow'];
    const assignedColor = colors[state.players.length - 1] || 'blue';
    const playerId = `p${state.players.length + 1}-${generateId()}`;

    const newPlayer: Player = {
      id: playerId,
      name: playerName || `Player ${state.players.length + 1}`,
      color: assignedColor,
      ready: false,
      resources: 20,
      isNpc: false,
      homeworldId: ''
    };

    state.players.push(newPlayer);
    state.actionLog.push(`${newPlayer.name} joined the lobby.`);
    state.lastUpdated = new Date().toISOString();

    localStorage.setItem(key, JSON.stringify(state));
    localChannel.postMessage({ type: 'UPDATE', code: cleanCode, state });

    return state;
  },

  updateGameState(code: string, state: GameState) {
    const cleanCode = code.toUpperCase();
    localStorage.setItem(getRoomKey(cleanCode), JSON.stringify(state));
    localChannel.postMessage({ type: 'UPDATE', code: cleanCode, state });
  }
};

// -------------------------------------------------------------
// DUAL-MODE API INTERFACE
// -------------------------------------------------------------
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
      const code = generateRoomCode();
      const playerId = 'p1-' + generateId();
      const creatorPlayer: Player = {
        id: playerId,
        name: creatorName || 'Player 1',
        color: 'green',
        ready: true,
        resources: 20,
        isNpc: false,
        homeworldId: ''
      };

      const state: GameState = {
        roomId: 'sb-' + generateId(),
        name: `Room ${code}`,
        creatorId: playerId,
        maxPlayers,
        mapSize,
        npcCount,
        status: 'lobby',
        players: [creatorPlayer],
        activePlayerIndex: 0,
        phase: 0,
        nodes: [],
        turnNumber: 1,
        actionLog: [`Room created in cloud by ${creatorPlayer.name}`],
        winnerId: null,
        chat: [],
        lastUpdated: new Date().toISOString()
      };

      const { error } = await client
        .from('rooms')
        .insert([{ code, state }]);

      if (error) {
        console.error('Supabase create room error:', error);
        throw new Error(error.message);
      }
      return { code, state };
    }
  }

  // Local fallback
  const state = localDb.createRoom(creatorName, maxPlayers, mapSize, npcCount);
  return { code: state.name.replace('Room ', ''), state };
}

export async function joinGameRoom(code: string, playerName: string): Promise<GameState> {
  const mode = getDbMode();
  const cleanCode = code.trim().toUpperCase();

  if (mode === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from('rooms')
        .select('*')
        .eq('code', cleanCode)
        .single();

      if (error || !data) {
        console.error('Supabase join room error:', error);
        throw new Error(`Room ${cleanCode} not found in Cloud.`);
      }

      const state = data.state as GameState;

      // Check if player is already in the game (rejoining)
      const existingPlayer = state.players.find(p => p.name.trim().toLowerCase() === playerName.trim().toLowerCase());
      if (existingPlayer) {
        return state;
      }

      if (state.status !== 'lobby') {
        throw new Error('Game already started.');
      }
      if (state.players.length >= state.maxPlayers) {
        throw new Error('Room is full.');
      }

      const colors: Player['color'][] = ['blue', 'purple', 'yellow'];
      const assignedColor = colors[state.players.length - 1] || 'blue';
      const playerId = `p${state.players.length + 1}-${generateId()}`;

      const newPlayer: Player = {
        id: playerId,
        name: playerName || `Player ${state.players.length + 1}`,
        color: assignedColor,
        ready: false,
        resources: 20,
        isNpc: false,
        homeworldId: ''
      };

      state.players.push(newPlayer);
      state.actionLog.push(`${newPlayer.name} joined lobby (Cloud).`);
      state.lastUpdated = new Date().toISOString();

      const { error: updateError } = await client
        .from('rooms')
        .update({ state, updated_at: new Date().toISOString() })
        .eq('code', cleanCode);

      if (updateError) {
        throw new Error(updateError.message);
      }

      return state;
    }
  }

  // Local fallback
  return localDb.joinRoom(cleanCode, playerName);
}

export async function updateRoomState(code: string, state: GameState): Promise<void> {
  const mode = getDbMode();
  const cleanCode = code.trim().toUpperCase();
  state.lastUpdated = new Date().toISOString();

  if (mode === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      const { error } = await client
        .from('rooms')
        .update({ state, updated_at: new Date().toISOString() })
        .eq('code', cleanCode);

      if (error) {
        console.error('Supabase update room error:', error);
        throw new Error(error.message);
      }
      return;
    }
  }

  // Local fallback
  localDb.updateGameState(cleanCode, state);
}

export function subscribeToRoom(code: string, onUpdate: (state: GameState) => void): () => void {
  const mode = getDbMode();
  const cleanCode = code.trim().toUpperCase();

  if (mode === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      // Set up real-time listener for postgres changes on this specific room
      const channel = client
        .channel(`room:${cleanCode}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `code=eq.${cleanCode}`
          },
          (payload) => {
            const newState = payload.new.state as GameState;
            onUpdate(newState);
          }
        )
        .subscribe();

      return () => {
        client.removeChannel(channel);
      };
    }
  }

  // Local mode listeners (BroadcastChannel + LocalStorage Storage event)
  const onBroadcast = (event: MessageEvent) => {
    if (event.data && event.data.code === cleanCode && event.data.type === 'UPDATE') {
      onUpdate(event.data.state);
    }
  };

  const onStorageChange = (event: StorageEvent) => {
    if (event.key === getRoomKey(cleanCode) && event.newValue) {
      onUpdate(JSON.parse(event.newValue));
    }
  };

  localChannel.addEventListener('message', onBroadcast);
  window.addEventListener('storage', onStorageChange);

  // Trigger an initial read
  const key = getRoomKey(cleanCode);
  const data = localStorage.getItem(key);
  if (data) {
    onUpdate(JSON.parse(data));
  }

  return () => {
    localChannel.removeEventListener('message', onBroadcast);
    window.removeEventListener('storage', onStorageChange);
  };
}

export async function sendRoomChatMessage(code: string, fromPlayer: Player, text: string): Promise<void> {
  const mode = getDbMode();
  const cleanCode = code.trim().toUpperCase();

  const newMessage: ChatMessage = {
    id: generateId(),
    playerId: fromPlayer.id,
    playerName: fromPlayer.name,
    playerColor: fromPlayer.color,
    text,
    timestamp: new Date().toISOString()
  };

  if (mode === 'supabase') {
    const client = getSupabaseClient();
    if (client) {
      // First retrieve the latest state to avoid race conditions
      const { data, error } = await client
        .from('rooms')
        .select('state')
        .eq('code', cleanCode)
        .single();

      if (!error && data) {
        const state = data.state as GameState;
        state.chat.push(newMessage);
        
        await client
          .from('rooms')
          .update({ state, updated_at: new Date().toISOString() })
          .eq('code', cleanCode);
      }
      return;
    }
  }

  // Local mode
  const key = getRoomKey(cleanCode);
  const data = localStorage.getItem(key);
  if (data) {
    const state: GameState = JSON.parse(data);
    state.chat.push(newMessage);
    localDb.updateGameState(cleanCode, state);
  }
}
