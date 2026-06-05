import type { GameState, GroundUnit, Player, Ship, StarNode } from '../types';
import { createGroundUnit, createShip, getPlanetResourceGeneration } from './gameLogic';

export const TUTORIAL_PLAYER_ID = 'tutorial-player';
export const TUTORIAL_ENEMY_ID = 'tutorial-enemy';

export type TutorialScenarioId = 'colonize' | 'movement' | 'development' | 'space-combat' | 'invasion' | 'advanced';

const tutorialPlayers: Player[] = [
  {
    id: TUTORIAL_PLAYER_ID,
    name: 'You',
    color: 'green',
    ready: true,
    resources: 40,
    isNpc: false,
    homeworldId: 't-home',
    playerNumber: 1,
    uuid: TUTORIAL_PLAYER_ID
  },
  {
    id: TUTORIAL_ENEMY_ID,
    name: 'Rival Empire',
    color: 'purple',
    ready: true,
    resources: 40,
    isNpc: false,
    homeworldId: 't-enemy-home',
    playerNumber: 2,
    uuid: TUTORIAL_ENEMY_ID
  }
];

function makeNode(overrides: Partial<StarNode> & Pick<StarNode, 'id' | 'name' | 'x' | 'y'>): StarNode {
  const development = overrides.development ?? 'none';
  return {
    id: overrides.id,
    name: overrides.name,
    x: overrides.x,
    y: overrides.y,
    links: overrides.links ?? [],
    claimedBy: overrides.claimedBy ?? null,
    development,
    resourceGeneration: overrides.resourceGeneration ?? getPlanetResourceGeneration(development),
    hasShipyard: overrides.hasShipyard ?? false,
    hasFtlInhibitor: overrides.hasFtlInhibitor ?? false,
    hasGateway: overrides.hasGateway ?? false,
    ships: overrides.ships ?? [],
    groundUnits: overrides.groundUnits ?? [],
    groundUnitsBuiltThisTurn: overrides.groundUnitsBuiltThisTurn ?? 0,
    isNpcPlanet: overrides.isNpcPlanet ?? false,
    isDysonSphere: overrides.isDysonSphere ?? false
  };
}

function ship(type: Ship['type'], owner = TUTORIAL_PLAYER_ID, hp?: number): Ship {
  const created = createShip(type, owner);
  return hp === undefined ? created : { ...created, hp: Math.min(hp, created.maxHp) };
}

function troop(owner = TUTORIAL_PLAYER_ID, hp?: number): GroundUnit {
  const created = createGroundUnit(owner);
  return hp === undefined ? created : { ...created, hp: Math.min(hp, created.maxHp) };
}

function withCargo(carrier: Ship, count: number, owner = TUTORIAL_PLAYER_ID): Ship {
  return {
    ...carrier,
    carriedUnits: Array.from({ length: count }, () => troop(owner)),
    carriedFighters: []
  };
}

function baseState(id: TutorialScenarioId, phase: 0 | 1 | 2, nodes: StarNode[], resources = 40): GameState {
  const players = tutorialPlayers.map((p, index) => ({
    ...p,
    resources: index === 0 ? resources : 40,
    homeworldId: index === 0 ? 't-home' : 't-enemy-home'
  }));

  return {
    roomId: `TUTORIAL-${id}`,
    name: `Tutorial: ${tutorialScenarioMeta[id].title}`,
    creatorId: TUTORIAL_PLAYER_ID,
    maxPlayers: 2,
    mapSize: 'small',
    npcCount: 0,
    status: 'playing',
    players,
    activePlayerIndex: 0,
    phase,
    nodes,
    turnNumber: 1,
    actionLog: [
      `=== TUTORIAL SCENARIO: ${tutorialScenarioMeta[id].title.toUpperCase()} ===`,
      tutorialScenarioMeta[id].objective,
      ...tutorialScenarioMeta[id].steps.map((step, index) => `${index + 1}. ${step}`)
    ],
    winnerId: null,
    chat: [],
    lastUpdated: new Date().toISOString(),
    lastAction: `tutorial_${id}`,
    lastActionAt: new Date().toISOString(),
    turnStartedAt: new Date().toISOString(),
    tutorialScenario: {
      id,
      title: tutorialScenarioMeta[id].title,
      objective: tutorialScenarioMeta[id].objective,
      steps: tutorialScenarioMeta[id].steps
    }
  };
}

