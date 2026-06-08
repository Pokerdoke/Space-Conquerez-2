import type { GameState, StarNode, Ship, GroundUnit, Player, PlanetDevelopment, PlanetBiome, PendingRealtimeAction, GalaxyType } from '../types';

// Sci-Fi Names for Nodes
const STAR_NAMES = [
  'Sol', 'Proxima', 'Alpha Centauri', 'Sirius', 'Vega', 'Rigel', 'Betelgeuse', 'Antares', 
  'Aldebaran', 'Arcturus', 'Capella', 'Canopus', 'Procyon', 'Pollux', 'Castor', 'Spica', 
  'Fomalhaut', 'Deneb', 'Regulus', 'Altair', 'Bellatrix', 'Alnilam', 'Alnitak', 'Mintaka', 
  'Saiph', 'Meissa', 'Algol', 'Mirfak', 'Alcyone', 'Electra', 'Maia', 'Merope', 'Taygeta', 
  'Celaeno', 'Asterope', 'Atlas', 'Pleione', 'Polaris', 'Dubhe', 'Merak', 'Phecda', 
  'Megrez', 'Alioth', 'Mizar', 'Alcor', 'Alkaid', 'Kocab', 'Pherkad', 'Eltanin', 'Rastaban',
  'Vega Prime', 'Rigel Secundus', 'Betelgeuse III', 'Sirius Minor', 'Proxima Prime'
];

// Ship templates
export const SHIP_STATS = {
  Destroyer: { cost: 10, hp: 14, dmgMin: 2, dmgMax: 6, blocksMovement: true },
  BattleShip: { cost: 15, hp: 20, dmgMin: 3, dmgMax: 9, blocksMovement: true },
  Carrier: { cost: 7, hp: 12, dmgMin: 1, dmgMax: 3, blocksMovement: true, capacity: 3, maxFighters: 2 },
  ColonyShip: { cost: 5, hp: 10, dmgMin: 0, dmgMax: 0, blocksMovement: false },
  Fighter: { cost: 3, hp: 5, dmgMin: 1, dmgMax: 3, blocksMovement: false }
};

export const GROUND_UNIT_STATS = { cost: 3, hp: 10, dmgMin: 1, dmgMax: 4 };

const PLANET_BIOMES: PlanetBiome[] = ['ocean', 'tropical', 'continental', 'savannah', 'desert', 'arid', 'tundra', 'alpine', 'arctic', 'gas', 'rock'];

function pickBiome(index: number, isSpecial = false): PlanetBiome {
  if (isSpecial) return 'rock';
  return PLANET_BIOMES[index % PLANET_BIOMES.length];
}
export const SHIPYARD_HEAL_TURNS = 1;
export const FRIENDLY_TERRITORY_HEAL_TURNS = 3;

type HealableUnit = {
  hp: number;
  maxHp: number;
  turnsInTerritory: number;
};

function healUnitOneTurn(unit: HealableUnit, hasShipyard: boolean): number {
  if (unit.hp >= unit.maxHp) {
    unit.turnsInTerritory = 0;
    return 0;
  }

  const before = unit.hp;
  unit.turnsInTerritory += 1;

  // Shipyards fully repair ships and ground troops in one friendly turn.
  // Friendly territory without a shipyard repairs slower: heavy damage usually takes 3 turns,
  // while lighter damage often takes 2 turns.
  if (hasShipyard) {
    unit.hp = unit.maxHp;
  } else {
    const healAmount = Math.ceil(unit.maxHp / FRIENDLY_TERRITORY_HEAL_TURNS);
    unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);
  }

  if (unit.hp >= unit.maxHp) {
    unit.turnsInTerritory = 0;
  }

  return unit.hp - before;
}

export const STRUCTURE_COSTS = {
  Shipyard: 15,
  FtlInhibitor: 4,
  Gateway: 10
};

export const PLANET_UPGRADES: Record<PlanetDevelopment, { cost: number; res: number; next: PlanetDevelopment | null; level: number }> = {
  none: { cost: 0, res: 1, next: 'colony', level: 0 },
  colony: { cost: 2, res: 2, next: 'city', level: 1 },
  city: { cost: 4, res: 4, next: 'metropolis', level: 2 },
  metropolis: { cost: 12, res: 8, next: 'arcology', level: 3 },
  arcology: { cost: 22, res: 12, next: 'coreworld', level: 4 },
  coreworld: { cost: 38, res: 18, next: null, level: 5 }
};

export const MAX_FRIENDLY_GROUND_UNITS_ON_PLANET = 6;

export function getGroundUnitCapacity(development: PlanetDevelopment): number {
  if (development === 'coreworld') return 12;
  if (development === 'arcology') return 9;
  return MAX_FRIENDLY_GROUND_UNITS_ON_PLANET;
}

export function getPlanetLevel(development: PlanetDevelopment): number {
  return PLANET_UPGRADES[development]?.level ?? 0;
}

export function isAllied(state: Pick<GameState, 'alliances'>, playerA: string | null, playerB: string | null): boolean {
  if (!playerA || !playerB || playerA === playerB || playerA === 'npc' || playerB === 'npc') return false;
  return (state.alliances || []).some(a => a.status === 'active' && a.playerIds.includes(playerA) && a.playerIds.includes(playerB));
}

export function isHostileOwner(state: Pick<GameState, 'alliances'>, viewerId: string, ownerId: string | null): boolean {
  if (!ownerId || ownerId === viewerId) return false;
  if (isAllied(state, viewerId, ownerId)) return false;
  return true;
}

export function getPlanetUpgradeTarget(
  development: PlanetDevelopment,
  node?: StarNode,
  nodes?: StarNode[],
  ownerId?: string
): PlanetDevelopment | null {
  const target = PLANET_UPGRADES[development]?.next ?? null;
  if (!target) return null;
  if (!node || !nodes || !ownerId) return target;

  // Advanced economy rule:
  // Level 4 requires every adjacent owned non-Dyson planet to be at least level 3.
  // Level 5 requires every adjacent owned non-Dyson planet to be at least level 4.
  // Dyson spheres do not count as neighbors for the requirement.
  const requiredNeighborLevel = target === 'arcology' ? 3 : target === 'coreworld' ? 4 : 0;
  if (requiredNeighborLevel === 0) return target;

  const ownedNeighbors = node.links
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is StarNode => n !== undefined && !n.isDysonSphere && n.claimedBy === ownerId);

  if (ownedNeighbors.length === 0) return null;
  return ownedNeighbors.every(n => getPlanetLevel(n.development) >= requiredNeighborLevel) ? target : null;
}

export function getPlanetUpgradeCost(
  development: PlanetDevelopment,
  node?: StarNode,
  nodes?: StarNode[],
  ownerId?: string
): number {
  const target = getPlanetUpgradeTarget(development, node, nodes, ownerId);
  return target ? PLANET_UPGRADES[target].cost : 0;
}

export function getPlanetResourceGeneration(development: PlanetDevelopment): number {
  return PLANET_UPGRADES[development]?.res ?? 1;
}

export function getEffectiveResourceGeneration(node: StarNode, ownerId: string): number {
  if (node.claimedBy !== ownerId) return 0;
  const friendlyTroops = node.groundUnits.filter(g => g.owner === ownerId).length;
  // Overcrowded captured worlds still belong to you, but they produce no income until the garrison is within capacity.
  if (friendlyTroops > getGroundUnitCapacity(node.development)) return 0;
  return node.resourceGeneration;
}

export function getGroundUnitBuildLimit(development: PlanetDevelopment): number {
  if (development === 'coreworld') return 12;
  if (development === 'arcology') return 9;
  if (development === 'metropolis') return 6;
  if (development === 'city') return 3;
  return 0;
}


export const REALTIME_ACTION_SECONDS = {
  buildGround: 10,
  buildShip: {
    Fighter: 10,
    Destroyer: 18,
    BattleShip: 28,
    Carrier: 24,
    ColonyShip: 16
  } as Record<Ship['type'], number>,
  upgradeBase: 14,
  structure: {
    Shipyard: 24,
    FtlInhibitor: 16,
    Gateway: 28
  } as Record<'Shipyard' | 'FtlInhibitor' | 'Gateway', number>,
  deconstruct: 10,
  colonize: 20,
  scrap: 10,
  combatRound: 1.5
};

export function clampRealtimeSeconds(seconds: number): number {
  return Math.max(5, Math.min(55, Math.round(seconds)));
}

