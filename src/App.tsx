import React, { useState, useEffect, useRef } from 'react';
import { Lobby } from './components/Lobby';
import { SettingsDialog } from './components/SettingsDialog';
import { Map } from './components/Map';
import { NodeDetails } from './components/NodeDetails';
import { ChatPanel } from './components/ChatPanel';
import { SoundToggle } from './components/SoundToggle';
import { DiplomacyPanel } from './components/DiplomacyPanel';
import type { GameState, StarNode, Ship } from './types';
import { subscribeToRoom, updateRoomState, getDbMode, getGameRoomState, getStateVersion, normalizeGameState } from './services/database';
import type { DbMode } from './services/database';
import { checkWinCondition, getReachableNodes, processHealing, generateMap, resetGroundUnitBuildCounters, getEffectiveResourceGeneration, processRealtimeActions, processRealtimeIncome, getMoveDurationSeconds, createPendingAction, formatSeconds, getPlayerEconomySummary, REALTIME_INCOME_INTERVAL_SECONDS } from './services/gameLogic';
import { audio } from './services/audio';
import { createTutorialScenario, TUTORIAL_PLAYER_ID } from './services/tutorialScenarios';
import type { TutorialScenarioId } from './services/tutorialScenarios';
import { Sparkles, ArrowRight, Handshake } from 'lucide-react';


const HudIconFrame: React.FC<{ children: React.ReactNode; accent: string; glow?: string }> = ({ children, accent, glow }) => (
  <span
    className="relative inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700/80 bg-slate-900/90 text-slate-100 shadow-inner"
    style={{ boxShadow: glow ? `0 0 10px ${glow}, inset 0 0 0 1px rgba(255,255,255,0.03)` : 'inset 0 0 0 1px rgba(255,255,255,0.03)' }}
  >
    <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="rgba(8,15,36,0.92)" stroke="rgba(51,65,85,0.9)" />
      <path d="M5 18.5H19" stroke="rgba(71,85,105,0.85)" strokeWidth="1" />
      <path d="M6 5.5H18" stroke={accent} strokeOpacity="0.35" strokeWidth="1" />
    </svg>
    <span className="relative z-10">{children}</span>
  </span>
);

const CreditsHudIcon = () => (
  <HudIconFrame accent="#f59e0b" glow="rgba(245,158,11,0.2)">
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <circle cx="12" cy="12" r="6.5" fill="#fcd34d" stroke="#f59e0b" strokeWidth="1.5" />
      <path d="M9.4 9.5h4.1a1.6 1.6 0 0 1 0 3.2h-3a1.55 1.55 0 0 0 0 3.1h4.15" fill="none" stroke="#7c2d12" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8.1v8" stroke="#7c2d12" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  </HudIconFrame>
);

const SystemsHudIcon = () => (
  <HudIconFrame accent="#38bdf8" glow="rgba(56,189,248,0.18)">
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <circle cx="7" cy="7" r="2.1" fill="#67e8f9" />
      <circle cx="16.8" cy="6.4" r="1.8" fill="#60a5fa" />
      <circle cx="8.4" cy="16.8" r="1.9" fill="#818cf8" />
      <circle cx="17" cy="15.8" r="2.2" fill="#22d3ee" />
      <path d="M8.8 7.6l6.1-0.5M8.3 8.8l-0.1 5.5M10.1 16.2l4.7-0.2M15.7 8.1l0.8 5.4" stroke="#dbeafe" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
    </svg>
  </HudIconFrame>
);

const NavyHudIcon = () => (
  <HudIconFrame accent="#818cf8" glow="rgba(129,140,248,0.2)">
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M12 4L16.4 14.2L12.8 12.8L12 19.5L11.2 12.8L7.6 14.2L12 4Z" fill="#f8fafc" stroke="#6366f1" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.8 16.4h4.4" stroke="#a5b4fc" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  </HudIconFrame>
);

const GarrisonsHudIcon = () => (
  <HudIconFrame accent="#60a5fa" glow="rgba(96,165,250,0.16)">
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M12 4.2L17.6 6V10.5C17.6 14.4 15.2 17.4 12 19.2C8.8 17.4 6.4 14.4 6.4 10.5V6L12 4.2Z" fill="#93c5fd" stroke="#2563eb" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 7.4V15.2" stroke="#eff6ff" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M9.4 10.2H14.6" stroke="#eff6ff" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  </HudIconFrame>
);

const formatWholeResource = (value: number | undefined | null) => Math.round(Number(value || 0)).toString();

type FleetMoveSelection = {
  nodeId: string;
  shipIds: string[];
  label: string;
};

function isAuthoritativeHost(state: GameState, playerId: string): boolean {
  const fallbackHost = state.players.find(p => !p.isNpc)?.id;
  return Boolean(playerId && (state.creatorId || fallbackHost) === playerId);
}

const ACTION_FAILOVER_GRACE_MS = 1200;
const INCOME_FAILOVER_GRACE_MS = 3500;

function getMostOverdueRealtimeActionMs(state: GameState, nowMs = Date.now()): number {
  const pending = state.pendingActions || [];
  if (pending.length === 0) return 0;

  return pending.reduce((maxOverdue, action) => {
    const completesAt = new Date(action.completesAt).getTime();
    if (!Number.isFinite(completesAt)) return Math.max(maxOverdue, ACTION_FAILOVER_GRACE_MS + 1);
    return Math.max(maxOverdue, nowMs - completesAt);
  }, 0);
}

function getRealtimeIncomeOverdueMs(state: GameState, nowMs = Date.now()): number {
  const lastIncomeMs = state.realtimeIncomeLastAt
    ? new Date(state.realtimeIncomeLastAt).getTime()
    : new Date(state.lastUpdated || state.lastActionAt || nowMs).getTime();
  if (!Number.isFinite(lastIncomeMs)) return 0;
  return nowMs - (lastIncomeMs + REALTIME_INCOME_INTERVAL_SECONDS * 1000);
}

