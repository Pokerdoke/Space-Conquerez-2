import type { Alliance, GameState, GroundUnit, Player, Ship, StarNode } from '../types';
import { createGroundUnit, createShip, getPlanetResourceGeneration } from './gameLogic';

export const TUTORIAL_PLAYER_ID = 'tutorial-player';
export const TUTORIAL_ENEMY_ID = 'tutorial-enemy';

export type TutorialScenarioId =
  | 'real-time-basics'
  | 'colonize'
  | 'development-economy'
  | 'infrastructure'
  | 'fleet-controls'
  | 'space-combat'
  | 'invasion'
  | 'orbital-bombardment'
  | 'diplomacy-upkeep'
  | 'advanced-warfare';

export type TutorialScenarioMeta = {
  title: string;
  intro: string;
  objective: string;
  steps: string[];
};

const tutorialPlayers: Player[] = [
  {
    id: TUTORIAL_PLAYER_ID,
    name: 'You',
    color: 'green',
    ready: true,
    resources: 80,
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
    resources: 80,
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
    isDysonSphere: overrides.isDysonSphere ?? false,
    biome: overrides.biome ?? 'continental'
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

function baseState(
  id: TutorialScenarioId,
  nodes: StarNode[],
  resources = 80,
  alliances: Alliance[] = []
): GameState {
  const now = new Date().toISOString();
  const meta = tutorialScenarioMeta[id];
  const players = tutorialPlayers.map((p, index) => ({
    ...p,
    resources: index === 0 ? resources : 80,
    homeworldId: index === 0 ? 't-home' : 't-enemy-home'
  }));

  return {
    roomId: `TUTORIAL-${id}`,
    name: `Tutorial: ${meta.title}`,
    creatorId: TUTORIAL_PLAYER_ID,
    maxPlayers: 2,
    mapSize: 'small',
    galaxyType: 'spiral4',
    npcCount: 0,
    isPublic: false,
    status: 'playing',
    stateVersion: 1,
    players,
    activePlayerIndex: 0,
    phase: 0,
    nodes,
    turnNumber: 1,
    actionLog: [
      `=== TUTORIAL SCENARIO: ${meta.title.toUpperCase()} ===`,
      meta.intro,
      meta.objective,
      ...meta.steps.map((step, index) => `${index + 1}. ${step}`)
    ],
    winnerId: null,
    chat: [],
    alliances,
    lastUpdated: now,
    lastAction: `tutorial_${id}`,
    lastActionAt: now,
    turnStartedAt: now,
    realtimeIncomeLastAt: now,
    activeCombatNodeId: null,
    activeCombatSummary: undefined,
    pendingActions: [],
    tutorialScenario: {
      id,
      title: meta.title,
      objective: meta.objective,
      steps: meta.steps,
      intro: meta.intro
    }
  };
}

const linked = (...ids: string[]) => ids;

export const tutorialScenarioMeta: Record<TutorialScenarioId, TutorialScenarioMeta> = {
  'real-time-basics': {
    title: 'Real-Time Command Basics',
    intro: 'This tutorial starts from the new real-time version of the game. There are no old turn phases to wait through; building, movement, combat, income, cooldowns, and queues all keep running while players make choices.',
    objective: 'Learn how to read timers, income, queued actions, and the selected planet panels in the real-time game.',
    steps: [
      'Click Helios Command and look at the sidebar. The same planet can show Orbital Fleet, Infrastructure, and Combat Area information at the same time.',
      'Hover over Credits in the top HUD to see gross revenue, ship upkeep, army upkeep, and net income.',
      'Build any cheap ship or ground unit and watch it enter the real-time work queue instead of waiting for a turn to end.',
      'Notice that income keeps ticking while you are looking around the map.',
      'Use the Exit Tutorial button at the top whenever you want to leave the playable lesson.'
    ]
  },
  colonize: {
    title: 'Real-Time Colonization',
    intro: 'Colony Ships still claim empty systems, but movement and colonization now run as timed real-time actions. You can issue other orders while the ship is travelling or colonizing.',
    objective: 'Move a Colony Ship to a neutral planet and colonize it without using the old phase system.',
    steps: [
      'Click New Dawn and select the ColonyShip in Orbital Fleet.',
      'Press Move, then click Vega Outpost on the map. The ship should enter a movement timer.',
      'When the ship arrives, click Vega Outpost and use Colonize Planet.',
      'The planet becomes yours, loses neutral ownership, and starts producing future income.',
      'Try queueing another action from New Dawn while colonization is still running.'
    ]
  },
  'development-economy': {
    title: 'Development, Surrounding Planets & Economy',
    intro: 'High-level planets now require support from surrounding owned planets. To upgrade into Arcology or Coreworld levels, the linked friendly planets around it must already be developed enough.',
    objective: 'Practice the new development chain and see how nearby upgraded worlds unlock stronger core planets.',
    steps: [
      'Click Capital Arcology and open Infrastructure. Its linked planets are already Arcologies, so it can upgrade toward Coreworld if you have enough credits.',
      'Click Frontier City and compare it with the upgraded surrounding planets.',
      'Upgrade a planet and watch the timer queue below the build menu.',
      'Hover Credits to compare revenue before and after development finishes.',
      'Remember: strong economy pays for fleets, but ship and troop upkeep lowers your net income.'
    ]
  },
  infrastructure: {
    title: 'Infrastructure, Shipyards, FTL & Gateways',
    intro: 'Infrastructure is how you turn planets into useful bases. Shipyards build and repair ships, FTL inhibitors make chokepoints harder to pass, and Gateways create faster strategic routes.',
    objective: 'Use infrastructure buttons and learn why front-line planets matter.',
    steps: [
      'Click Forge Station and open Infrastructure.',
      'Queue a Shipyard, FTL Inhibitor, or Gateway. Infrastructure jobs share one planet queue so the menu should not jump around.',
      'Click Bastion Gate to see a completed Shipyard and FTL inhibitor guarding a chokepoint.',
      'Damaged friendly units repair in friendly territory, but ships cannot heal while hostile ships are in orbit.',
      'Use front-line Shipyards so reinforcements do not have to travel from your homeworld.'
    ]
  },
  'fleet-controls': {
    title: 'Fleet Controls, Ship Types & Carriers',
    intro: 'Large fleets are easier to control now. You can move every ship from a planet, move only one ship type, use fleet dropdowns, and fully load carriers from ground troops on the planet.',
    objective: 'Practice mass movement, ship-type movement, and carrier loading.',
    steps: [
      'Click Rally Shipyard and open Orbital Fleet.',
      'Use the fleet dropdown arrow to expand or collapse ship lists.',
      'Try Move All Ships to move the whole fleet to Forward Beacon.',
      'Try ship-type movement buttons such as Move all BattleShips, Move all Destroyers, Move all Carriers, or Move all Colony Ships.',
      'Select the Carrier and press Fully Load Carrier to instantly load up to 3 ground troops from the planet.'
    ]
  },
  'space-combat': {
    title: 'Timed Auto Space Combat',
    intro: 'Space battles are no longer instant. Auto attack fires in timed rounds so a big fight can last long enough for reinforcements to arrive. Pressing the button again stops the auto attack.',
    objective: 'Use automatic space combat until orbit is clear, then stop or send reinforcements.',
    steps: [
      'Click Clash Point and open Combat Area.',
      'Press Auto Attack Until Orbit Clear. The button should change to Stop Auto Attack.',
      'Auto attack prioritizes Battleships, then Destroyers, then Fighters, then other ships.',
      'Watch the combat icon and damage update over timed rounds instead of resolving instantly.',
      'Click Stop Auto Attack if you want to pause the battle and wait for reinforcements.'
    ]
  },
  invasion: {
    title: 'Carrier Invasion & Auto Ground Combat',
    intro: 'Planets are captured by ground units, not by ships alone. Carriers bring troops, invade when orbit is clear, and automatic ground fighting can resolve the battle over timed rounds.',
    objective: 'Invade an NPC planet, win the ground fight, and remove the NPC label after capture.',
    steps: [
      'Click Garrison World (NPC) and open Combat Area.',
      'Use Fully Load Carrier if the carrier is not full, then press Invade Planet or Auto Invade Until Captured.',
      'Auto ground combat runs in timed rounds like space combat, so it should not resolve instantly.',
      'When the last defender is destroyed, the planet flips to you and the “(NPC)” label is removed.',
      'If your attackers die, the invasion fails and you will need another carrier wave.'
    ]
  },
  'orbital-bombardment': {
    title: 'Timed Orbital Bombardment',
    intro: 'Orbital bombardment softens enemy ground troops before an invasion. Every eligible ship has its own 10-second cooldown, while auto bombard fires shots in 2.5-second pacing.',
    objective: 'Use manual or automatic bombardment before sending troops down.',
    steps: [
      'Click Bombardment Range and open Combat Area.',
      'Press Auto Bombard With All Ships. The button should change to Stop Auto Bombard.',
      'Each ship fires only when its own 10-second cooldown is ready.',
      'Auto bombard should fire paced shots instead of instantly deleting every defender.',
      'Stop bombardment before invading if you want to preserve time for carrier troops.'
    ]
  },
  'diplomacy-upkeep': {
    title: 'Diplomacy, Alliances & Upkeep',
    intro: 'Alliances are now request based. The other player gets a notification and can accept or decline. Your economy also includes upkeep, so fleets and armies reduce net income.',
    objective: 'Accept or decline an alliance request, then inspect your income and upkeep.',
    steps: [
      'A Rival Empire alliance request appears as a notification. Choose Accept or Decline.',
      'Open the Diplomacy panel to see alliance status and diplomatic actions.',
      'Allied ships should not be treated as hostile, and allies should not invade or auto-fire on each other.',
      'Hover Credits in the HUD to see revenue, ship upkeep, army upkeep, and net income.',
      'If upkeep gets too high, build more development or scrap ships you do not need.'
    ]
  },
  'advanced-warfare': {
    title: 'Advanced Real-Time Warfare',
    intro: 'This combined scenario puts the new systems together: chokepoints, FTL inhibitors, reinforcements, auto combat, carriers, bombardment, and real-time action timers.',
    objective: 'Break a fortified enemy line by timing fleet movement, combat, bombardment, and invasion.',
    steps: [
      'Click Bastion Gate to see your forward shipyard and FTL inhibitor.',
      'Move reinforcements from Reserve Dock toward Chokepoint Lane while the main fleet fights at Enemy Bulwark.',
      'Use Auto Attack, but stop it if you want to wait for the reinforcements to arrive.',
      'After orbit is clear, use Auto Bombard or Auto Invade to fight the ground battle.',
      'Watch action timers carefully; good timing matters more than clicking everything instantly.'
    ]
  }
};

function createRealTimeBasicsScenario(): GameState {
  const home = makeNode({
    id: 't-home', name: 'Helios Command', x: 280, y: 470, links: linked('t-forge', 't-scout'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'metropolis', resourceGeneration: 8, hasShipyard: true, hasGateway: true,
    ships: [ship('Destroyer'), ship('Carrier'), ship('ColonyShip')],
    groundUnits: [troop(), troop(), troop(), troop()]
  });
  const forge = makeNode({
    id: 't-forge', name: 'Forge Moon', x: 540, y: 420, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', resourceGeneration: 4, hasShipyard: false, groundUnits: [troop()]
  });
  const scout = makeNode({ id: 't-scout', name: 'Scout Target', x: 560, y: 560, links: linked('t-home'), claimedBy: null, development: 'none' });
  return baseState('real-time-basics', [home, forge, scout], 90);
}

function createColonizeScenario(): GameState {
  const home = makeNode({
    id: 't-home', name: 'New Dawn', x: 260, y: 500, links: linked('t-vega'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', resourceGeneration: 4, hasShipyard: true,
    ships: [ship('ColonyShip'), ship('Destroyer')], groundUnits: [troop(), troop()]
  });
  const vega = makeNode({ id: 't-vega', name: 'Vega Outpost', x: 520, y: 500, links: linked('t-home', 't-deep') });
  const deep = makeNode({ id: 't-deep', name: 'Deep Survey Point', x: 760, y: 520, links: linked('t-vega') });
  return baseState('colonize', [home, vega, deep], 40);
}

function createDevelopmentEconomyScenario(): GameState {
  const core = makeNode({
    id: 't-home', name: 'Capital Arcology', x: 500, y: 470, links: linked('t-north', 't-south', 't-east', 't-frontier'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'arcology', resourceGeneration: 12, hasShipyard: true, hasGateway: true,
    ships: [ship('Destroyer')], groundUnits: [troop(), troop(), troop()]
  });
  const north = makeNode({ id: 't-north', name: 'North Arcology', x: 500, y: 255, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID, development: 'arcology', resourceGeneration: 12, groundUnits: [troop()] });
  const south = makeNode({ id: 't-south', name: 'South Arcology', x: 500, y: 690, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID, development: 'arcology', resourceGeneration: 12, groundUnits: [troop()] });
  const east = makeNode({ id: 't-east', name: 'East Arcology', x: 740, y: 470, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID, development: 'arcology', resourceGeneration: 12, groundUnits: [troop()] });
  const frontier = makeNode({ id: 't-frontier', name: 'Frontier City', x: 270, y: 470, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID, development: 'city', resourceGeneration: 4, groundUnits: [troop()] });
  return baseState('development-economy', [core, north, south, east, frontier], 120);
}

function createInfrastructureScenario(): GameState {
  const home = makeNode({
    id: 't-home', name: 'Forge Station', x: 270, y: 500, links: linked('t-bastion', 't-gate'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', resourceGeneration: 4, hasShipyard: false, hasFtlInhibitor: false, hasGateway: false,
    ships: [ship('Destroyer')], groundUnits: [troop(), troop()]
  });
  const bastion = makeNode({
    id: 't-bastion', name: 'Bastion Gate', x: 540, y: 500, links: linked('t-home', 't-enemy-home'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'metropolis', resourceGeneration: 8, hasShipyard: true, hasFtlInhibitor: true,
    ships: [ship('BattleShip', TUTORIAL_PLAYER_ID, 11), ship('Destroyer', TUTORIAL_PLAYER_ID, 7)], groundUnits: [troop()]
  });
  const gate = makeNode({ id: 't-gate', name: 'Gateway Hub', x: 450, y: 680, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID, development: 'city', hasGateway: true, ships: [], groundUnits: [troop()] });
  const enemy = makeNode({ id: 't-enemy-home', name: 'Rival Approach', x: 820, y: 500, links: linked('t-bastion'), claimedBy: TUTORIAL_ENEMY_ID, development: 'city', ships: [ship('Destroyer', TUTORIAL_ENEMY_ID)], groundUnits: [troop(TUTORIAL_ENEMY_ID)] });
  return baseState('infrastructure', [home, bastion, gate, enemy], 90);
}

function createFleetControlsScenario(): GameState {
  const home = makeNode({
    id: 't-home', name: 'Rally Shipyard', x: 270, y: 500, links: linked('t-forward', 't-side'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'metropolis', resourceGeneration: 8, hasShipyard: true,
    ships: [ship('BattleShip'), ship('Destroyer'), ship('Destroyer'), ship('Carrier'), ship('ColonyShip')],
    groundUnits: [troop(), troop(), troop(), troop(), troop()]
  });
  const forward = makeNode({ id: 't-forward', name: 'Forward Beacon', x: 560, y: 500, links: linked('t-home', 't-front'), claimedBy: TUTORIAL_PLAYER_ID, development: 'colony', groundUnits: [troop()] });
  const side = makeNode({ id: 't-side', name: 'Side Route', x: 430, y: 680, links: linked('t-home') });
  const front = makeNode({ id: 't-front', name: 'Front Line', x: 820, y: 500, links: linked('t-forward'), claimedBy: TUTORIAL_ENEMY_ID, development: 'colony', ships: [ship('Destroyer', TUTORIAL_ENEMY_ID)], groundUnits: [troop(TUTORIAL_ENEMY_ID)] });
  return baseState('fleet-controls', [home, forward, side, front], 80);
}

function createSpaceCombatScenario(): GameState {
  const battle = makeNode({
    id: 't-home', name: 'Clash Point', x: 510, y: 500, links: linked('t-reinforce', 't-enemy-home'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', resourceGeneration: 4, hasShipyard: false,
    ships: [ship('BattleShip'), ship('Destroyer'), ship('Destroyer'), ship('Carrier'), ship('BattleShip', TUTORIAL_ENEMY_ID, 14), ship('Destroyer', TUTORIAL_ENEMY_ID, 10), ship('Fighter', TUTORIAL_ENEMY_ID, 4)],
    groundUnits: [troop()]
  });
  const reinforce = makeNode({ id: 't-reinforce', name: 'Reserve Dock', x: 260, y: 500, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID, development: 'city', hasShipyard: true, ships: [ship('BattleShip'), ship('Destroyer')], groundUnits: [troop()] });
  const enemyHome = makeNode({ id: 't-enemy-home', name: 'Rival Base', x: 780, y: 500, links: linked('t-home'), claimedBy: TUTORIAL_ENEMY_ID, development: 'city', ships: [], groundUnits: [troop(TUTORIAL_ENEMY_ID)] });
  return baseState('space-combat', [battle, reinforce, enemyHome], 70);
}

function createInvasionScenario(): GameState {
  const carrier = withCargo(ship('Carrier'), 3);
  const target = makeNode({
    id: 't-home', name: 'Garrison World (NPC)', x: 520, y: 500, links: linked('t-staging'), claimedBy: 'npc',
    development: 'city', resourceGeneration: 4, isNpcPlanet: true,
    ships: [carrier],
    groundUnits: [troop('npc', 8), troop('npc', 9), troop('npc', 7)]
  });
  const staging = makeNode({
    id: 't-staging', name: 'Staging Base', x: 260, y: 500, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', resourceGeneration: 4, hasShipyard: true, ships: [ship('Destroyer')], groundUnits: [troop(), troop(), troop()]
  });
  return baseState('invasion', [target, staging], 70);
}

function createOrbitalBombardmentScenario(): GameState {
  const target = makeNode({
    id: 't-home', name: 'Bombardment Range', x: 520, y: 500, links: linked('t-staging'), claimedBy: TUTORIAL_ENEMY_ID,
    development: 'metropolis', resourceGeneration: 8, hasFtlInhibitor: true,
    ships: [ship('BattleShip'), ship('Destroyer'), ship('Destroyer'), ship('Carrier')],
    groundUnits: [troop(TUTORIAL_ENEMY_ID, 10), troop(TUTORIAL_ENEMY_ID, 10), troop(TUTORIAL_ENEMY_ID, 10), troop(TUTORIAL_ENEMY_ID, 8)]
  });
  const staging = makeNode({
    id: 't-staging', name: 'Invasion Staging', x: 260, y: 500, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'city', hasShipyard: true, ships: [withCargo(ship('Carrier'), 3)], groundUnits: [troop(), troop()]
  });
  return baseState('orbital-bombardment', [target, staging], 75);
}

function createDiplomacyUpkeepScenario(): GameState {
  const incomingAlliance: Alliance = {
    id: 'tutorial-alliance-request',
    playerIds: [TUTORIAL_ENEMY_ID, TUTORIAL_PLAYER_ID],
    status: 'requested',
    requestedBy: TUTORIAL_ENEMY_ID
  };
  const home = makeNode({
    id: 't-home', name: 'Trade Capital', x: 280, y: 500, links: linked('t-border', 't-fleet'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'metropolis', resourceGeneration: 8, hasShipyard: true, hasGateway: true,
    ships: [ship('BattleShip'), ship('BattleShip'), ship('Destroyer'), ship('Carrier'), ship('ColonyShip')],
    groundUnits: [troop(), troop(), troop(), troop(), troop()]
  });
  const fleet = makeNode({ id: 't-fleet', name: 'Upkeep Test Fleet', x: 500, y: 690, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID, development: 'city', ships: [ship('Destroyer'), ship('Destroyer'), ship('Carrier')], groundUnits: [troop(), troop()] });
  const border = makeNode({ id: 't-border', name: 'Rival Embassy', x: 560, y: 500, links: linked('t-home', 't-enemy-home'), claimedBy: TUTORIAL_ENEMY_ID, development: 'city', ships: [ship('Destroyer', TUTORIAL_ENEMY_ID)], groundUnits: [troop(TUTORIAL_ENEMY_ID)] });
  const enemyHome = makeNode({ id: 't-enemy-home', name: 'Rival Capital', x: 820, y: 500, links: linked('t-border'), claimedBy: TUTORIAL_ENEMY_ID, development: 'metropolis', ships: [], groundUnits: [troop(TUTORIAL_ENEMY_ID), troop(TUTORIAL_ENEMY_ID)] });
  return baseState('diplomacy-upkeep', [home, fleet, border, enemyHome], 100, [incomingAlliance]);
}

function createAdvancedWarfareScenario(): GameState {
  const home = makeNode({
    id: 't-home', name: 'Bastion Gate', x: 250, y: 500, links: linked('t-choke', 't-reserve'), claimedBy: TUTORIAL_PLAYER_ID,
    development: 'metropolis', resourceGeneration: 8, hasShipyard: true, hasFtlInhibitor: true,
    ships: [ship('BattleShip'), ship('Destroyer'), withCargo(ship('Carrier'), 3)], groundUnits: [troop(), troop()]
  });
  const reserve = makeNode({ id: 't-reserve', name: 'Reserve Dock', x: 250, y: 690, links: linked('t-home'), claimedBy: TUTORIAL_PLAYER_ID, development: 'city', hasShipyard: true, ships: [ship('BattleShip'), ship('Destroyer'), ship('Destroyer')], groundUnits: [troop(), troop(), troop()] });
  const choke = makeNode({ id: 't-choke', name: 'Chokepoint Lane', x: 500, y: 500, links: linked('t-home', 't-enemy-home') });
  const enemy = makeNode({
    id: 't-enemy-home', name: 'Enemy Bulwark', x: 770, y: 500, links: linked('t-choke'), claimedBy: TUTORIAL_ENEMY_ID,
    development: 'metropolis', resourceGeneration: 8, hasFtlInhibitor: true,
    ships: [ship('BattleShip', TUTORIAL_ENEMY_ID, 18), ship('Destroyer', TUTORIAL_ENEMY_ID), ship('Carrier', TUTORIAL_ENEMY_ID)],
    groundUnits: [troop(TUTORIAL_ENEMY_ID), troop(TUTORIAL_ENEMY_ID), troop(TUTORIAL_ENEMY_ID), troop(TUTORIAL_ENEMY_ID)]
  });
  return baseState('advanced-warfare', [home, reserve, choke, enemy], 110);
}

export function createTutorialScenario(id: TutorialScenarioId): GameState {
  switch (id) {
    case 'real-time-basics': return createRealTimeBasicsScenario();
    case 'colonize': return createColonizeScenario();
    case 'development-economy': return createDevelopmentEconomyScenario();
    case 'infrastructure': return createInfrastructureScenario();
    case 'fleet-controls': return createFleetControlsScenario();
    case 'space-combat': return createSpaceCombatScenario();
    case 'invasion': return createInvasionScenario();
    case 'orbital-bombardment': return createOrbitalBombardmentScenario();
    case 'diplomacy-upkeep': return createDiplomacyUpkeepScenario();
    case 'advanced-warfare': return createAdvancedWarfareScenario();
    default: return createRealTimeBasicsScenario();
  }
}