export function getMoveDurationSeconds(_source: StarNode, _target: StarNode, costInMoves = 1): number {
  // Real-time movement is based on hyperlane hops: 1 planet away = 15s, 2 = 30s, 3 = 45s, 4+ = 60s.
  return Math.max(15, Math.min(60, Math.ceil(costInMoves) * 15));
}

export function getBuildDurationSeconds(action: PendingRealtimeAction['type'], detail?: string): number {
  if (action === 'build_ship' && detail && detail in REALTIME_ACTION_SECONDS.buildShip) {
    return REALTIME_ACTION_SECONDS.buildShip[detail as Ship['type']];
  }
  if (action === 'build_structure' && detail && detail in REALTIME_ACTION_SECONDS.structure) {
    return REALTIME_ACTION_SECONDS.structure[detail as 'Shipyard' | 'FtlInhibitor' | 'Gateway'];
  }
  if (action === 'upgrade_planet' && detail) {
    return clampRealtimeSeconds(REALTIME_ACTION_SECONDS.upgradeBase + getPlanetLevel(detail as PlanetDevelopment) * 5);
  }
  if (action === 'deconstruct_structure') return REALTIME_ACTION_SECONDS.deconstruct;
  if (action === 'build_ground') return REALTIME_ACTION_SECONDS.buildGround;
  if (action === 'colonize') return REALTIME_ACTION_SECONDS.colonize;
  if (action === 'scrap_ship') return REALTIME_ACTION_SECONDS.scrap;
  return 12;
}

export function formatSeconds(seconds: number): string {
  return `${Math.max(0, Math.ceil(seconds))}s`;
}

export function createPendingAction(input: Omit<PendingRealtimeAction, 'id' | 'startedAt' | 'completesAt'>, now = Date.now()): PendingRealtimeAction {
  const startedAt = new Date(now).toISOString();
  const completesAt = new Date(now + input.durationSeconds * 1000).toISOString();
  return {
    id: generateId(),
    ...input,
    startedAt,
    completesAt
  };
}

function pushRealtimeLog(logs: string[], message: string) {
  logs.push(`[REAL TIME] ${message}`);
}

export function processRealtimeActions(state: GameState, nowMs = Date.now()): { state: GameState; changed: boolean; completed: PendingRealtimeAction[] } {
  const pending = state.pendingActions || [];
  if (pending.length === 0) return { state, changed: false, completed: [] };

  const due = pending.filter(action => new Date(action.completesAt).getTime() <= nowMs);
  if (due.length === 0) return { state, changed: false, completed: [] };

  let nodes = state.nodes.map(node => ({
    ...node,
    ships: node.ships.map(ship => ({ ...ship, carriedUnits: ship.carriedUnits.map(u => ({ ...u })), carriedFighters: ship.carriedFighters.map(f => ({ ...f })) })),
    groundUnits: node.groundUnits.map(unit => ({ ...unit }))
  }));
  let players = state.players.map(player => ({ ...player }));
  const actionLog = [...state.actionLog];

  const nodeById = (id: string) => nodes.find(node => node.id === id);
  const playerName = (id: string) => players.find(p => p.id === id)?.name || 'Commander';

  for (const action of due) {
    const node = nodeById(action.nodeId);
    if (!node) continue;

    switch (action.type) {
      case 'build_ship': {
        if (!action.shipType) break;
        node.ships.push(createShip(action.shipType, action.playerId));
        pushRealtimeLog(actionLog, `${playerName(action.playerId)} completed ${action.shipType} at ${node.name}.`);
        break;
      }
      case 'build_ground': {
        if (countFriendlyGroundUnits(node, action.playerId) >= getGroundUnitCapacity(node.development)) {
          pushRealtimeLog(actionLog, `${playerName(action.playerId)} could not deploy ground unit at ${node.name}; surface capacity is full.`);
          break;
        }
        node.groundUnits.push(createGroundUnit(action.playerId));
        node.groundUnitsBuiltThisTurn = (node.groundUnitsBuiltThisTurn || 0) + 1;
        pushRealtimeLog(actionLog, `${playerName(action.playerId)} completed ground unit training at ${node.name}.`);
        break;
      }
      case 'upgrade_planet': {
        if (!action.targetDevelopment) break;
        node.development = action.targetDevelopment;
        node.resourceGeneration = getPlanetResourceGeneration(action.targetDevelopment);
        pushRealtimeLog(actionLog, `${playerName(action.playerId)} completed ${node.name} upgrade to ${action.targetDevelopment.toUpperCase()}.`);
        break;
      }
      case 'build_structure': {
        if (!action.structureType) break;
        if (action.structureType === 'Shipyard') node.hasShipyard = true;
        if (action.structureType === 'FtlInhibitor') node.hasFtlInhibitor = true;
        if (action.structureType === 'Gateway') node.hasGateway = true;
        pushRealtimeLog(actionLog, `${playerName(action.playerId)} completed ${action.structureType} at ${node.name}.`);
        break;
      }
      case 'deconstruct_structure': {
        if (!action.structureType) break;
        if (action.structureType === 'Shipyard') node.hasShipyard = false;
        if (action.structureType === 'FtlInhibitor') node.hasFtlInhibitor = false;
        if (action.structureType === 'Gateway') node.hasGateway = false;
        const refund = Math.floor(STRUCTURE_COSTS[action.structureType] / 2);
        players = players.map(player => player.id === action.playerId ? { ...player, resources: player.resources + refund } : player);
        pushRealtimeLog(actionLog, `${playerName(action.playerId)} finished removing ${action.structureType} at ${node.name} (+${refund}R).`);
        break;
      }
      case 'move_ship': {
        if (!action.ship || !action.targetNodeId) break;
        const target = nodeById(action.targetNodeId);
        if (!target) break;
        target.ships.push({
          ...action.ship,
          inTransit: false,
          transitToNodeId: null,
          transitCompletesAt: null,
          canMove: action.ship.type !== 'Fighter',
          movesLeft: action.ship.type === 'Fighter' ? 0 : 4,
          turnsInTerritory: 0,
          lastNodeId: action.nodeId
        });
        pushRealtimeLog(actionLog, `${playerName(action.playerId)}'s ${action.ship.type} arrived at ${target.name}.`);
        break;
      }
      case 'colonize': {
        if (!action.shipId) break;
        node.ships = node.ships.filter(ship => ship.id !== action.shipId);
        node.claimedBy = action.playerId;
        node.development = 'colony';
        node.resourceGeneration = 2;
        node.isNpcPlanet = false;
        pushRealtimeLog(actionLog, `${playerName(action.playerId)} finished colonizing ${node.name}.`);
        break;
      }
      case 'scrap_ship': {
        if (!action.shipId) break;
        const ship = node.ships.find(s => s.id === action.shipId);
        if (!ship) break;
        const refund = Math.floor(SHIP_STATS[ship.type].cost * 0.75);
        node.ships = node.ships.filter(s => s.id !== action.shipId);
        players = players.map(player => player.id === action.playerId ? { ...player, resources: player.resources + refund } : player);
        pushRealtimeLog(actionLog, `${playerName(action.playerId)} finished scrapping ${ship.type} at ${node.name} (+${refund}R).`);
        break;
      }
      default:
        break;
    }
  }

  const dueIds = new Set(due.map(action => action.id));
  return {
    state: {
      ...state,
      players,
      nodes,
      pendingActions: pending.filter(action => !dueIds.has(action.id)),
      actionLog,
      lastAction: 'realtime_actions_completed',
      lastActionAt: new Date(nowMs).toISOString(),
      lastUpdated: new Date(nowMs).toISOString()
    },
    changed: true,
    completed: due
  };
}


export function getRealtimeActionRefund(action: PendingRealtimeAction): number {
  if (typeof action.refundCost === 'number') return Math.max(0, action.refundCost);
  if (action.type === 'build_ship' && action.shipType) return SHIP_STATS[action.shipType].cost;
  if (action.type === 'build_ground') return GROUND_UNIT_STATS.cost;
  if (action.type === 'build_structure' && action.structureType) return STRUCTURE_COSTS[action.structureType];
  if (action.type === 'upgrade_planet' && action.targetDevelopment) return PLANET_UPGRADES[action.targetDevelopment]?.cost || 0;
  return 0;
}

