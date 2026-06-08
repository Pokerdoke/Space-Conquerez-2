export interface Player {
  id: string; // persistent local UUID for human players, or 'npc'
  name: string;
  color: 'green' | 'blue' | 'purple' | 'yellow';
  ready: boolean;
  resources: number;
  isNpc: boolean;
  homeworldId: string;
  playerNumber?: number;
  uuid?: string;
}

export type PlanetDevelopment = 'none' | 'colony' | 'city' | 'metropolis' | 'arcology' | 'coreworld';

export interface GroundUnit {
  id: string;
  type: 'GroundUnit';
  owner: string; // Player.id or 'npc'
  hp: number;
  maxHp: number;
  dmgMin: number;
  dmgMax: number;
  turnsInTerritory: number;
}

export interface Ship {
  /** True while this ship is queued for a real-time movement action. */
  inTransit?: boolean;
  transitToNodeId?: string | null;
  transitCompletesAt?: string | null;
  id: string;
  type: 'Destroyer' | 'BattleShip' | 'Carrier' | 'ColonyShip' | 'Fighter';
  owner: string; // Player.id
  hp: number;
  maxHp: number;
  dmgMin: number;
  dmgMax: number;
  canMove: boolean;
  blocksMovement: boolean;
  movesLeft: number;
  turnsInTerritory: number;
  /** Carrier cargo: ground units only. Kept as full objects so HP persists while transported. */
  carriedUnits: GroundUnit[];
  /** Deprecated legacy field. New carrier rules do not use fighter cargo, but this stays for old saves. */
  carriedFighters: Ship[];
  /** The most recent system this ship moved from. Used for FTL inhibitor retreat rules. */
  lastNodeId?: string | null;
  /** Battleships may bombard a planet once per owning player's turn. */
  bombardedThisTurn?: boolean;
}

export interface StarNode {
  id: string;
  name: string;
  x: number;
  y: number;
  links: string[]; // Connected Node IDs
  claimedBy: string | null; // Player.id or null for neutral
  development: PlanetDevelopment;
  resourceGeneration: number;
  hasShipyard: boolean;
  hasFtlInhibitor: boolean;
  hasGateway: boolean;
  ships: Ship[];
  groundUnits: GroundUnit[];
  /** Cities can build 3 ground units/turn; Metropolises can build 6/turn. Reset each full turn. */
  groundUnitsBuiltThisTurn: number;
  isNpcPlanet: boolean;
  isDysonSphere: boolean;
  biome?: PlanetBiome;
}

export type PlanetBiome = 'ocean' | 'tropical' | 'continental' | 'savannah' | 'desert' | 'arid' | 'tundra' | 'alpine' | 'arctic' | 'gas' | 'rock';

export type GalaxyType = 'spiral2' | 'spiral3' | 'spiral4' | 'ring' | 'circular';

export interface Alliance {
  id: string;
  playerIds: [string, string];
  status: 'active' | 'breaking';
  breakRequestedBy?: string;
  breakEffectiveAfterPlayerId?: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  text: string;
  timestamp: string;
}

export interface PendingRealtimeAction {
  id: string;
  type: 'build_ship' | 'build_ground' | 'upgrade_planet' | 'build_structure' | 'deconstruct_structure' | 'move_ship' | 'colonize' | 'scrap_ship';
  playerId: string;
  nodeId: string;
  targetNodeId?: string;
  shipId?: string;
  ship?: Ship;
  shipType?: Ship['type'];
  structureType?: 'Shipyard' | 'FtlInhibitor' | 'Gateway';
  targetDevelopment?: PlanetDevelopment;
  startedAt: string;
  completesAt: string;
  durationSeconds: number;
  label: string;
  /** Resources refunded if this queued order is cancelled before completion. */
  refundCost?: number;
}

export interface GameState {
  roomId: string;
  name: string;
  creatorId: string;
  maxPlayers: number;
  mapSize: 'small' | 'medium' | 'large';
  galaxyType?: GalaxyType;
  npcCount: number;
  /** True when the lobby appears in the public games browser. */
  isPublic?: boolean;
  status: 'lobby' | 'playing' | 'completed';
  players: Player[];
  activePlayerIndex: number; // Index in the players array
  phase: 0 | 1 | 2; // 0 = Build, 1 = Move, 2 = Attack/Colonize
  nodes: StarNode[];
  turnNumber: number;
  actionLog: string[];
  winnerId: string | null;
  chat: ChatMessage[];
  alliances?: Alliance[];
  lastUpdated: string;
  lastAction?: string;
  lastActionAt?: string;
  /** Last system where action-phase combat happened. Used so every player can watch the live combat panel. */
  activeCombatNodeId?: string | null;
  activeCombatUpdatedAt?: string;
  activeCombatSummary?: string;
  turnTimerMinutes?: number; // Optional turn timer
  turnStartedAt?: string; // Legacy field kept for old saves.
  realtimeIncomeLastAt?: string; // Last global income tick for real-time mode.
  pendingActions?: PendingRealtimeAction[];
  tutorialScenario?: {
    id: string;
    title: string;
    objective: string;
    steps: string[];
  };
}

