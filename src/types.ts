export interface Player {
  id: string; // "p1", "p2", etc., or custom UUID
  name: string;
  color: 'green' | 'blue' | 'purple' | 'yellow';
  ready: boolean;
  resources: number;
  isNpc: boolean;
  homeworldId: string;
}

export type PlanetDevelopment = 'none' | 'colony' | 'city' | 'metropolis';

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
  carriedUnits: GroundUnit[];
  carriedFighters: Ship[];
}

export interface GroundUnit {
  id: string;
  type: 'GroundUnit';
  owner: string; // Player.id
  hp: number;
  maxHp: number;
  dmgMin: number;
  dmgMax: number;
  turnsInTerritory: number;
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
  turnTimerMinutes?: number; // Optional turn timer
  turnStartedAt?: string; // ISO string when current turn/phase started
}