export function cancelRealtimeAction(state: GameState, actionId: string, playerId: string): GameState {
  const action = (state.pendingActions || []).find(a => a.id === actionId);
  if (!action || action.playerId !== playerId) return state;

  const nodes = state.nodes.map(node => ({
    ...node,
    ships: node.ships.map(ship => ({
      ...ship,
      carriedUnits: ship.carriedUnits.map(unit => ({ ...unit })),
      carriedFighters: ship.carriedFighters.map(fighter => ({ ...fighter }))
    })),
    groundUnits: node.groundUnits.map(unit => ({ ...unit }))
  }));
  const refund = getRealtimeActionRefund(action);
  const players = state.players.map(player =>
    player.id === playerId ? { ...player, resources: player.resources + refund } : player
  );
  const node = nodes.find(n => n.id === action.nodeId);
  const playerName = state.players.find(p => p.id === playerId)?.name || 'Commander';

  if (action.type === 'move_ship' && action.ship && node) {
    const shipAlreadyExists = nodes.some(n => n.ships.some(s => s.id === action.shipId));
    if (!shipAlreadyExists) {
      node.ships.push({
        ...action.ship,
        inTransit: false,
        transitToNodeId: null,
        transitCompletesAt: null,
        lastNodeId: action.ship.lastNodeId ?? null
      });
    }
  }

  const actionLog = [
    ...state.actionLog,
    `[REAL TIME] ${playerName} cancelled ${action.label}${refund > 0 ? ` and recovered ${refund}R` : ''}.`
  ].slice(-80);
  const timestamp = new Date().toISOString();

  return {
    ...state,
    nodes,
    players,
    pendingActions: (state.pendingActions || []).filter(a => a.id !== actionId),
    actionLog,
    lastAction: 'cancel_realtime_action',
    lastActionAt: timestamp,
    lastUpdated: timestamp
  };
}

// Generate a random ID
export const generateId = () => Math.random().toString(36).substring(2, 9);

// Create a unique ship
export function createShip(type: Ship['type'], owner: string): Ship {
  const stats = SHIP_STATS[type];
  return {
    id: generateId(),
    type,
    owner,
    hp: stats.hp,
    maxHp: stats.hp,
    dmgMin: stats.dmgMin,
    dmgMax: stats.dmgMax,
    canMove: type !== 'Fighter',
    blocksMovement: stats.blocksMovement,
    movesLeft: type === 'Fighter' ? 0 : 4,
    turnsInTerritory: 0,
    carriedUnits: [],
    carriedFighters: [],
    lastNodeId: null,
    bombardedThisTurn: false
  };
}

// Create a unique ground unit
export function createGroundUnit(owner: string): GroundUnit {
  return {
    id: generateId(),
    type: 'GroundUnit',
    owner,
    hp: GROUND_UNIT_STATS.hp,
    maxHp: GROUND_UNIT_STATS.hp,
    dmgMin: GROUND_UNIT_STATS.dmgMin,
    dmgMax: GROUND_UNIT_STATS.dmgMax,
    turnsInTerritory: 0
  };
}

const SMALL_MAP_NODE_COUNT = 30;
const SMALL_MAP_RADIUS = 450;

function getRingCount(nodeCount: number): number {
  return Math.ceil(Math.sqrt(nodeCount / 3));
}

function getNodesPerRing(nodeCount: number, rings: number): number[] {
  let ringWeightsSum = 0;
  for (let r = 1; r <= rings; r++) {
    ringWeightsSum += r;
  }

  const nodesPerRing: number[] = [];
  let allocated = 0;
  for (let r = 1; r <= rings; r++) {
    let count = Math.round(nodeCount * (r / ringWeightsSum));
    if (r === rings) {
      count = nodeCount - allocated;
    } else {
      allocated += count;
    }
    nodesPerRing.push(count);
  }

  if (nodesPerRing[0] === 0) nodesPerRing[0] = 1;
  return nodesPerRing;
}

export function getMapLayoutRadius(nodeCount: number): number {
  const rings = getRingCount(nodeCount);
  const nodesPerRing = getNodesPerRing(nodeCount, rings);
  const smallRings = getRingCount(SMALL_MAP_NODE_COUNT);
  const smallNodesPerRing = getNodesPerRing(SMALL_MAP_NODE_COUNT, smallRings);

  const smallOuterCount = Math.max(1, smallNodesPerRing[smallNodesPerRing.length - 1]);
  const currentOuterCount = Math.max(1, nodesPerRing[nodesPerRing.length - 1]);
  const smallOuterSpacing = (2 * Math.PI * SMALL_MAP_RADIUS) / smallOuterCount;

  const radiusForSameOuterSpacing = (smallOuterSpacing * currentOuterCount) / (2 * Math.PI);
  const radiusForSameDensity = SMALL_MAP_RADIUS * Math.sqrt(nodeCount / SMALL_MAP_NODE_COUNT);

  return Math.round(Math.max(SMALL_MAP_RADIUS, radiusForSameOuterSpacing, radiusForSameDensity));
}


type GalaxyPoint = { x: number; y: number };

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function jitter(amount: number) {
  return (Math.random() * 2 - 1) * amount;
}

function clampGalaxyPoint(point: GalaxyPoint, centerX: number, centerY: number, maxRadius: number): GalaxyPoint {
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const limit = maxRadius * 1.12;
  const dist = Math.hypot(dx, dy);
  if (dist <= limit || dist === 0) return point;
  const scale = limit / dist;
  return {
    x: Math.round(centerX + dx * scale),
    y: Math.round(centerY + dy * scale)
  };
}

function spreadApartPositions(
  points: GalaxyPoint[],
  centerX: number,
  centerY: number,
  maxRadius: number,
  minDistance = 58
): GalaxyPoint[] {
  const working = points.map(point => ({ ...point }));
  const maxIterations = 90;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = false;

    for (let i = 0; i < working.length; i++) {
      for (let j = i + 1; j < working.length; j++) {
        const a = working[i];
        const b = working[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);

        if (dist >= minDistance) continue;

        if (dist < 0.01) {
          const angle = (i * GOLDEN_ANGLE + j) % (Math.PI * 2);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        }

        const push = (minDistance - dist) * 0.52;
        const nx = dx / dist;
        const ny = dy / dist;

        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        changed = true;
      }
    }

    for (let i = 0; i < working.length; i++) {
      const clamped = clampGalaxyPoint(working[i], centerX, centerY, maxRadius);
      working[i].x = clamped.x;
      working[i].y = clamped.y;
    }

    if (!changed) break;
  }

  return working.map(point => ({ x: Math.round(point.x), y: Math.round(point.y) }));
}

function getClassicRingPositions(nodeCount: number, rings: number, maxRadius: number, centerX: number, centerY: number): GalaxyPoint[] {
  const nodesPerRing = getNodesPerRing(nodeCount, rings);
  const positions: GalaxyPoint[] = [];
  for (let rIndex = 0; rIndex < rings; rIndex++) {
    const ringNum = rIndex + 1;
    const radius = (ringNum / rings) * maxRadius;
    const count = nodesPerRing[rIndex];
    const angleOffset = (ringNum * Math.PI) / rings;

    for (let j = 0; j < count; j++) {
      const angle = (j * 2 * Math.PI) / count + angleOffset;
      positions.push({
        x: Math.round(centerX + Math.cos(angle) * radius + jitter(9)),
        y: Math.round(centerY + Math.sin(angle) * radius + jitter(9))
      });
    }
  }
  return spreadApartPositions(positions, centerX, centerY, maxRadius, 58);
}