const linked = (...ids: string[]) => ids;

export const tutorialScenarioMeta: Record<TutorialScenarioId, { title: string; objective: string; steps: string[] }> = {
  colonize: {
    title: 'Colonizing a New Planet',
    objective: 'Move a Colony Ship to an empty planet, then colonize it in the Action phase.',
    steps: [
      'Click New Dawn, select the ColonyShip, and press Move.',
      'Click Vega Outpost on the map to move the ColonyShip there.',
      'Press Next Phase to enter the Action phase.',
      'Click Vega Outpost, open Orbit Fleets, and press Colonize.'
    ]
  },
  movement: {
    title: 'Ship Movement Basics',
    objective: 'Move a Destroyer to the rally point and notice that enemy combat ships block travel through their system.',
    steps: [
      'Click New Dawn and select the Destroyer.',
      'Move it toward the glowing Rally Point.',
      'Try planning around the Rival Blockade: you can enter that system, but cannot pass through it while hostile combat ships remain.'
    ]
  },
  development: {
    title: 'Development & Ground Troops',
    objective: 'Upgrade a Colony into a City and build Ground Units from that City.',
    steps: [
      'Click Frontier Colony and open Infrastructure.',
      'Press Upgrade Planet to turn the Colony into a City.',
      'Press Build Ground Unit (3R). The build counter should update immediately.'
    ]
  },
  'space-combat': {
    title: 'Space Combat',
    objective: 'Use your ships to destroy the enemy ship in orbit.',
    steps: [
      'Click Battle Zone and open Combat Area.',
      'Select one of your attacking ships.',
      'Select the enemy Destroyer as the target.',
      'Click Initialize Space Battle until the enemy ship is destroyed.'
    ]
  },
  invasion: {
    title: 'Planet Invasion',
    objective: 'Drop carrier troops onto an NPC planet, win ground combat, and capture it.',
    steps: [
      'Click Garrison World and open Combat Area.',
      'Press Invade Planet. All carrier troops will drop to the surface.',
      'Select one invading troop and one defender troop.',
      'Click Attack With Selected Troop until all defenders are destroyed. The planet should flip to your color.'
    ]
  },
  advanced: {
    title: 'Advanced Strategy',
    objective: 'Practice FTL inhibitors, shipyard repair, chokepoints, and invasion timing.',
    steps: [
      'Click Bastion Gate to see a friendly FTL inhibitor and shipyard chokepoint.',
      'Move your Destroyer to the front and compare blocked routes through enemy combat ships.',
      'Damaged friendly ships and troops at Bastion Gate will repair to full on your next friendly turn because it has a Shipyard.'
    ]
  }
};

function createColonizeScenario(): GameState {
  const home = makeNode({
    id: 't-home',
    name: 'New Dawn',
    x: 280,
    y: 500,
    links: linked('t-vega'),
    claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city',
    resourceGeneration: 4,
    hasShipyard: true,
    ships: [ship('ColonyShip')],
    groundUnits: [troop()]
  });
  const vega = makeNode({ id: 't-vega', name: 'Vega Outpost', x: 520, y: 500, links: linked('t-home', 't-empty') });
  const empty = makeNode({ id: 't-empty', name: 'Deep Survey Point', x: 740, y: 520, links: linked('t-vega') });
  return baseState('colonize', 1, [home, vega, empty], 20);
}

