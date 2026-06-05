import type { GameState, StarNode, Ship, GroundUnit, Player, PlanetDevelopment, PlanetBiome } from '../types';

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
    movesLeft: type === 'Fighter' ? 0 : 6,
    turnsInTerritory: 0,
    carriedUnits: [],
    carriedFighters: [],
    lastNodeId: null
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

// Generate the Map using concentric rings
export function generateMap(nodeCount: number, players: Player[], npcCount: number): StarNode[] {
  const nodes: StarNode[] = [];
  const rings = Math.ceil(Math.sqrt(nodeCount / 3));
  const maxRadius = 450;
  const centerX = 500;
  const centerY = 500;

  // 1. Calculate node distribution per ring
  // Outer rings get more nodes (proportional to ring index)
  let ringWeightsSum = 0;
  for (let r = 1; r <= rings; r++) {
    ringWeightsSum += r;
  }

  const nodesPerRing: number[] = [];
  let allocated = 0;
  for (let r = 1; r <= rings; r++) {
    let count = Math.round(nodeCount * (r / ringWeightsSum));
    if (r === rings) {
      count = nodeCount - allocated; // Final ring takes remainder
    } else {
      allocated += count;
    }
    nodesPerRing.push(count);
  }

  // Ensure center node has 1 node if needed, or ring 1 is small
  if (nodesPerRing[0] === 0) nodesPerRing[0] = 1;

  // Let's name and position the nodes
  let nameIndex = 0;
  for (let rIndex = 0; rIndex < rings; rIndex++) {
    const ringNum = rIndex + 1;
    const radius = (ringNum / rings) * maxRadius;
    const count = nodesPerRing[rIndex];
    
    // Add angular perturbation to make map organic
    const angleOffset = (ringNum * Math.PI) / rings;

    for (let j = 0; j < count; j++) {
      const angle = (j * 2 * Math.PI) / count + angleOffset;
      // Add slight noise to x/y to prevent perfect circles
      const x = Math.round(centerX + Math.cos(angle) * radius + (Math.random() * 20 - 10));
      const y = Math.round(centerY + Math.sin(angle) * radius + (Math.random() * 20 - 10));

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
      nameIndex++;
    }
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
  const hwRingIndex = Math.max(0, Math.floor(rings / 3.0));
  const hwRingRadius = ((hwRingIndex + 1) / rings) * maxRadius;
  const numPlayers = players.length;

  const playerHwNodeIds: string[] = [];

  for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
    const hwAngle = (pIdx * 2 * Math.PI) / numPlayers;
    const targetX = centerX + Math.cos(hwAngle) * hwRingRadius;
    const targetY = centerY + Math.sin(hwAngle) * hwRingRadius;

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

  // Remove destroyed ships from respective nodes
  if (attackerDestroyed) {
    attackerNode.ships = attackerNode.ships.filter(s => s.id !== attacker.id);
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
  if (node.claimedBy !== playerId || next.phase !== 1 || next.players[next.activePlayerIndex]?.id !== playerId) return state;

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
  if (node.claimedBy !== playerId || next.phase !== 1 || next.players[next.activePlayerIndex]?.id !== playerId) return state;

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
  if (node.claimedBy !== playerId || next.phase !== 1 || next.players[next.activePlayerIndex]?.id !== playerId) return state;
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
  if (node.claimedBy !== playerId || next.phase !== 1 || next.players[next.activePlayerIndex]?.id !== playerId) return state;
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
  return node.isNpcPlanet || (node.claimedBy !== null && isHostileOwner(state || { alliances: [] }, playerId, node.claimedBy));
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

  const isActive = next.players[next.activePlayerIndex]?.id === playerId;
  const enemyCombatShips = node.ships.some(s => s.blocksMovement && isHostileOwner(next, playerId, s.owner));
  const carriers = node.ships.filter(s => s.owner === playerId && s.type === 'Carrier' && s.carriedUnits.length > 0);
  const totalTroops = carriers.reduce((sum, carrier) => sum + carrier.carriedUnits.length, 0);

  if (!isActive || next.phase !== 2 || !canInvadeNode(node, playerId, next) || enemyCombatShips || totalTroops === 0) {
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

  const isActive = next.players[next.activePlayerIndex]?.id === playerId;
  const enemyCombatShips = node.ships.some(s => s.blocksMovement && isHostileOwner(next, playerId, s.owner));
  if (!isActive || next.phase !== 2 || enemyCombatShips) return null;

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