function createSpiralGalaxyPositions(
  nodeCount: number,
  armCount: number,
  maxRadius: number,
  centerX: number,
  centerY: number
): GalaxyPoint[] {
  const positions: GalaxyPoint[] = [];
  const coreCount = Math.max(7, Math.min(16, Math.round(nodeCount * 0.12)));
  const remaining = Math.max(0, nodeCount - coreCount);

  // Compact but slightly irregular core so the arms feel natural instead of mathematically perfect.
  for (let i = 0; i < coreCount; i++) {
    const t = coreCount <= 1 ? 0 : i / (coreCount - 1);
    const angle = i * GOLDEN_ANGLE + jitter(0.12);
    const radius = maxRadius * (0.045 + 0.165 * Math.sqrt(t)) + jitter(maxRadius * 0.008);
    positions.push({
      x: Math.round(centerX + Math.cos(angle) * radius + jitter(maxRadius * 0.010)),
      y: Math.round(centerY + Math.sin(angle) * radius * 0.84 + jitter(maxRadius * 0.010))
    });
  }

  const basePerArm = Math.floor(remaining / armCount);
  const remainder = remaining % armCount;

  for (let arm = 0; arm < armCount; arm++) {
    const count = basePerArm + (arm < remainder ? 1 : 0);
    const armPhase = jitter(0.09);
    for (let i = 0; i < count; i++) {
      const baseT = count <= 1 ? 0.5 : i / (count - 1);
      const t = Math.max(0, Math.min(1, baseT + jitter(0.010)));
      const radius = maxRadius * (0.20 + 0.75 * t) + jitter(maxRadius * (0.008 + 0.014 * t));
      const turns = 1.08;
      const angle =
        arm * (2 * Math.PI / armCount) +
        t * turns * 2 * Math.PI +
        armPhase +
        jitter(0.035);

      // Just enough drift to make arms look organic, not enough to scatter planets off the spiral.
      const armWidth = maxRadius * (0.014 + 0.030 * t);
      const radialJitter = maxRadius * (0.006 + 0.016 * t);

      positions.push({
        x: Math.round(
          centerX +
          Math.cos(angle) * radius +
          Math.cos(angle + Math.PI / 2) * jitter(armWidth) +
          Math.cos(angle) * jitter(radialJitter)
        ),
        y: Math.round(
          centerY +
          Math.sin(angle) * radius * 0.84 +
          Math.sin(angle + Math.PI / 2) * jitter(armWidth) +
          Math.sin(angle) * jitter(radialJitter) * 0.84
        )
      });
    }
  }

  return spreadApartPositions(positions, centerX, centerY, maxRadius, 58);
}

function createGalaxyPositions(
  nodeCount: number,
  galaxyType: GalaxyType,
  rings: number,
  maxRadius: number,
  centerX: number,
  centerY: number
): GalaxyPoint[] {
  const safeType = galaxyType || 'spiral4';

  if (safeType === 'circular') {
    return getClassicRingPositions(nodeCount, rings, maxRadius, centerX, centerY);
  }

  if (safeType === 'ring') {
    const positions: GalaxyPoint[] = [];
    const coreCount = Math.max(5, Math.round(nodeCount * 0.14));
    for (let i = 0; i < coreCount; i++) {
      const t = coreCount <= 1 ? 0 : i / (coreCount - 1);
      const angle = i * GOLDEN_ANGLE + jitter(0.08);
      const radius = maxRadius * (0.05 + 0.17 * Math.sqrt(t)) + jitter(maxRadius * 0.006);
      positions.push({
        x: Math.round(centerX + Math.cos(angle) * radius + jitter(maxRadius * 0.008)),
        y: Math.round(centerY + Math.sin(angle) * radius * 0.80 + jitter(maxRadius * 0.008))
      });
    }

    const outerCount = nodeCount - coreCount;
    for (let i = 0; i < outerCount; i++) {
      const t = (i + 0.5) / Math.max(1, outerCount);
      const angle = t * Math.PI * 2 + jitter(0.045);
      const radius = maxRadius * (0.76 + Math.random() * 0.10);
      positions.push({
        x: Math.round(centerX + Math.cos(angle) * radius + jitter(maxRadius * 0.010)),
        y: Math.round(centerY + Math.sin(angle) * radius * 0.80 + jitter(maxRadius * 0.010))
      });
    }
    return spreadApartPositions(positions, centerX, centerY, maxRadius, 58);
  }

  if (safeType === 'spiral2') {
    return createSpiralGalaxyPositions(nodeCount, 2, maxRadius, centerX, centerY);
  }
  if (safeType === 'spiral3') {
    return createSpiralGalaxyPositions(nodeCount, 3, maxRadius, centerX, centerY);
  }

  // Default to a 4-arm spiral.
  return createSpiralGalaxyPositions(nodeCount, 4, maxRadius, centerX, centerY);
}

function getHomeworldTarget(
  galaxyType: GalaxyType,
  playerIndex: number,
  playerCount: number,
  maxRadius: number,
  centerX: number,
  centerY: number
) {
  const type = galaxyType || 'spiral4';
  const angle = (playerIndex * 2 * Math.PI) / Math.max(1, playerCount);

  if (type === 'ring') {
    return {
      targetX: centerX + Math.cos(angle) * maxRadius * 0.80,
      targetY: centerY + Math.sin(angle) * maxRadius * 0.64
    };
  }

  if (type === 'circular') {
    return {
      targetX: centerX + Math.cos(angle) * maxRadius * 0.56,
      targetY: centerY + Math.sin(angle) * maxRadius * 0.56
    };
  }

  const armCount = type === 'spiral2' ? 2 : type === 'spiral3' ? 3 : 4;
  const armAngle = (playerIndex % armCount) * (2 * Math.PI / armCount);
  const layer = Math.floor(playerIndex / armCount);
  const angleOffset = layer * 0.22;
  const radius = maxRadius * (0.38 + Math.min(0.18, layer * 0.06));
  const theta = armAngle + 0.45 * Math.PI + angleOffset;

  return {
    targetX: centerX + Math.cos(theta) * radius,
    targetY: centerY + Math.sin(theta) * radius * 0.84
  };
}

export function generateMap(nodeCount: number, players: Player[], npcCount: number, galaxyType: GalaxyType = 'spiral4'): StarNode[] {
  const nodes: StarNode[] = [];
  const rings = getRingCount(nodeCount);
  const maxRadius = getMapLayoutRadius(nodeCount);
  const centerX = 500;
  const centerY = 500;

  // 1. Place systems by galaxy shape. Bigger maps still expand outward so planet spacing stays open.
  const positions = createGalaxyPositions(nodeCount, galaxyType, rings, maxRadius, centerX, centerY);

  for (let nameIndex = 0; nameIndex < nodeCount; nameIndex++) {
    const { x, y } = positions[nameIndex];
    const name = STAR_NAMES[nameIndex % STAR_NAMES.length] +
      (nameIndex >= STAR_NAMES.length ? ` ${Math.floor(nameIndex / STAR_NAMES.length) + 1}` : '');

    nodes.push({
      id: `node-${nameIndex}`,
      name,
      x,
      y,
      links: [],
      claimedBy: null,
      development: 'none',
      resourceGeneration: 1,
      hasShipyard: false,
      hasFtlInhibitor: false,
      hasGateway: false,
      ships: [],
      groundUnits: [],
      groundUnitsBuiltThisTurn: 0,
      isNpcPlanet: false,
      isDysonSphere: false,
      biome: pickBiome(nameIndex)
    });
  }

  // 2. Establish connections (Delaunay-ish Proximity Connections)
  // Guarantee connectivity via Minimum Spanning Tree first
  const distance = (n1: StarNode, n2: StarNode) => 
    Math.sqrt((n1.x - n2.x) ** 2 + (n1.y - n2.y) ** 2);

  // Prim's algorithm for MST
  const inMst = new Set<string>();
  inMst.add(nodes[0].id);

  while (inMst.size < nodes.length) {
    let minD = Infinity;
    let minFrom: StarNode | null = null;
    let minTo: StarNode | null = null;

    for (const node of nodes) {
      if (inMst.has(node.id)) {
        for (const target of nodes) {
          if (!inMst.has(target.id)) {
            const d = distance(node, target);
            if (d < minD) {
              minD = d;
              minFrom = node;
              minTo = target;
            }
          }
        }
      }
    }

    if (minFrom && minTo) {
      minFrom.links.push(minTo.id);
      minTo.links.push(minFrom.id);
      inMst.add(minTo.id);
    }
  }

  // Add extra links to keep it interesting, keeping node degree to 2-3
  for (const node of nodes) {
    if (node.links.length >= 3) continue;

    // Find nearby nodes
    const sortedNeighbors = nodes
      .filter(n => n.id !== node.id && !node.links.includes(n.id))
      .map(n => ({ node: n, dist: distance(node, n) }))
      .sort((a, b) => a.dist - b.dist);

    for (const neighbor of sortedNeighbors) {
      // Connect if the neighbor also has fewer than 3 connections
      if (node.links.length < 3 && neighbor.node.links.length < 3) {
        node.links.push(neighbor.node.id);
        neighbor.node.links.push(node.id);
      }
      if (node.links.length >= 3) break;
    }
  }

  // 3. Set up Player Homeworlds
  // Distribute homeworlds evenly on the middle ring (approx. ring index floor(rings/2))
  const numPlayers = players.length;

  const playerHwNodeIds: string[] = [];

  for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
    const { targetX, targetY } = getHomeworldTarget(galaxyType, pIdx, numPlayers, maxRadius, centerX, centerY);

    // Find closest node that hasn't been claimed yet
    const candidateNodes = nodes
      .filter(n => n.claimedBy === null && !playerHwNodeIds.includes(n.id))
      .map(n => ({ node: n, dist: Math.sqrt((n.x - targetX) ** 2 + (n.y - targetY) ** 2) }))
      .sort((a, b) => a.dist - b.dist);

    if (candidateNodes.length > 0) {
      const hwNode = candidateNodes[0].node;
      hwNode.claimedBy = players[pIdx].id;
      hwNode.development = 'metropolis';
      hwNode.resourceGeneration = 8;
      hwNode.hasShipyard = true;
      
      // Starting fleet
      hwNode.ships = [
        createShip('Destroyer', players[pIdx].id),
        createShip('ColonyShip', players[pIdx].id),
        createShip('Carrier', players[pIdx].id)
      ];

      // Starting ground defense
      hwNode.groundUnits = [
        createGroundUnit(players[pIdx].id)
      ];

      players[pIdx].homeworldId = hwNode.id;
      playerHwNodeIds.push(hwNode.id);
    }
  }

  // 4. Setup Dyson Sphere (Exact center node)
  const centerNode = nodes
    .filter(n => n.claimedBy === null)
    .map(n => ({ node: n, dist: Math.sqrt((n.x - centerX) ** 2 + (n.y - centerY) ** 2) }))
    .sort((a, b) => a.dist - b.dist)[0]?.node;

  if (centerNode) {
    centerNode.name = 'Dyson Prime';
    centerNode.isDysonSphere = true;
    centerNode.isNpcPlanet = true;
    centerNode.biome = 'gas';
    centerNode.resourceGeneration = 15;
    // Guarded by high NPC force
    centerNode.ships = [createShip('BattleShip', 'npc')];
    centerNode.groundUnits = [createGroundUnit('npc'), createGroundUnit('npc')];
  }

  // 5. Setup NPC Planets
  const potentialNpcNodes = nodes.filter(
    n => n.claimedBy === null && !n.isDysonSphere
  );

  // Pick random NPC planets
  const npcNodesSelected = potentialNpcNodes
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(npcCount, potentialNpcNodes.length));

  for (const node of npcNodesSelected) {
    node.isNpcPlanet = true;
    node.name = node.name + ' (NPC)';
    node.ships = [createShip('Destroyer', 'npc')];
    node.groundUnits = [createGroundUnit('npc')];
  }

  return nodes;
}