export const App: React.FC = () => {
  const [view, setView] = useState<'lobby' | 'game' | 'tutorialGame'>('lobby');
  const [currentCode, setCurrentCode] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const isTutorialMode = view === 'tutorialGame';
  const [tutorialIntroOpen, setTutorialIntroOpen] = useState(false);

  // Game UI State
  const [selectedNode, setSelectedNode] = useState<StarNode | null>(null);
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [selectedFleetMove, setSelectedFleetMove] = useState<FleetMoveSelection | null>(null);
  const [reachableNodes, setReachableNodes] = useState<{ [nodeId: string]: number }>({});

  // Settings Overlay
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDiplomacyOpen, setIsDiplomacyOpen] = useState(false);
  const [dbMode, setDbMode] = useState<DbMode>(() => getDbMode());
  const roomUnsubRef = useRef<(() => void) | null>(null);
  const turnNoticeRef = useRef<string | null>(null);
  const [showTurnOverlay, setShowTurnOverlay] = useState(false);
  const realtimeTickRef = useRef(false);
  const previousMyResourcesRef = useRef<number | null>(null);
  const [incomePops, setIncomePops] = useState<{ id: string; amount: number }[]>([]);
  const gameStateRef = useRef<GameState | null>(null);
  const pendingSaveCountRef = useRef(0);
  const saveChainRef = useRef<Promise<GameState | null>>(Promise.resolve(null));

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Fog of war setting
  const [fogOfWar, setFogOfWar] = useState(false);

  const refreshSelectionsFromState = (state: GameState) => {
    setSelectedNode(prev => {
      if (!prev) return prev;
      return state.nodes.find(n => n.id === prev.id) || null;
    });
    setSelectedShip(prev => {
      if (!prev) return prev;
      for (const node of state.nodes) {
        const freshShip = node.ships.find(s => s.id === prev.id);
        if (freshShip) return freshShip;
      }
      return null;
    });
  };

  const applyLocalState = (state: GameState) => {
    const normalized = normalizeGameState(state);
    gameStateRef.current = normalized;
    setGameState(normalized);
    refreshSelectionsFromState(normalized);
    return normalized;
  };

  const persistGameState = async (state: GameState, options: { retryMergedConflict?: boolean } = {}) => {
    const baseState = gameStateRef.current ? normalizeGameState(gameStateRef.current) : null;
    const baseVersion = getStateVersion(baseState);
    const optimisticVersion = baseVersion + 1;
    const optimisticState = normalizeGameState({
      ...state,
      stateVersion: optimisticVersion,
      lastUpdated: new Date().toISOString(),
      lastActionAt: state.lastActionAt || new Date().toISOString()
    });

    applyLocalState(optimisticState);
    if (isTutorialMode) return optimisticState;

    const stateForSave = normalizeGameState({ ...state, stateVersion: baseVersion });
    pendingSaveCountRef.current += 1;

    const saveTask = async () => {
      return await updateRoomState(currentCode, stateForSave, {
        expectedVersion: baseVersion,
        baseState,
        retryMergedConflict: options.retryMergedConflict ?? true
      });
    };

    const queuedSave = saveChainRef.current.then(saveTask, saveTask);
    saveChainRef.current = queuedSave.catch(error => {
      console.warn('Queued save failed.', error);
      return null;
    });

    try {
      const savedState = await queuedSave;
      const current = gameStateRef.current;
      if (!current || getStateVersion(savedState) >= getStateVersion(current)) {
        return applyLocalState(savedState);
      }
      return current;
    } finally {
      pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
    }
  };

  // Read URL query parameter for sharing link on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) audio.playBeep(400, 0.1);
  }, []);

  const handleSettingsChanged = () => setDbMode(getDbMode());

  // Connect to the game room
  const handleGameStart = async (code: string, playerId: string) => {
    const cleanCode = code.trim().toUpperCase();

    if (roomUnsubRef.current) {
      roomUnsubRef.current();
      roomUnsubRef.current = null;
    }

    const applyIncomingState = (incomingState: GameState) => {
      const newState = normalizeGameState(incomingState);
      const current = gameStateRef.current;
      if (current) {
        // While this client has an optimistic action saving, do not let realtime echoes
        // or another player's slightly newer save visually roll the screen backward.
        // The save path will merge our delta onto the latest database state, then apply that result.
        if (pendingSaveCountRef.current > 0) return;
        const incomingVersion = getStateVersion(newState);
        const currentVersion = getStateVersion(current);
        if (incomingVersion < currentVersion) return;
      }
      applyLocalState(newState);
      const winner = checkWinCondition(newState);
      if (winner && newState.status !== 'completed' && isAuthoritativeHost(newState, playerId)) {
        const winState: GameState = {
          ...newState,
          status: 'completed',
          winnerId: winner.id,
          actionLog: [...newState.actionLog, `VICTORY! Commander ${winner.name} dominates the sector.`]
        };
        applyLocalState(winState);
        void updateRoomState(cleanCode, winState).then(applyLocalState).catch(console.warn);
        audio.playVictory();
      }
    };

    setCurrentCode(cleanCode);
    setMyPlayerId(playerId);
    setSelectedNode(null);
    setSelectedShip(null);
    setSelectedFleetMove(null);
    setReachableNodes({});
    localStorage.setItem('void_empires_active_game', cleanCode);
    localStorage.setItem('void_empires_player_id', playerId);

    const currentState = await getGameRoomState(cleanCode);
    const playerStillExists = currentState?.players.some((p) => p.id === playerId);
    if (!currentState || !playerStillExists) {
      localStorage.removeItem('void_empires_active_game');
      setGameState(null);
      setView('lobby');
      return;
    }

    applyIncomingState(currentState);
    setView('game');

    roomUnsubRef.current = subscribeToRoom(cleanCode, applyIncomingState);
  };

  useEffect(() => {
    return () => {
      if (roomUnsubRef.current) {
        roomUnsubRef.current();
        roomUnsubRef.current = null;
      }
    };
  }, []);

  // Fully real-time mode: no player turn notification overlay.
  useEffect(() => {
    if (!gameState || gameState.status !== 'playing' || view === 'lobby') return;
    turnNoticeRef.current = `${gameState.roomId}:realtime`;
    setShowTurnOverlay(false);
  }, [gameState?.roomId, gameState?.status, view]);

  // Update reachable nodes when a single ship or bulk fleet move is selected.
  useEffect(() => {
    if (!gameState || !selectedNode) {
      setReachableNodes({});
      return;
    }

    if (selectedFleetMove) {
      const source = gameState.nodes.find(n => n.id === selectedFleetMove.nodeId);
      const leadShip = source?.ships.find(s => selectedFleetMove.shipIds.includes(s.id) && s.owner === myPlayerId && s.canMove);
      if (!source || !leadShip) {
        setReachableNodes({});
        return;
      }
      setReachableNodes(getReachableNodes(source.id, leadShip, gameState.nodes, myPlayerId, gameState));
      return;
    }

    if (!selectedShip) {
      setReachableNodes({});
      return;
    }
    const range = getReachableNodes(selectedNode.id, selectedShip, gameState.nodes, myPlayerId, gameState);
    setReachableNodes(range);
  }, [selectedShip, selectedFleetMove, selectedNode, gameState, myPlayerId]);

  // Combat is no longer forced open for spectators. Players see combat only when they click the planet.

  // Real-time action processor. The host handles normal ticks, but other players
  // can rescue overdue 0s actions if the host tab is closed, throttled, or has a bad clock.
  useEffect(() => {
    if (!gameState || gameState.status !== 'playing' || realtimeTickRef.current) return;

    const tick = async () => {
      const current = gameStateRef.current;
      if (realtimeTickRef.current || !current || current.status !== 'playing') return;

      const nowMs = Date.now();
      const isHostTick = isTutorialMode || isAuthoritativeHost(current, myPlayerId);
      const actionOverdueMs = getMostOverdueRealtimeActionMs(current, nowMs);
      const incomeOverdueMs = getRealtimeIncomeOverdueMs(current, nowMs);
      const shouldRescueActions = !isHostTick && actionOverdueMs > ACTION_FAILOVER_GRACE_MS;
      const shouldRescueIncome = !isHostTick && incomeOverdueMs > INCOME_FAILOVER_GRACE_MS;

      if (!isHostTick && !shouldRescueActions && !shouldRescueIncome) return;

      const actionResult = (isHostTick || shouldRescueActions)
        ? processRealtimeActions(current, nowMs)
        : { state: current, changed: false, completed: [] };
      const incomeResult = (isHostTick || shouldRescueIncome)
        ? processRealtimeIncome(actionResult.state, nowMs)
        : { state: actionResult.state, changed: false };
      const nextState = incomeResult.state;
      if (!actionResult.changed && !incomeResult.changed) return;

      realtimeTickRef.current = true;
      try {
        // Automatic timer results must use strict version saves. If two clients try to
        // finish the same 0s action, only the first save wins; the loser discards its
        // generated changes instead of merging duplicate ships/damage/resources.
        await persistGameState(nextState, { retryMergedConflict: false });
      } finally {
        realtimeTickRef.current = false;
      }
    };

    const interval = window.setInterval(tick, 40);
    void tick();
    return () => window.clearInterval(interval);
  }, [gameState?.roomId, gameState?.status, gameState?.creatorId, currentCode, myPlayerId, isTutorialMode]);


  useEffect(() => {
    const currentResources = gameState?.players.find(p => p.id === myPlayerId)?.resources;
    if (currentResources === undefined) return;
    const previousResources = previousMyResourcesRef.current;
    previousMyResourcesRef.current = currentResources;
    if (previousResources === null || currentResources <= previousResources) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const amount = currentResources - previousResources;
    setIncomePops(pops => [...pops, { id, amount }].slice(-4));
    window.setTimeout(() => {
      setIncomePops(pops => pops.filter(pop => pop.id !== id));
    }, 1800);
  }, [gameState?.players, myPlayerId]);

  const handleSelectFleetMove = (selection: FleetMoveSelection | null) => {
    setSelectedFleetMove(selection);
    if (!selection || !gameState) {
      setSelectedShip(null);
      return;
    }
    const source = gameState.nodes.find(n => n.id === selection.nodeId);
    const leadShip = source?.ships.find(s => selection.shipIds.includes(s.id) && s.owner === myPlayerId && s.canMove);
    setSelectedShip(leadShip || null);
    if (source) setSelectedNode(source);
  };

  // Handle ship movement — supports one selected ship or a bulk fleet/type selection.
  const handleMoveShip = async (targetNodeId: string) => {
    if (!gameState) return;

    const fleetSelection = selectedFleetMove;
    const movingShipIds = fleetSelection?.shipIds || (selectedShip ? [selectedShip.id] : []);
    if (movingShipIds.length === 0) return;

    const startNode = fleetSelection
      ? gameState.nodes.find(n => n.id === fleetSelection.nodeId)
      : gameState.nodes.find(n => selectedShip && n.ships.some(s => s.id === selectedShip.id));
    const targetNode = gameState.nodes.find(n => n.id === targetNodeId);
    if (!startNode || !targetNode) return;

    if (reachableNodes[targetNodeId] === undefined) {
      audio.playBeep(160, 0.08);
      return;
    }

    const shipsToMove = startNode.ships.filter(s =>
      movingShipIds.includes(s.id) &&
      s.owner === myPlayerId &&
      s.canMove &&
      s.movesLeft > 0
    );
    if (shipsToMove.length === 0) return;

    audio.playMove();
    const costInMoves = reachableNodes[targetNodeId];
    const durationSeconds = getMoveDurationSeconds(startNode, targetNode, costInMoves);
    const pendingActions = shipsToMove.map(ship => {
      const travelingShip: Ship = {
        ...ship,
        movesLeft: ship.movesLeft,
        turnsInTerritory: 0,
        lastNodeId: startNode.id,
        inTransit: true,
        transitToNodeId: targetNodeId
      };

      return createPendingAction({
        type: 'move_ship',
        playerId: myPlayerId,
        nodeId: startNode.id,
        targetNodeId,
        shipId: ship.id,
        ship: travelingShip,
        durationSeconds,
        label: `${ship.type} ${startNode.name} → ${targetNode.name}`
      });
    });

    const movingIds = new Set(shipsToMove.map(s => s.id));
    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === startNode.id) {
        return { ...n, ships: n.ships.filter(s => !movingIds.has(s.id)) };
      }
      return n;
    });

    const moveLabel = shipsToMove.length === 1
      ? `${shipsToMove[0].type}`
      : `${shipsToMove.length} ships${fleetSelection ? ` (${fleetSelection.label})` : ''}`;

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      pendingActions: [...(gameState.pendingActions || []), ...pendingActions],
      actionLog: [
        ...gameState.actionLog,
        `${gameState.players.find(p => p.id === myPlayerId)?.name}: ${moveLabel} departed ${startNode.name} for ${targetNode.name}; ETA ${formatSeconds(durationSeconds)}.`
      ],
      lastAction: shipsToMove.length > 1 ? 'queue_fleet_move' : 'queue_ship_move',
      lastActionAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    setSelectedShip(null);
    setSelectedFleetMove(null);
    setReachableNodes({});
    await persistGameState(updatedState);
  };

  // Phase & Turn advancement
  const handleNextPhase = async () => {
    if (!gameState) return;
    audio.playNextPhase();

    const activePlayer = gameState.players[gameState.activePlayerIndex];
    let nextPhase = gameState.phase;
    let nextPlayerIndex = gameState.activePlayerIndex;
    let nextTurnNumber = gameState.turnNumber;
    const logEntries: string[] = [];

    if (gameState.phase === 0) {
      nextPhase = 1;
      logEntries.push(`--- Phase 1: Movement [${activePlayer.name}] ---`);
    } else if (gameState.phase === 1) {
      nextPhase = 2;
      logEntries.push(`--- Phase 2: Action & Combat [${activePlayer.name}] ---`);
    } else {
      // Alliance break requests become active only after the breaking player's action phase ends.
      if (gameState.alliances?.some(a => a.status === 'breaking' && a.breakEffectiveAfterPlayerId === activePlayer.id)) {
        const broken = gameState.alliances.filter(a => a.status === 'breaking' && a.breakEffectiveAfterPlayerId === activePlayer.id);
        gameState.alliances = gameState.alliances.filter(a => !(a.status === 'breaking' && a.breakEffectiveAfterPlayerId === activePlayer.id));
        broken.forEach(a => logEntries.push(`Alliance ended between ${gameState.players.find(p => p.id === a.playerIds[0])?.name || 'Player'} and ${gameState.players.find(p => p.id === a.playerIds[1])?.name || 'Player'}.`));
      }
      nextPhase = 0;
      nextPlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
      if (nextPlayerIndex === 0) nextTurnNumber += 1;
      const newActivePlayer = gameState.players[nextPlayerIndex];
      logEntries.push(`=== TURN ${nextTurnNumber}: ${newActivePlayer.name} ===`);
      logEntries.push(`--- Phase 0: Planetary Build ---`);

      const ownedNodes = gameState.nodes.filter(n => n.claimedBy === newActivePlayer.id);
      const totalYield = ownedNodes.reduce((acc, curr) => acc + getEffectiveResourceGeneration(curr, newActivePlayer.id), 0);
      const overcrowded = ownedNodes.filter(n => n.groundUnits.filter(g => g.owner === newActivePlayer.id).length > 6);
      if (overcrowded.length > 0) {
        logEntries.push(`Overcrowding penalty: ${overcrowded.length} planet(s) produce 0 income until garrison is 6 or fewer.`);
      }
      gameState.players = gameState.players.map(p =>
        p.id === newActivePlayer.id ? { ...p, resources: p.resources + totalYield } : p
      );
      logEntries.push(`Resource Yield: +${totalYield} Credits from ${ownedNodes.length} systems.`);

      const healingLogs = processHealing(gameState.nodes, newActivePlayer.id);
      logEntries.push(...healingLogs);

      gameState.nodes.forEach(node => {
        node.ships.forEach(ship => {
          if (ship.owner === newActivePlayer.id) ship.movesLeft = ship.type === 'Fighter' ? 0 : 4; ship.bombardedThisTurn = false;
          ship.carriedFighters.forEach(f => { f.movesLeft = 0; });
        });
      });
    }

    const updatedState: GameState = {
      ...gameState,
      phase: nextPhase as 0 | 1 | 2,
      activePlayerIndex: nextPlayerIndex,
      turnNumber: nextTurnNumber,
      nodes: gameState.phase === 2 ? resetGroundUnitBuildCounters(gameState.nodes) : gameState.nodes,
      actionLog: [...gameState.actionLog, ...logEntries],
      lastAction: 'next_phase',
      lastActionAt: new Date().toISOString(),
      activeCombatNodeId: null,
      activeCombatUpdatedAt: new Date().toISOString(),
      activeCombatSummary: undefined,
      turnStartedAt: new Date().toISOString()
    };

    setSelectedShip(null);
    await persistGameState(updatedState);
  };

  const handlePlayAgain = async () => {
    if (!gameState) return;
    audio.playVictory();
    const resetPlayers = gameState.players.map(p => ({ ...p, resources: 20, ready: p.id === myPlayerId, homeworldId: '' }));
    const mapNodeCounts = { small: 30, medium: 60, large: 100 };
    const nodes = generateMap(mapNodeCounts[gameState.mapSize], resetPlayers, gameState.npcCount);
    const updatedState: GameState = {
      ...gameState, status: 'playing', players: resetPlayers, activePlayerIndex: 0,
      phase: 0, nodes, turnNumber: 1,
      actionLog: ['=== REMATCH: Galaxy Map Re-seeded ==='],
      winnerId: null, lastUpdated: new Date().toISOString(),
      activeCombatNodeId: null,
      activeCombatSummary: undefined,
      pendingActions: []
    };
    setSelectedNode(null); setSelectedShip(null);
    await persistGameState(updatedState);
  };

  const handleReturnToLobby = async () => {
    if (!gameState) return;
    audio.playBeep();
    const updatedState: GameState = {
      ...gameState, status: 'lobby',
      players: gameState.players.map(p => ({ ...p, ready: p.id === myPlayerId, homeworldId: '' })),
      nodes: [], winnerId: null, actionLog: ['Game ended. Returned to lobby.'],
      activeCombatNodeId: null,
      activeCombatSummary: undefined,
      pendingActions: []
    };
    setSelectedNode(null); setSelectedShip(null);
    await persistGameState(updatedState);
  };

  const handleReturnToMainLobby = () => {
    audio.playBeep();
    setView('lobby'); setGameState(null); setCurrentCode('');
    setSelectedNode(null); setSelectedShip(null);
    setTutorialIntroOpen(false);
  };

  const handleUpdateGameState = async (updatedState: GameState) => {
    if (!gameState) return;
    const stamped: GameState = {
      ...updatedState,
      lastUpdated: new Date().toISOString(),
      lastActionAt: updatedState.lastActionAt || new Date().toISOString()
    };
    await persistGameState(stamped);
  };

  const handleAllianceNotificationResponse = async (allianceId: string, accepted: boolean) => {
    if (!gameState || !myPlayerId) return;
    const alliance = (gameState.alliances || []).find(a => a.id === allianceId);
    if (!alliance || alliance.status !== 'requested' || alliance.requestedBy === myPlayerId || !alliance.playerIds.includes(myPlayerId)) return;

    const requester = gameState.players.find(p => p.id === alliance.requestedBy);
    const responder = gameState.players.find(p => p.id === myPlayerId);
    const timestamp = new Date().toISOString();
    const nextAlliances = accepted
      ? (gameState.alliances || []).map(a => a.id === alliance.id ? { ...a, status: 'active' as const, requestedBy: undefined } : a)
      : (gameState.alliances || []).filter(a => a.id !== alliance.id);

    audio.playBeep(accepted ? 780 : 220, 0.08);
    await handleUpdateGameState({
      ...gameState,
      alliances: nextAlliances,
      actionLog: [
        ...gameState.actionLog,
        accepted
          ? `${responder?.name || 'Commander'} accepted ${requester?.name || 'another empire'}'s alliance request.`
          : `${responder?.name || 'Commander'} declined ${requester?.name || 'another empire'}'s alliance request.`
      ],
      lastAction: accepted ? 'alliance_accepted' : 'alliance_declined',
      lastActionAt: timestamp,
      lastUpdated: timestamp
    });
  };

  const handleStartTutorialScenario = (scenarioId: TutorialScenarioId) => {
    audio.playVictory();
    const scenarioState = createTutorialScenario(scenarioId);
    setCurrentCode(scenarioState.roomId);
    setMyPlayerId(TUTORIAL_PLAYER_ID);
    setGameState(scenarioState);
    setSelectedNode(scenarioState.nodes[0] || null);
    setSelectedShip(null);
    setReachableNodes({});
    setTutorialIntroOpen(true);
    setView('tutorialGame');
  };

  // ───── LOBBY VIEW ─────
  if (view === 'lobby' || !gameState) {
    return (
      <>
        <Lobby onGameStart={handleGameStart} onOpenSettings={() => setIsSettingsOpen(true)} dbMode={dbMode} onStartTutorialScenario={handleStartTutorialScenario} />
        {isSettingsOpen && (
          <SettingsDialog onClose={() => setIsSettingsOpen(false)} onModeChanged={handleSettingsChanged} />
        )}
      </>
    );
  }

  // ───── GAME VIEW ─────
  const activePlayer = gameState.players[gameState.activePlayerIndex] || gameState.players[0];
  const isMyActiveTurn = true;
  const realTimeMode = true;
  const me = gameState.players.find(p => p.id === myPlayerId);
  const pendingAllianceRequests = (gameState.alliances || []).filter(alliance =>
    alliance.status === 'requested' &&
    alliance.requestedBy !== myPlayerId &&
    alliance.playerIds.includes(myPlayerId)
  );

  const phaseNames = ['BUILD', 'MOVEMENT', 'ACTION'];
  const phaseColors: Record<number, string> = {
    0: 'text-indigo-300 bg-indigo-900/40 border-indigo-500/50',
    1: 'text-sky-300 bg-sky-900/30 border-sky-500/50',
    2: 'text-rose-300 bg-rose-900/30 border-rose-500/50'
  };
  const playerColorMap: Record<string, string> = {
    green: '#10b981', blue: '#3b82f6', purple: '#8b5cf6', yellow: '#f59e0b', red: '#ef4444', cyan: '#06b6d4', orange: '#f97316', pink: '#ec4899'
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-slate-950 select-none">

      {/* ═══ 1. STELLARIS-STYLE TOP HUD BAR ═══ */}
      {/* ═══ 1. STELLARIS-STYLE TOP HUD BAR ═══ */}
      {(() => {
        const myOwnedNodes = gameState.nodes.filter(n => n.claimedBy === myPlayerId);
        const economy = getPlayerEconomySummary(gameState, myPlayerId);
        const myYield = economy.netPerIncomeTick;
        
        const myShipsCount = gameState.nodes.reduce((count, n) => {
          const topLevelShips = n.ships.filter(s => s.owner === myPlayerId);
          const carriedFightersCount = topLevelShips.reduce((acc, s) => acc + s.carriedFighters.length, 0);
          return count + topLevelShips.length + carriedFightersCount;
        }, 0);

        const myGroundCount = gameState.nodes.reduce((count, n) => {
          const topLevelGround = n.groundUnits.filter(g => g.owner === myPlayerId).length;
          const carriedGroundCount = n.ships
            .filter(s => s.owner === myPlayerId)
            .reduce((acc, s) => acc + s.carriedUnits.length, 0);
          return count + topLevelGround + carriedGroundCount;
        }, 0);


        return (
          <header className="z-20 flex-shrink-0 w-full bg-slate-900/95 border-b border-slate-700/60 flex items-stretch text-slate-200"
            style={{ minHeight: '52px' }}>

            {/* LEFT: Logo + Turn + Phase */}
            <div className="flex items-center px-4 border-r border-slate-700/50 gap-3">
              <span className="text-[12px] font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 uppercase font-mono hidden md:block">
                CONQUERERZ II
              </span>
              <div className="flex flex-col justify-center">
                <span className="text-[8px] text-slate-500 font-mono uppercase tracking-widest leading-none">Session</span>
                <span className="text-base font-bold text-slate-200 font-mono leading-tight">#{gameState.turnNumber}</span>
              </div>
              <div className={`flex flex-col justify-center px-2 py-0.5 border rounded text-center ${phaseColors[gameState.phase]}`}>
                <span className="text-[7px] opacity-60 leading-none uppercase tracking-wider">Mode</span>
                <span className="text-[10px] font-extrabold tracking-wider leading-tight">REAL TIME</span>
              </div>
            </div>

            {/* CENTER: Stellaris resource bar */}
            <div className="flex-1 flex items-center px-4 overflow-x-auto gap-6 border-r border-slate-700/50">
              {/* Credits (Energy Credits) */}
              <div className="relative flex items-center gap-2 shrink-0" title={`Gross/tick: +${formatWholeResource(economy.revenuePerIncomeTick)}R | Upkeep/tick: -${formatWholeResource(economy.upkeepPerIncomeTick)}R (Ships -${formatWholeResource(economy.shipUpkeep)}, Armies -${formatWholeResource(economy.armyUpkeep)}) | Net/tick: +${formatWholeResource(economy.netPerIncomeTick)}R`}>
                <CreditsHudIcon />
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wider leading-none">Credits</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-amber-400 font-mono leading-none">{formatWholeResource(me?.resources)}R</span>
                    <span className="text-[10px] text-emerald-400 font-bold font-mono leading-none">+{formatWholeResource(myYield)}/tick</span>
                  </div>
                </div>
                <div className="pointer-events-none absolute -right-2 -top-4 flex flex-col items-end gap-0.5">
                  {incomePops.map((pop, idx) => (
                    <span
                      key={pop.id}
                      className="animate-bounce rounded border border-emerald-400/50 bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-black text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.35)]"
                      style={{ transform: `translateY(${-idx * 10}px)` }}
                    >
                      +{formatWholeResource(pop.amount)}R
                    </span>
                  ))}
                </div>
              </div>

              {/* Controlled Systems */}
              <div className="flex items-center gap-2 shrink-0">
                <SystemsHudIcon />
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wider leading-none">Systems</span>
                  <span className="text-sm font-bold text-slate-200 font-mono leading-none">{myOwnedNodes.length}</span>
                </div>
              </div>

              {/* Navy Strength */}
              <div className="flex items-center gap-2 shrink-0">
                <NavyHudIcon />
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wider leading-none">Navy</span>
                  <span className="text-sm font-bold text-indigo-300 font-mono leading-none">{myShipsCount}</span>
                </div>
              </div>

              {/* Ground forces */}
              <div className="flex items-center gap-2 shrink-0">
                <GarrisonsHudIcon />
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wider leading-none">Garrisons</span>
                  <span className="text-sm font-bold text-amber-500 font-mono leading-none">{myGroundCount}</span>
                </div>
              </div>
            </div>

            {/* RIGHT: Active Turn + compact multiplayer slots */}
            <div className="flex items-center px-4 gap-3 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {gameState.players.map((player) => {
                  const isActive = player.id === myPlayerId;
                  const isMe = player.id === myPlayerId;
                  const pColor = playerColorMap[player.color];
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-1 border px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                        isActive
                          ? 'border-indigo-500/50 bg-indigo-950/20'
                          : 'border-slate-800 bg-slate-950/40 text-slate-500'
                      }`}
                      style={{
                        borderColor: isActive ? pColor : undefined,
                        boxShadow: isActive ? `0 0 8px ${pColor}30` : undefined,
                      }}
                      title={`${player.name}${isMe ? ' (You)' : ''}${isMe ? " — You" : ""}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: pColor,
                          boxShadow: isActive ? `0 0 4px ${pColor}` : undefined
                        }} />
                      <span className="max-w-[60px] truncate" style={{ color: isActive ? '#f8fafc' : '#64748b' }}>
                        {player.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: My actions + controls */}
            <div className="flex items-center px-3 gap-2 border-l border-slate-700/50">
              <label className="flex items-center gap-1.5 text-[9px] font-bold font-mono tracking-wider text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fogOfWar}
                  onChange={e => { audio.playBeep(700, 0.05); setFogOfWar(e.target.checked); }}
                  className="accent-indigo-500 h-3 w-3"
                />
                <span className="hidden sm:inline">FOG</span>
              </label>
              <SoundToggle />
              <button
                onClick={() => setIsDiplomacyOpen(true)}
                className="group relative overflow-hidden px-2.5 sm:px-3 py-1.5 text-[9px] sm:text-[10px] font-mono font-extrabold uppercase tracking-[0.12em] text-cyan-200 border border-cyan-500/40 rounded-md bg-cyan-950/20 hover:text-white hover:border-cyan-300 hover:bg-cyan-900/35 hover:shadow-[0_0_14px_rgba(34,211,238,0.25)] transition-all flex items-center gap-1.5"
                title="Open diplomacy"
              >
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent opacity-70" />
                <Handshake className="h-3.5 w-3.5 text-cyan-300 group-hover:text-white" />
                <span>Diplomacy</span>
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 border border-slate-700 rounded hover:text-white hover:border-slate-500 transition-all"
              >⚙</button>
            </div>
          </header>
        );
      })()}

      {/* ═══ 2. MAIN MAP AREA ═══ */}
      <main className="flex-1 w-full relative z-0 overflow-hidden">
        <Map
          gameState={gameState}
          myPlayerId={myPlayerId}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          selectedShip={selectedShip}
          reachableNodes={reachableNodes}
          onMoveShip={handleMoveShip}
          fogOfWarEnabled={fogOfWar}
        />

        {isTutorialMode && gameState.tutorialScenario && (
          <>
            <div className="absolute top-0 left-0 right-0 z-20 bg-cyan-950/90 backdrop-blur-sm border-b border-cyan-500/40 px-4 py-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 animate-fadeIn">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300">Tutorial Scenario</div>
                <div className="text-sm font-bold text-slate-100">{gameState.tutorialScenario.title}</div>
                <div className="text-xs text-slate-300 line-clamp-2">{gameState.tutorialScenario.objective}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTutorialIntroOpen(true)}
                  className="scifi-btn scifi-btn-secondary px-3 py-2 text-xs shrink-0"
                >
                  Show Briefing
                </button>
                <button
                  onClick={handleReturnToMainLobby}
                  className="scifi-btn scifi-btn-danger px-3 py-2 text-xs shrink-0"
                >
                  Exit Tutorial
                </button>
              </div>
            </div>

            {tutorialIntroOpen && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/78 backdrop-blur-sm p-4 animate-fadeIn">
                <div className="glass-panel w-full max-w-2xl max-h-[82vh] overflow-y-auto rounded-xl border border-cyan-500/40 p-5 shadow-[0_0_32px_rgba(34,211,238,0.18)]">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3 mb-4">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300">Mission Briefing</p>
                      <h3 className="text-xl font-extrabold uppercase tracking-wide text-slate-100">{gameState.tutorialScenario.title}</h3>
                    </div>
                    <button
                      onClick={() => setTutorialIntroOpen(false)}
                      className="scifi-btn px-3 py-2 text-xs"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-4">
                    {gameState.tutorialScenario.intro && (
                      <div className="rounded border border-cyan-500/25 bg-cyan-950/20 p-3">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-300 mb-1">What this teaches</p>
                        <p className="text-sm text-slate-300 leading-relaxed">{gameState.tutorialScenario.intro}</p>
                      </div>
                    )}
                    <div className="rounded border border-indigo-500/25 bg-indigo-950/20 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-indigo-300 mb-1">Objective</p>
                      <p className="text-sm text-slate-200 leading-relaxed">{gameState.tutorialScenario.objective}</p>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-950/70 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-3">Steps</p>
                      <ol className="space-y-2">
                        {gameState.tutorialScenario.steps.map((step, index) => (
                          <li key={`${gameState.tutorialScenario?.id || 'tutorial'}-${index}`} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-cyan-500/40 bg-cyan-950/40 text-[11px] font-bold text-cyan-300">{index + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-end gap-2 mt-5 pt-4 border-t border-slate-800">
                    <button onClick={handleReturnToMainLobby} className="scifi-btn scifi-btn-danger px-4 py-2 text-xs">Exit Tutorial</button>
                    <button onClick={() => setTutorialIntroOpen(false)} className="scifi-btn scifi-btn-primary px-4 py-2 text-xs">Start Training</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* In-Game log console (top-left corner, desktop only) */}
        <div className="absolute right-3 top-20 z-10 w-60 max-h-32 bg-slate-900/80 border border-slate-700/60 rounded p-2 overflow-y-auto text-[9px] font-mono text-slate-400 space-y-0.5 pointer-events-auto shadow-lg hidden md:block backdrop-blur-sm">
          <div className="border-b border-slate-700 pb-1 mb-1 font-bold text-indigo-400 text-[9px] uppercase tracking-wider">Event Journal</div>
          {gameState.actionLog.slice(-12).reverse().map((log, idx) => (
            <div key={idx} className="leading-tight text-[9px] border-b border-slate-900/30 pb-0.5">{log}</div>
          ))}
        </div>

        {/* Waiting for turn — persistent top banner */}
        {!realTimeMode && !isMyActiveTurn && gameState.status === 'playing' && (
          <div className="absolute top-0 left-0 right-0 z-20 bg-slate-900/90 backdrop-blur-sm border-t border-slate-700/60 px-4 py-2 flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full animate-ping" style={{ background: playerColorMap[activePlayer.color] }} />
              <span className="text-xs font-mono text-slate-300">
                Waiting for <span className="font-bold" style={{ color: playerColorMap[activePlayer.color] }}>{activePlayer.name}</span>
                <span className="text-slate-500 ml-1">— {phaseNames[gameState.phase]} phase</span>
              </span>
            </div>
            <button onClick={handleReturnToMainLobby} className="text-[10px] font-mono text-slate-500 hover:text-white border border-slate-700 rounded px-2 py-0.5 hover:border-slate-500 transition-all">
              Leave
            </button>
          </div>
        )}
      </main>

      {/* ═══ 3. FLOATERS ═══ */}
      <ChatPanel code={currentCode} gameState={gameState} myPlayerId={myPlayerId} />

      {pendingAllianceRequests.length > 0 && (
        <div className="fixed left-1/2 top-16 z-[55] w-[min(92vw,420px)] -translate-x-1/2 space-y-2 pointer-events-auto">
          {pendingAllianceRequests.map(alliance => {
            const requester = gameState.players.find(p => p.id === alliance.requestedBy);
            return (
              <div key={alliance.id} className="relative overflow-hidden rounded-xl border border-cyan-400/50 bg-slate-950/95 p-4 shadow-[0_0_30px_rgba(34,211,238,0.24)] backdrop-blur-md animate-fadeIn">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-950/30 text-cyan-300">
                    <Handshake className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300">Diplomacy Request</div>
                    <div className="mt-1 text-sm font-bold text-white">
                      {requester?.name || 'Another commander'} wants an alliance.
                    </div>
                    <div className="mt-1 text-xs text-slate-400">Accept to make FTL inhibitors friendly and block combat between both empires.</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAllianceNotificationResponse(alliance.id, false)}
                        className="min-h-[42px] rounded-md border border-rose-500/50 bg-rose-950/30 px-3 py-2 text-xs font-black uppercase tracking-wider text-rose-200 hover:bg-rose-900/45 hover:text-white"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleAllianceNotificationResponse(alliance.id, true)}
                        className="min-h-[42px] rounded-md border border-emerald-400/60 bg-emerald-950/40 px-3 py-2 text-xs font-black uppercase tracking-wider text-emerald-200 hover:bg-emerald-900/50 hover:text-white"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ 4. NEXT PHASE BUTTON (fixed bottom-right when it's my turn) ═══ */}
      {!realTimeMode && isMyActiveTurn && gameState.status === 'playing' && (
        <div className="fixed bottom-4 right-44 z-40">
          <button
            onClick={handleNextPhase}
            className="flex items-center space-x-2 px-5 py-3 scifi-btn scifi-btn-primary shadow-2xl rounded text-sm tracking-wider"
          >
            <span>
              {gameState.phase === 2 ? 'Complete Turn' : `Next Phase: ${phaseNames[(gameState.phase + 1) % 3]}`}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ═══ TURN NOTIFICATION OVERLAY ═══ */}
      {!realTimeMode && showTurnOverlay && isMyActiveTurn && gameState.status === 'playing' && (
        <div
          onClick={() => setShowTurnOverlay(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/72 backdrop-blur-sm cursor-pointer animate-fadeIn"
          role="button"
          aria-label="Dismiss your turn notification"
        >
          <div className="relative max-w-md w-[90%] border border-cyan-400/50 bg-slate-950/90 rounded-xl px-8 py-7 text-center shadow-[0_0_40px_rgba(34,211,238,0.28)] overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
            <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-cyan-300 mb-2">Command Uplink</div>
            <div className="text-3xl md:text-4xl font-extrabold uppercase tracking-widest text-white drop-shadow-[0_0_18px_rgba(125,211,252,0.55)]">
              Your Turn
            </div>
            <div className="mt-3 text-sm text-slate-300 font-mono">
              {phaseNames[gameState.phase]} phase · Turn #{gameState.turnNumber}
            </div>
            <div className="mt-5 text-[11px] uppercase tracking-wider text-slate-500">
              Click anywhere to dismiss
            </div>
          </div>
        </div>
      )}

      {/* ═══ 5. NODE DETAILS BOTTOM DRAWER (click-to-open) ═══ */}
      {selectedNode && (
        <NodeDetails
          node={selectedNode}
          gameState={gameState}
          myPlayerId={myPlayerId}
          selectedShip={selectedShip}
          onSelectShip={(ship) => { setSelectedFleetMove(null); setSelectedShip(ship); }}
          onSelectFleetMove={handleSelectFleetMove}
          selectedFleetMove={selectedFleetMove}
          onUpdateState={handleUpdateGameState}
          onClose={() => { setSelectedNode(null); setSelectedShip(null); setSelectedFleetMove(null); }}
        />
      )}

      {/* ═══ 6. DIPLOMACY / SETTINGS OVERLAYS ═══ */}
      {isDiplomacyOpen && (
        <DiplomacyPanel gameState={gameState} myPlayerId={myPlayerId} onClose={() => setIsDiplomacyOpen(false)} onUpdateState={handleUpdateGameState} />
      )}

      {isSettingsOpen && (
        <SettingsDialog onClose={() => setIsSettingsOpen(false)} onModeChanged={handleSettingsChanged} />
      )}

      {/* ═══ 7. VICTORY SCREEN ═══ */}
      {gameState.status === 'completed' && (
        <div className="fixed inset-0 z-50 bg-slate-950/92 backdrop-blur-lg flex flex-col justify-center items-center p-6 text-center animate-fadeIn pointer-events-auto">
          <div className="starfield" />
          <Sparkles className="h-16 w-16 text-amber-400 animate-bounce mb-4" />
          <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase mb-1">Sector Domination Secured</span>
          <h2 className="text-3xl font-extrabold uppercase tracking-widest text-white drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]">
            {gameState.winnerId === myPlayerId ? 'Victory is Yours!' : 'Empire Fallen'}
          </h2>
          <p className="text-sm text-slate-400 max-w-sm leading-normal mt-3">
            {gameState.winnerId === myPlayerId
              ? 'Your tactical superiority has conquered the final frontiers.'
              : `Commander ${gameState.players.find(p => p.id === gameState.winnerId)?.name} has established complete control.`}
          </p>
          <div className="mt-8 space-y-3 w-full max-w-xs">
            {myPlayerId === gameState.creatorId ? (
              <button onClick={handlePlayAgain} className="w-full scifi-btn scifi-btn-primary py-3">Launch Rematch</button>
            ) : (
              <div className="text-xs text-slate-500 font-mono py-2 bg-slate-950/50 border border-slate-900 rounded animate-pulse">
                Waiting for Sector Host to trigger Rematch...
              </div>
            )}
            {myPlayerId === gameState.creatorId && (
              <button onClick={handleReturnToLobby} className="w-full scifi-btn scifi-btn-secondary py-2">Reset to Lobby</button>
            )}
            <button onClick={handleReturnToMainLobby} className="w-full scifi-btn hover:text-white py-2">Return to Sector Command</button>
          </div>
        </div>
      )}

    </div>
  );
};
export default App;
