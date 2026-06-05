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

export type PlanetDevelopment = 'none' | 'colony' | 'city' | 'metropolis';

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
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  text: string;
  timestamp: string;
}

export interface GameState {
  roomId: string;
  name: string;
  creatorId: string;
  maxPlayers: number;
  mapSize: 'small' | 'medium' | 'large';
  npcCount: number;
  status: 'lobby' | 'playing' | 'completed';
  players: Player[];
  activePlayerIndex: number; // Index in the players array
  phase: 0 | 1 | 2; // 0 = Build, 1 = Move, 2 = Attack/Colonize
  nodes: StarNode[];
  turnNumber: number;
  actionLog: string[];
  winnerId: string | null;
  chat: ChatMessage[];
  lastUpdated: string;
  lastAction?: string;
  lastActionAt?: string;
  turnTimerMinutes?: number; // Optional turn timer
  turnStartedAt?: string; // ISO string when current turn/phase started
  tutorialScenario?: {
    id: string;
    title: string;
    objective: string;
    steps: string[];
  };
}