// Check if a node contains enemy combat ships that create a temporary FTL blockade.
// Destroyers, BattleShips, and Carriers have blocksMovement=true; ColonyShips and Fighters do not.
// A hostile combat ship does not prevent enemies from entering its system, but it stops pathfinding
// from continuing through that system, just like a planet-based FTL inhibitor. This also treats
// NPC/A.I. combat ships as hostile blockers for human players, and human combat ships as blockers
// for NPC/A.I. pathfinding if NPC movement is added later.
export function hasEnemyCombatShips(node: StarNode, playerId: string, state?: Pick<GameState, 'alliances'>): boolean {
  return node.ships.some(s => s.blocksMovement && (state ? isHostileOwner(state, playerId, s.owner) : s.owner !== playerId));
}

export function hasEnemyFtlInhibitor(node: StarNode, playerId: string, state?: Pick<GameState, 'alliances'>): boolean {
  return node.hasFtlInhibitor && node.claimedBy !== null && (state ? isHostileOwner(state, playerId, node.claimedBy) : node.claimedBy !== playerId);
}

// Calculate movement range for a ship using Breadth First Search (BFS)
export function getReachableNodes(
  startNodeId: string, 
  ship: Ship, 
  nodes: StarNode[], 
  playerId: string,
  state?: Pick<GameState, 'alliances'>
): { [nodeId: string]: number } {
  const reachable: { [nodeId: string]: number } = {};
  const queue: { id: string; dist: number }[] = [{ id: startNodeId, dist: 0 }];
  
  const nodeMap = new Map<string, StarNode>(nodes.map(n => [n.id, n]));
  const startNode = nodeMap.get(startNodeId);
  if (startNode && (hasEnemyCombatShips(startNode, playerId, state) || hasEnemyFtlInhibitor(startNode, playerId, state))) {
    // You may retreat only to the immediately previous system you came from.
    const retreatTargetId = ship.lastNodeId ?? null;
    if (retreatTargetId && startNode.links.includes(retreatTargetId)) {
      return { [retreatTargetId]: 1 };
    }
    return {};
  }
  
  // Find all friendly gateways
  const friendlyGateways = new Set(
    nodes.filter(n => n.hasGateway && n.claimedBy === playerId).map(n => n.id)
  );

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    
    if (dist > ship.movesLeft) continue;

    // Record minimum distance to reach this node
    if (reachable[id] === undefined || dist < reachable[id]) {
      reachable[id] = dist;
    }

    const currentNode = nodeMap.get(id);
    if (!currentNode) continue;

    // Determine pathfinding branches. If the node has enemy ships or enemy FTL inhibitor, it blocks movement!
    // The ship can MOVE to this node, but CANNOT pass through it. So we stop branching here.
    const isBlocked = id !== startNodeId && (
      hasEnemyCombatShips(currentNode, playerId, state) || 
      hasEnemyFtlInhibitor(currentNode, playerId, state)
    );

    if (isBlocked) {
      continue; // Terminal node. We can reach it, but cannot move further from it.
    }

    // Normal neighbor nodes
    const neighbors = [...currentNode.links];

    // Gateway jump: if current node has a friendly gateway, add all other friendly gateways as neighbors
    if (currentNode.hasGateway && currentNode.claimedBy === playerId) {
      for (const gwId of friendlyGateways) {
        if (gwId !== id && !neighbors.includes(gwId)) {
          neighbors.push(gwId);
        }
      }
    }

    for (const neighborId of neighbors) {
      const nextDist = dist + 1;
      if (nextDist <= ship.movesLeft) {
        // Queue if it's unvisited or we found a shorter path
        if (reachable[neighborId] === undefined || nextDist < reachable[neighborId]) {
          queue.push({ id: neighborId, dist: nextDist });
        }
      }
    }
  }

  // Remove the starting node from reachable options
  delete reachable[startNodeId];
  return reachable;
}

// Heal units in friendly territory.
// Shipyards repair damaged ships and ground troops to full in one friendly turn.
// Friendly territory without a shipyard repairs more slowly: heavy damage usually takes 3 turns,
// while lighter damage often takes 2 turns.
// Ground troops carried inside carriers heal too while the carrier is parked in friendly territory.
export function processHealing(nodes: StarNode[], activePlayerId: string): string[] {
  const log: string[] = [];

  for (const node of nodes) {
    const isFriendly = node.claimedBy === activePlayerId;
    if (!isFriendly) {
      // Clear territory counters for this player's units in enemy/neutral nodes.
      for (const ship of node.ships) {
        if (ship.owner === activePlayerId) {
          ship.turnsInTerritory = 0;
          for (const fighter of ship.carriedFighters) fighter.turnsInTerritory = 0;
          for (const carried of ship.carriedUnits) carried.turnsInTerritory = 0;
        }
      }
      for (const gu of node.groundUnits) {
        if (gu.owner === activePlayerId) gu.turnsInTerritory = 0;
      }
      continue;
    }

    // Process friendly ships.
    for (const ship of node.ships) {
      if (ship.owner !== activePlayerId) continue;

      const shipHealed = healUnitOneTurn(ship, node.hasShipyard);
      if (shipHealed > 0) {
        log.push(
          ship.hp >= ship.maxHp
            ? `${ship.type} ${node.hasShipyard ? 'repaired to full at the Shipyard' : 'healed to full'} at ${node.name}.`
            : `${ship.type} recovered +${shipHealed} HP at ${node.name}.`
        );
      }

      // Heal legacy carried fighters.
      for (const fighter of ship.carriedFighters) {
        if (fighter.owner !== activePlayerId) continue;
        const fighterHealed = healUnitOneTurn(fighter, node.hasShipyard);
        if (fighterHealed > 0) {
          log.push(
            fighter.hp >= fighter.maxHp
              ? `Fighter carried by Carrier ${node.hasShipyard ? 'repaired to full at the Shipyard' : 'healed to full'} at ${node.name}.`
              : `Fighter carried by Carrier recovered +${fighterHealed} HP at ${node.name}.`
          );
        }
      }

      // Heal carried ground units while the carrier is in friendly territory.
      for (const carried of ship.carriedUnits) {
        if (carried.owner !== activePlayerId) continue;
        const healed = healUnitOneTurn(carried, node.hasShipyard);
        if (healed > 0) {
          log.push(
            carried.hp >= carried.maxHp
              ? `Ground Unit carried by ${ship.type} ${node.hasShipyard ? 'repaired to full at the Shipyard' : 'healed to full'} at ${node.name}.`
              : `Ground Unit carried by ${ship.type} recovered +${healed} HP at ${node.name}.`
          );
        }
      }
    }

    // Process friendly ground units on the planet surface.
    for (const gu of node.groundUnits) {
      if (gu.owner !== activePlayerId) continue;
      const healed = healUnitOneTurn(gu, node.hasShipyard);
      if (healed > 0) {
        log.push(
          gu.hp >= gu.maxHp
            ? `Ground Unit ${node.hasShipyard ? 'repaired to full at the Shipyard' : 'healed to full'} at ${node.name}.`
            : `Ground Unit recovered +${healed} HP at ${node.name}.`
        );
      }
    }
  }

  return log;
}