function createMovementScenario(): GameState {
  const home = makeNode({
    id: 't-home', name: 'New Dawn', x: 220, y: 500, links: linked('t-mid'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', resourceGeneration: 4, hasShipyard: true, ships: [ship('Destroyer')], groundUnits: [troop()]
  });
  const mid = makeNode({ id: 't-mid', name: 'Open Lane', x: 430, y: 500, links: linked('t-home', 't-rally', 't-blockade') });
  const rally = makeNode({ id: 't-rally', name: 'Rally Point', x: 650, y: 470, links: linked('t-mid') });
  const blockade = makeNode({
    id: 't-blockade', name: 'Rival Blockade', x: 650, y: 610, links: linked('t-mid', 't-behind'), claimedBy: TUTORIAL_ENEMY_ID,
    development: 'colony', resourceGeneration: 2, ships: [ship('Destroyer', TUTORIAL_ENEMY_ID)]
  });
  const behind = makeNode({ id: 't-behind', name: 'Behind the Blockade', x: 850, y: 610, links: linked('t-blockade') });
  return baseState('movement', 1, [home, mid, rally, blockade, behind], 20);
}

function createDevelopmentScenario(): GameState {
  const home = makeNode({
    id: 't-home', name: 'Capital', x: 250, y: 500, links: linked('t-frontier'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'metropolis', resourceGeneration: 8, hasShipyard: true, ships: [ship('Destroyer')], groundUnits: [troop()]
  });
  const frontier = makeNode({
    id: 't-frontier', name: 'Frontier Colony', x: 540, y: 500, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'colony', resourceGeneration: 2, ships: [], groundUnits: [], groundUnitsBuiltThisTurn: 0
  });
  return baseState('development', 0, [home, frontier], 16);
}

function createSpaceCombatScenario(): GameState {
  const battle = makeNode({
    id: 't-home', name: 'Battle Zone', x: 500, y: 500, links: linked('t-enemy-home'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', resourceGeneration: 4, hasShipyard: false,
    ships: [ship('Destroyer'), ship('BattleShip'), ship('Destroyer', TUTORIAL_ENEMY_ID, 8)],
    groundUnits: [troop()]
  });
  const enemyHome = makeNode({
    id: 't-enemy-home', name: 'Rival Base', x: 760, y: 500, links: linked('t-home'), claimedBy: TUTORIAL_ENEMY_ID,
    development: 'city', resourceGeneration: 4, ships: [], groundUnits: [troop(TUTORIAL_ENEMY_ID)]
  });
  return baseState('space-combat', 2, [battle, enemyHome], 20);
}

function createInvasionScenario(): GameState {
  const carrier = withCargo(ship('Carrier'), 3);
  const target = makeNode({
    id: 't-home', name: 'Garrison World', x: 500, y: 500, links: linked('t-staging'), claimedBy: 'npc',
    development: 'city', resourceGeneration: 4, isNpcPlanet: true,
    ships: [carrier],
    groundUnits: [troop('npc', 7), troop('npc', 8)]
  });
  const staging = makeNode({
    id: 't-staging', name: 'Staging Base', x: 250, y: 500, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', resourceGeneration: 4, hasShipyard: true, ships: [], groundUnits: [troop()]
  });
  return baseState('invasion', 2, [target, staging], 20);
}

function createAdvancedScenario(): GameState {
  const damagedDestroyer = ship('Destroyer', TUTORIAL_PLAYER_ID, 5);
  const home = makeNode({
    id: 't-home', name: 'Bastion Gate', x: 260, y: 500, links: linked('t-choke'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'metropolis', resourceGeneration: 8, hasShipyard: true, hasFtlInhibitor: true,
    ships: [damagedDestroyer, withCargo(ship('Carrier'), 2)], groundUnits: [troop(TUTORIAL_PLAYER_ID, 4)]
  });
  const choke = makeNode({ id: 't-choke', name: 'Chokepoint Lane', x: 500, y: 500, links: linked('t-home', 't-enemy-home') });
  const enemy = makeNode({
    id: 't-enemy-home', name: 'Enemy Bulwark', x: 760, y: 500, links: linked('t-choke'), claimedBy: TUTORIAL_ENEMY_ID,
    development: 'city', resourceGeneration: 4, hasFtlInhibitor: true,
    ships: [ship('Destroyer', TUTORIAL_ENEMY_ID), ship('Carrier', TUTORIAL_ENEMY_ID)],
    groundUnits: [troop(TUTORIAL_ENEMY_ID)]
  });
  return baseState('advanced', 1, [home, choke, enemy], 20);
}

export function createTutorialScenario(id: TutorialScenarioId): GameState {
  switch (id) {
    case 'colonize': return createColonizeScenario();
    case 'movement': return createMovementScenario();
    case 'development': return createDevelopmentScenario();
    case 'space-combat': return createSpaceCombatScenario();
    case 'invasion': return createInvasionScenario();
    case 'advanced': return createAdvancedScenario();
    default: return createColonizeScenario();
  }
}