// Roll random damage within range
const rollDamage = (min: number, max: number) => 
  min === 0 ? 0 : Math.floor(Math.random() * (max - min + 1)) + min;

// Space Combat Resolution
export interface CombatResult {
  attackerDmg: number;
  defenderDmg: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  carriedLossesCount: number;
}

export function resolveSpaceCombat(
  attacker: Ship, 
  defender: Ship, 
  attackerNode: StarNode,
  defenderNode: StarNode
): CombatResult {
  // Carrier fighter screen: carried fighters must be destroyed before the carrier takes hull damage.
  let actualDefender = defender;
  let defenderIsCarriedFighter = false;
  if (defender.type === 'Carrier' && defender.carriedFighters.length > 0 && attacker.owner !== defender.owner) {
    actualDefender = defender.carriedFighters[0];
    defenderIsCarriedFighter = true;
  }

  const attackerCarrier = attackerNode.ships.find(s =>
    s.type === 'Carrier' && s.carriedFighters.some(f => f.id === attacker.id)
  );
  const attackerIsCarriedFighter = Boolean(attackerCarrier);

  const attDmg = rollDamage(attacker.dmgMin, attacker.dmgMax);
  const defDmg = rollDamage(actualDefender.dmgMin, actualDefender.dmgMax);

  attacker.hp = Math.max(0, attacker.hp - defDmg);
  actualDefender.hp = Math.max(0, actualDefender.hp - attDmg);
  
  // Combat resets healing timer
  attacker.turnsInTerritory = 0;
  actualDefender.turnsInTerritory = 0;

  const attackerDestroyed = attacker.hp <= 0;
  const defenderDestroyed = actualDefender.hp <= 0;
  let carriedLossesCount = 0;

  // Handle destruction of Carrier carried units
  if (attackerDestroyed && attacker.type === 'Carrier') {
    carriedLossesCount += attacker.carriedUnits.length + attacker.carriedFighters.length;
    attacker.carriedUnits = [];
    attacker.carriedFighters = [];
  }
  if (defenderDestroyed && defender.type === 'Carrier' && !defenderIsCarriedFighter) {
    carriedLossesCount += defender.carriedUnits.length + defender.carriedFighters.length;
    defender.carriedUnits = [];
    defender.carriedFighters = [];
  }
  if (defenderIsCarriedFighter && defenderDestroyed) {
    defender.carriedFighters = defender.carriedFighters.filter(f => f.id !== actualDefender.id);
  }

  // Remove destroyed ships from respective nodes. Carried fighters live inside their carrier cargo array,
  // so they need to be removed from the carrier instead of from top-level orbiting ships.
  if (attackerDestroyed) {
    if (attackerIsCarriedFighter && attackerCarrier) {
      attackerCarrier.carriedFighters = attackerCarrier.carriedFighters.filter(f => f.id !== attacker.id);
    } else {
      attackerNode.ships = attackerNode.ships.filter(s => s.id !== attacker.id);
    }
  }
  if (defenderDestroyed && !defenderIsCarriedFighter) {
    defenderNode.ships = defenderNode.ships.filter(s => s.id !== defender.id);
  }

  return {
    attackerDmg: attDmg,
    defenderDmg: defDmg,
    attackerDestroyed,
    defenderDestroyed,
    carriedLossesCount
  };
}


export interface OrbitalBombardmentResult {
  state: GameState;
  report: string[];
  destroyed: boolean;
  damage: number;
}

export function canBattleshipBombard(node: StarNode, battleship: Ship, playerId: string, state: Pick<GameState, 'alliances'>): boolean {
  if (battleship.owner !== playerId || battleship.type !== 'BattleShip' || battleship.hp <= 0) return false;
  const isHostilePlanet =
    node.isNpcPlanet ||
    (node.isDysonSphere && (node.claimedBy === null || isHostileOwner(state, playerId, node.claimedBy))) ||
    (node.claimedBy !== null && isHostileOwner(state, playerId, node.claimedBy));
  if (!isHostilePlanet) return false;

  // Bombardment is a pre-invasion action. Once friendly troops are on the surface, fire support stops.
  if (node.groundUnits.some(g => g.owner === playerId)) return false;

  // Orbit must be cleared first.
  const hostileCombatShips = node.ships.some(s =>
    isHostileOwner(state, playerId, s.owner) &&
    s.type !== 'ColonyShip' &&
    (s.blocksMovement || s.type === 'Fighter')
  );
  if (hostileCombatShips) return false;

  return node.groundUnits.some(g => isHostileOwner(state, playerId, g.owner));
}

export function resolveOrbitalBombardment(
  state: GameState,
  nodeId: string,
  battleshipId: string,
  targetGroundUnitId: string,
  playerId: string
): OrbitalBombardmentResult | null {
  const cloned = cloneGameState(state);
  const node = cloned.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const battleship = node.ships.find(s => s.id === battleshipId);
  const target = node.groundUnits.find(g => g.id === targetGroundUnitId);
  if (!battleship || !target) return null;
  if (!canBattleshipBombard(node, battleship, playerId, cloned)) return null;
  if (!isHostileOwner(cloned, playerId, target.owner)) return null;

  const damage = rollDamage(battleship.dmgMin, battleship.dmgMax);
  target.hp = Math.max(0, target.hp - damage);
  target.turnsInTerritory = 0;
  battleship.turnsInTerritory = 0;
  battleship.bombardedThisTurn = true;

  const destroyed = target.hp <= 0;
  if (destroyed) {
    node.groundUnits = node.groundUnits.filter(g => g.id !== target.id);
  }

  const attackerName = cloned.players.find(p => p.id === playerId)?.name || 'Commander';
  const defenderName = target.owner === 'npc'
    ? 'Neutral Guardians'
    : cloned.players.find(p => p.id === target.owner)?.name || 'Enemy';
  const report = [
    `[ORBITAL BOMBARDMENT] ${node.name}: ${attackerName}'s BattleShip bombarded ${defenderName} ground troops for ${damage} damage.`,
    destroyed
      ? `- DESTROYED: Defender ground unit was vaporized from orbit.`
      : `- Defender ground unit HP remaining: ${target.hp}/${target.maxHp}`,
    `- BattleShip systems cycling for the next timed action.`
  ];

  return {
    state: {
      ...cloned,
      nodes: cloned.nodes,
      actionLog: [...cloned.actionLog, ...report],
      lastAction: 'orbital_bombardment',
      lastActionAt: currentTimestamp()
    },
    report,
    destroyed,
    damage
  };
}


// Ground Combat Resolution
export function resolveGroundCombat(
  attacker: GroundUnit, 
  defender: GroundUnit, 
  node: StarNode
): {
  attackerDmg: number;
  defenderDmg: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
} {
  const attDmg = rollDamage(attacker.dmgMin, attacker.dmgMax);
  const defDmg = rollDamage(defender.dmgMin, defender.dmgMax);

  attacker.hp = Math.max(0, attacker.hp - defDmg);
  defender.hp = Math.max(0, defender.hp - attDmg);

  attacker.turnsInTerritory = 0;
  defender.turnsInTerritory = 0;

  const attackerDestroyed = attacker.hp <= 0;
  const defenderDestroyed = defender.hp <= 0;

  if (attackerDestroyed) {
    node.groundUnits = node.groundUnits.filter(g => g.id !== attacker.id);
  }
  if (defenderDestroyed) {
    node.groundUnits = node.groundUnits.filter(g => g.id !== defender.id);
  }

  return {
    attackerDmg: attDmg,
    defenderDmg: defDmg,
    attackerDestroyed,
    defenderDestroyed
  };
}



// Carrier troop transport and invasion helpers. These return a complete new GameState object
// so callers can write the entire JSON document to Supabase atomically.
function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function currentTimestamp() {
  return new Date().toISOString();
}

export function resetGroundUnitBuildCounters(nodes: StarNode[]): StarNode[] {
  return nodes.map(node => ({ ...node, groundUnitsBuiltThisTurn: 0 }));
}

export function countFriendlyGroundUnits(node: StarNode, playerId: string): number {
  return node.groundUnits.filter(g => g.owner === playerId).length;
}

export function canAddFriendlyGroundUnit(node: StarNode, playerId: string): boolean {
  return countFriendlyGroundUnits(node, playerId) < getGroundUnitCapacity(node.development);
}


export function loadGroundUnitToCarrier(
  state: GameState,
  nodeId: string,
  carrierId: string,
  unitId: string,
  playerId: string
): GameState {
  const next = cloneGameState(state);
  const player = next.players.find(p => p.id === playerId);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node || !player) return state;
  if (node.claimedBy !== playerId) return state;

  const unit = node.groundUnits.find(g => g.id === unitId && g.owner === playerId);
  const carrier = node.ships.find(s => s.id === carrierId && s.type === 'Carrier' && s.owner === playerId);
  if (!unit || !carrier) return state;
  if (carrier.carriedUnits.length >= 3) return state;
  if (carrier.carriedUnits.some(g => g.id === unitId)) return state;

  // Atomic sync: remove from planet surface and add to carrier cargo in the same new state.
  node.groundUnits = node.groundUnits.filter(g => g.id !== unitId);
  carrier.carriedUnits = [...carrier.carriedUnits.filter(g => g.id !== unitId), unit];
  next.actionLog = [...next.actionLog, `${player.name}: Loaded Ground Unit into Carrier at ${node.name}.`];
  next.lastAction = 'load_ground_unit';
  next.lastActionAt = currentTimestamp();
  next.lastUpdated = next.lastActionAt;
  return next;
}

export function unloadGroundUnitFromCarrier(
  state: GameState,
  nodeId: string,
  carrierId: string,
  unitId: string,
  playerId: string
): GameState {
  const next = cloneGameState(state);
  const player = next.players.find(p => p.id === playerId);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node || !player) return state;
  if (node.claimedBy !== playerId) return state;

  const carrier = node.ships.find(s => s.id === carrierId && s.type === 'Carrier' && s.owner === playerId);
  const unit = carrier?.carriedUnits.find(g => g.id === unitId);
  if (!carrier || !unit) return state;
  if (countFriendlyGroundUnits(node, playerId) >= getGroundUnitCapacity(node.development) && !node.groundUnits.some(g => g.id === unitId)) return state;

  // Duplication fix: if the ground unit already exists on the node, never append it again.
  const alreadyOnSurface = node.groundUnits.some(g => g.id === unitId);
  carrier.carriedUnits = carrier.carriedUnits.filter(g => g.id !== unitId);
  if (!alreadyOnSurface) {
    node.groundUnits = [...node.groundUnits, unit];
  }

  next.actionLog = [
    ...next.actionLog,
    alreadyOnSurface
      ? `${player.name}: Removed duplicate cargo reference for Ground Unit at ${node.name}.`
      : `${player.name}: Unloaded Ground Unit from Carrier at ${node.name}.`
  ];
  next.lastAction = 'unload_ground_unit';
  next.lastActionAt = currentTimestamp();
  next.lastUpdated = next.lastActionAt;
  return next;
}


export function loadFighterToCarrier(
  state: GameState,
  nodeId: string,
  carrierId: string,
  fighterId: string,
  playerId: string
): GameState {
  const next = cloneGameState(state);
  const player = next.players.find(p => p.id === playerId);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node || !player) return state;
  if (node.claimedBy !== playerId) return state;
  const carrier = node.ships.find(s => s.id === carrierId && s.type === 'Carrier' && s.owner === playerId);
  const fighter = node.ships.find(s => s.id === fighterId && s.type === 'Fighter' && s.owner === playerId);
  if (!carrier || !fighter) return state;
  if (carrier.carriedFighters.length >= 2) return state;
  node.ships = node.ships.filter(s => s.id !== fighterId);
  carrier.carriedFighters = [...carrier.carriedFighters.filter(f => f.id !== fighterId), fighter];
  next.actionLog = [...next.actionLog, `${player.name}: Loaded Fighter into Carrier at ${node.name}.`];
  next.lastAction = 'load_fighter';
  next.lastActionAt = currentTimestamp();
  next.lastUpdated = next.lastActionAt;
  return next;
}

export function unloadFighterFromCarrier(
  state: GameState,
  nodeId: string,
  carrierId: string,
  fighterId: string,
  playerId: string
): GameState {
  const next = cloneGameState(state);
  const player = next.players.find(p => p.id === playerId);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node || !player) return state;
  if (node.claimedBy !== playerId) return state;
  const carrier = node.ships.find(s => s.id === carrierId && s.type === 'Carrier' && s.owner === playerId);
  const fighter = carrier?.carriedFighters.find(f => f.id === fighterId);
  if (!carrier || !fighter) return state;
  carrier.carriedFighters = carrier.carriedFighters.filter(f => f.id !== fighterId);
  if (!node.ships.some(s => s.id === fighterId)) node.ships.push({ ...fighter, movesLeft: 0 });
  next.actionLog = [...next.actionLog, `${player.name}: Launched Fighter from Carrier at ${node.name}.`];
  next.lastAction = 'unload_fighter';
  next.lastActionAt = currentTimestamp();
  next.lastUpdated = next.lastActionAt;
  return next;
}

export interface InvasionResult {
  state: GameState;
  report: string[];
  captured: boolean;
  startedGroundCombat: boolean;
  failed?: boolean;
}

function canInvadeNode(node: StarNode, playerId: string, state?: Pick<GameState, 'alliances'>): boolean {
  const diplomacyState = state || { alliances: [] };
  const hostileOwner = node.claimedBy !== null && isHostileOwner(diplomacyState, playerId, node.claimedBy);
  const unclaimedDysonPrime = node.isDysonSphere && node.claimedBy === null;
  return node.isNpcPlanet || unclaimedDysonPrime || hostileOwner;
}

// Drops every ground unit from every friendly carrier over the selected enemy/NPC planet.
// If no defenders are present, the planet is captured immediately. If defenders exist,
// the deployed units remain on the surface and the combat panel resolves the ground battle.
export function invadePlanetWithCarriers(
  state: GameState,
  nodeId: string,
  playerId: string
): InvasionResult {
  const next = cloneGameState(state);
  const player = next.players.find(p => p.id === playerId);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node || !player) {
    return { state, report: [], captured: false, startedGroundCombat: false };
  }

  const enemyCombatShips = node.ships.some(s => s.blocksMovement && isHostileOwner(next, playerId, s.owner));
  const carriers = node.ships.filter(s => s.owner === playerId && s.type === 'Carrier' && s.carriedUnits.length > 0);
  const totalTroops = carriers.reduce((sum, carrier) => sum + carrier.carriedUnits.length, 0);

  if (!canInvadeNode(node, playerId, next) || enemyCombatShips || totalTroops === 0) {
    return { state, report: [], captured: false, startedGroundCombat: false };
  }

  const deployingById = new Map<string, GroundUnit>();
  for (const carrier of carriers) {
    for (const unit of carrier.carriedUnits) {
      if (unit.owner === playerId && !deployingById.has(unit.id)) {
        deployingById.set(unit.id, unit);
      }
    }
  }
  const deploying = Array.from(deployingById.values());
  const deployingIds = new Set(deploying.map(g => g.id));
  const defenderCountBeforeDeploy = node.groundUnits.filter(g => isHostileOwner(next, playerId, g.owner)).length;

  // Atomic sync: remove every deployed unit from every carrier and add each unit once to the node.
  // This also cleans up any older duplicate cargo references from previous saves.
  for (const carrier of carriers) {
    carrier.carriedUnits = [];
  }
  node.groundUnits = [
    ...node.groundUnits.filter(g => !deployingIds.has(g.id)),
    ...deploying
  ];

  const report = [
    `${player.name}: Invaded ${node.name} with ${deploying.length} Ground Unit(s) from ${carriers.length} Carrier(s).`
  ];
  let captured = false;
  let startedGroundCombat = false;

  if (defenderCountBeforeDeploy === 0) {
    node.claimedBy = playerId;
    node.isNpcPlanet = false;
    captured = true;
    report.push(`Planet captured! ${node.name} is now controlled by ${player.name}.`);
  } else {
    startedGroundCombat = true;
    report.push(`Ground combat has begun on ${node.name}. Select one invading troop and one defending troop, then attack.`);
  }

  next.actionLog = [...next.actionLog, ...report];
  next.lastAction = 'invade_planet';
  next.lastActionAt = currentTimestamp();
  next.lastUpdated = next.lastActionAt;
  return { state: next, report, captured, startedGroundCombat };
}

// Backwards-compatible single-carrier helper. The current UI uses invadePlanetWithCarriers.
export function invadePlanetWithCarrier(
  state: GameState,
  nodeId: string,
  carrierId: string,
  playerId: string
): GameState {
  const next = cloneGameState(state);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node) return state;
  // Keep old call behavior by only allowing the named carrier to deploy.
  const carrier = node.ships.find(s => s.id === carrierId && s.owner === playerId && s.type === 'Carrier');
  if (!carrier || carrier.carriedUnits.length === 0) return state;
  const otherCarrierCargo = node.ships
    .filter(s => s.id !== carrierId && s.owner === playerId && s.type === 'Carrier')
    .map(s => ({ ship: s, carriedUnits: [...s.carriedUnits] }));
  for (const entry of otherCarrierCargo) entry.ship.carriedUnits = [];
  const result = invadePlanetWithCarriers(next, nodeId, playerId).state;
  const resultNode = result.nodes.find(n => n.id === nodeId);
  if (resultNode) {
    for (const entry of otherCarrierCargo) {
      const resultShip = resultNode.ships.find(s => s.id === entry.ship.id);
      if (resultShip) resultShip.carriedUnits = entry.carriedUnits;
      resultNode.groundUnits = resultNode.groundUnits.filter(g => !entry.carriedUnits.some(u => u.id === g.id));
    }
  }
  return result;
}

export interface GroundCombatRoundResult {
  state: GameState;
  report: string[];
  attackerDmg: number;
  defenderDmg: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  captured: boolean;
  failed: boolean;
}

export function resolveGroundCombatRound(
  state: GameState,
  nodeId: string,
  attackerUnitId: string,
  defenderUnitId: string,
  playerId: string
): GroundCombatRoundResult | null {
  const next = cloneGameState(state);
  const player = next.players.find(p => p.id === playerId);
  const node = next.nodes.find(n => n.id === nodeId);
  if (!node || !player) return null;

  const enemyCombatShips = node.ships.some(s => s.blocksMovement && isHostileOwner(next, playerId, s.owner));
  if (enemyCombatShips) return null;

  const attacker = node.groundUnits.find(g => g.id === attackerUnitId && g.owner === playerId);
  const defender = node.groundUnits.find(g => g.id === defenderUnitId && isHostileOwner(next, playerId, g.owner));
  if (!attacker || !defender) return null;

  const result = resolveGroundCombat(attacker, defender, node);
  const remainingAttackers = node.groundUnits.filter(g => g.owner === playerId);
  const remainingDefenders = node.groundUnits.filter(g => isHostileOwner(next, playerId, g.owner));
  const captured = remainingDefenders.length === 0 && remainingAttackers.length > 0;
  const failed = remainingAttackers.length === 0 && !captured;

  const report = [
    `[GROUND COMBAT] ${node.name}: invading troop attacked defending garrison.`,
    `- Invader dealt ${result.attackerDmg} damage${result.defenderDestroyed ? ' and destroyed the defender' : ` (defender HP: ${defender.hp}/${defender.maxHp})`}.`,
    `- Defender dealt ${result.defenderDmg} damage${result.attackerDestroyed ? ' and destroyed the attacker' : ` (attacker HP: ${attacker.hp}/${attacker.maxHp})`}.`
  ];

  if (captured) {
    node.claimedBy = playerId;
    node.isNpcPlanet = false;
    report.push(`Planet captured! ${node.name} is now controlled by ${player.name}.`);
  } else if (failed) {
    report.push(`Invasion failed. ${node.name} remains under its current control.`);
  }

  next.actionLog = [...next.actionLog, ...report];
  next.lastAction = captured ? 'planet_captured_ground_combat' : failed ? 'invasion_failed' : 'ground_combat_round';
  next.lastActionAt = currentTimestamp();
  next.lastUpdated = next.lastActionAt;

  return {
    state: next,
    report,
    attackerDmg: result.attackerDmg,
    defenderDmg: result.defenderDmg,
    attackerDestroyed: result.attackerDestroyed,
    defenderDestroyed: result.defenderDestroyed,
    captured,
    failed
  };
}

// Check Win Conditions
// 1. Domination: Claim 70% or more of the map nodes
// 2. Eradication: Destroy all enemy homeworld nodes (homeworld claimed by others)
export function checkWinCondition(state: GameState): Player | null {
  const totalNodes = state.nodes.length;
  if (totalNodes === 0) return null;

  // Calculate claimed nodes per player
  const claims: { [playerId: string]: number } = {};
  for (const player of state.players) {
    claims[player.id] = 0;
  }

  for (const node of state.nodes) {
    if (node.claimedBy && claims[node.claimedBy] !== undefined) {
      claims[node.claimedBy]++;
    }
  }

  // 1. Domination check
  for (const player of state.players) {
    const claimRatio = claims[player.id] / totalNodes;
    if (claimRatio >= 0.7) {
      return player;
    }
  }

  // 2. Eradication check: has anyone lost their homeworld AND has no other ways to survive?
  // Let's look at owners of homeworld nodes
  const hwOwners = new Set(
    state.players.map(p => {
      const hwNode = state.nodes.find(n => n.id === p.homeworldId);
      return hwNode?.claimedBy;
    }).filter(Boolean)
  );

  const activePlayers = state.players.filter(p => hwOwners.has(p.id));
  if (activePlayers.length === 1 && state.players.length > 1) {
    // Only one player still owns their homeworld! They win.
    return activePlayers[0];
  }

  return null;
}
export const REALTIME_INCOME_INTERVAL_SECONDS = 20;

export function processRealtimeIncome(state: GameState, nowMs = Date.now()): { state: GameState; changed: boolean } {
  if (state.status !== 'playing') return { state, changed: false };

  const lastMs = state.realtimeIncomeLastAt
    ? new Date(state.realtimeIncomeLastAt).getTime()
    : nowMs;
  const elapsedSeconds = Math.floor((nowMs - lastMs) / 1000);
  if (elapsedSeconds < REALTIME_INCOME_INTERVAL_SECONDS) {
    if (!state.realtimeIncomeLastAt) {
      return {
        state: { ...state, realtimeIncomeLastAt: new Date(nowMs).toISOString() },
        changed: true
      };
    }
    return { state, changed: false };
  }

  const ticks = Math.min(3, Math.floor(elapsedSeconds / REALTIME_INCOME_INTERVAL_SECONDS));
  let nodes = state.nodes.map(node => ({
    ...node,
    ships: node.ships.map(ship => ({
      ...ship,
      carriedUnits: ship.carriedUnits.map(unit => ({ ...unit })),
      carriedFighters: ship.carriedFighters.map(fighter => ({ ...fighter }))
    })),
    groundUnits: node.groundUnits.map(unit => ({ ...unit }))
  }));
  const actionLog = [...state.actionLog];

  for (let tick = 0; tick < ticks; tick++) {
    for (const player of state.players) {
      actionLog.push(...processHealing(nodes, player.id).map(line => `[REAL TIME] ${line}`));
    }
  }

  const players = state.players.map(player => {
    const fullIncome = nodes.reduce((sum, node) => sum + getEffectiveResourceGeneration(node, player.id), 0);
    const incomePerTick = Math.max(1, Math.ceil(fullIncome / 2));
    return { ...player, resources: player.resources + incomePerTick * ticks };
  });

  if (ticks > 0) {
    actionLog.push(`[REAL TIME] Sector economy paid out ${ticks} income tick${ticks > 1 ? 's' : ''}.`);
  }

  return {
    state: {
      ...state,
      nodes,
      players,
      actionLog: actionLog.slice(-80),
      realtimeIncomeLastAt: new Date(lastMs + ticks * REALTIME_INCOME_INTERVAL_SECONDS * 1000).toISOString(),
      lastAction: 'realtime_income_tick',
      lastActionAt: new Date(nowMs).toISOString(),
      lastUpdated: new Date(nowMs).toISOString()
    },
    changed: true
  };
}


