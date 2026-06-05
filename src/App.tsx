import React, { useState, useEffect } from 'react';
import { Lobby } from './components/Lobby';
import { SettingsDialog } from './components/SettingsDialog';
import { Map } from './components/Map';
import { NodeDetails } from './components/NodeDetails';
import { ChatPanel } from './components/ChatPanel';
import { SoundToggle } from './components/SoundToggle';
import type { GameState, StarNode, Ship } from './types';
import { subscribeToRoom, updateRoomState, getDbMode } from './services/database';
import type { DbMode } from './services/database';
import { checkWinCondition, getReachableNodes, processHealing, generateMap, resetGroundUnitBuildCounters } from './services/gameLogic';
import { audio } from './services/audio';
import { Sparkles, ArrowRight } from 'lucide-react';


export const App: React.FC = () => {
  const [view, setView] = useState<'lobby' | 'game'>('lobby');
  const [currentCode, setCurrentCode] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Game UI State
  const [selectedNode, setSelectedNode] = useState<StarNode | null>(null);
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [reachableNodes, setReachableNodes] = useState<{ [nodeId: string]: number }>({});

  // Settings Overlay
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [dbMode, setDbMode] = useState<DbMode>(() => getDbMode());

  // Fog of war setting
  const [fogOfWar, setFogOfWar] = useState(true);

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

  // Read URL query parameter for sharing link on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) audio.playBeep(400, 0.1);
  }, []);

  const handleSettingsChanged = () => setDbMode(getDbMode());

  // Connect to the game room
  const handleGameStart = (code: string, playerId: string) => {
    setCurrentCode(code);
    setMyPlayerId(playerId);
    localStorage.setItem('void_empires_active_game', code);
    localStorage.setItem('void_empires_player_id', playerId);
    setView('game');

    const unsub = subscribeToRoom(code, (newState) => {
      setGameState(newState);
      refreshSelectionsFromState(newState);
      const winner = checkWinCondition(newState);
      if (winner && newState.status !== 'completed') {
        const winState: GameState = {
          ...newState,
          status: 'completed',
          winnerId: winner.id,
          actionLog: [...newState.actionLog, `VICTORY! Commander ${winner.name} dominates the sector.`]
        };
        setGameState(winState);
        updateRoomState(code, winState);
        audio.playVictory();
      }
    });
    return () => unsub();
  };

  // Update reachable nodes when ship is selected
  useEffect(() => {
    if (!selectedShip || !gameState || !selectedNode) {
      setReachableNodes({});
      return;
    }
    const range = getReachableNodes(selectedNode.id, selectedShip, gameState.nodes, myPlayerId);
    setReachableNodes(range);
  }, [selectedShip, selectedNode, gameState, myPlayerId]);

  // Handle ship movement — NO auto-colonize; colony ships must use action in phase 2
  const handleMoveShip = async (targetNodeId: string) => {
    if (!gameState || !selectedShip) return;
    
    // Find the node where this ship actually resides to prevent duplication
    const startNode = gameState.nodes.find(n => n.ships.some(s => s.id === selectedShip.id));
    if (!startNode) return;

    if (reachableNodes[targetNodeId] === undefined) {
      audio.playBeep(160, 0.08);
      return;
    }

    audio.playMove();
    const costInMoves = reachableNodes[targetNodeId];

    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === startNode.id) {
        return { ...n, ships: n.ships.filter(s => s.id !== selectedShip.id) };
      }
      if (n.id === targetNodeId) {
        const movedShip: Ship = {
          ...selectedShip,
          movesLeft: Math.max(0, selectedShip.movesLeft - costInMoves),
          turnsInTerritory: 0
        };
        // NOTE: NO auto-claim here. Colony ships must be used during action phase (phase 2).
        return { ...n, ships: [...n.ships, movedShip] };
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      actionLog: [
        ...gameState.actionLog,
        `${gameState.players.find(p => p.id === myPlayerId)?.name}: Moved ${selectedShip.type} to ${
          gameState.nodes.find(n => n.id === targetNodeId)?.name
        } (cost: ${costInMoves})`
      ],
      lastAction: 'move_ship',
      lastActionAt: new Date().toISOString()
    };

    setSelectedShip(null);
    setGameState(updatedState);
    refreshSelectionsFromState(updatedState);
    await updateRoomState(currentCode, updatedState);
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
      nextPhase = 0;
      nextPlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
      if (nextPlayerIndex === 0) nextTurnNumber += 1;
      const newActivePlayer = gameState.players[nextPlayerIndex];
      logEntries.push(`=== TURN ${nextTurnNumber}: ${newActivePlayer.name} ===`);
      logEntries.push(`--- Phase 0: Planetary Build ---`);

      const ownedNodes = gameState.nodes.filter(n => n.claimedBy === newActivePlayer.id);
      const totalYield = ownedNodes.reduce((acc, curr) => acc + curr.resourceGeneration, 0);
      gameState.players = gameState.players.map(p =>
        p.id === newActivePlayer.id ? { ...p, resources: p.resources + totalYield } : p
      );
      logEntries.push(`Resource Yield: +${totalYield} Credits from ${ownedNodes.length} systems.`);

      const healingLogs = processHealing(gameState.nodes, newActivePlayer.id);
      logEntries.push(...healingLogs);

      gameState.nodes.forEach(node => {
        node.ships.forEach(ship => {
          if (ship.owner === newActivePlayer.id) ship.movesLeft = ship.type === 'Fighter' ? 0 : 6;
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
      turnStartedAt: new Date().toISOString()
    };

    setSelectedShip(null);
    setGameState(updatedState);
    refreshSelectionsFromState(updatedState);
    await updateRoomState(currentCode, updatedState);
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
      winnerId: null, lastUpdated: new Date().toISOString()
    };
    setSelectedNode(null); setSelectedShip(null);
    setGameState(updatedState);
    await updateRoomState(currentCode, updatedState);
  };

  const handleReturnToLobby = async () => {
    if (!gameState) return;
    audio.playBeep();
    const updatedState: GameState = {
      ...gameState, status: 'lobby',
      players: gameState.players.map(p => ({ ...p, ready: p.id === myPlayerId, homeworldId: '' })),
      nodes: [], winnerId: null, actionLog: ['Game ended. Returned to lobby.']
    };
    setSelectedNode(null); setSelectedShip(null);
    setGameState(updatedState);
    await updateRoomState(currentCode, updatedState);
  };

  const handleReturnToMainLobby = () => {
    audio.playBeep();
    setView('lobby'); setGameState(null); setCurrentCode('');
    setSelectedNode(null); setSelectedShip(null);
  };

  const handleUpdateGameState = async (updatedState: GameState) => {
    if (!gameState) return;
    const active = gameState.players[gameState.activePlayerIndex];
    if (gameState.status === 'playing' && active?.id !== myPlayerId) {
      audio.playBeep(160, 0.08);
      return;
    }
    const stamped: GameState = {
      ...updatedState,
      lastUpdated: new Date().toISOString(),
      lastActionAt: updatedState.lastActionAt || new Date().toISOString()
    };
    setGameState(stamped);
    refreshSelectionsFromState(stamped);
    await updateRoomState(currentCode, stamped);
  };

  // ───── LOBBY VIEW ─────
  if (view === 'lobby' || !gameState) {
    return (
      <>
        <Lobby onGameStart={handleGameStart} onOpenSettings={() => setIsSettingsOpen(true)} dbMode={dbMode} />
        {isSettingsOpen && (
          <SettingsDialog onClose={() => setIsSettingsOpen(false)} onModeChanged={handleSettingsChanged} />
        )}
      </>
    );
  }

  // ───── GAME VIEW ─────
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyActiveTurn = activePlayer.id === myPlayerId;
  const me = gameState.players.find(p => p.id === myPlayerId);

  const phaseNames = ['BUILD', 'MOVEMENT', 'ACTION'];
  const phaseColors: Record<number, string> = {
    0: 'text-indigo-300 bg-indigo-900/40 border-indigo-500/50',
    1: 'text-sky-300 bg-sky-900/30 border-sky-500/50',
    2: 'text-rose-300 bg-rose-900/30 border-rose-500/50'
  };
  const playerColorMap: Record<string, string> = {
    green: '#10b981', blue: '#3b82f6', purple: '#8b5cf6', yellow: '#f59e0b'
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-slate-950 select-none">

      {/* ═══ 1. STELLARIS-STYLE TOP HUD BAR ═══ */}
      {/* ═══ 1. STELLARIS-STYLE TOP HUD BAR ═══ */}
      {(() => {
        const myOwnedNodes = gameState.nodes.filter(n => n.claimedBy === myPlayerId);
        const myYield = myOwnedNodes.reduce((acc, curr) => acc + curr.resourceGeneration, 0);
        
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
                <span className="text-[8px] text-slate-500 font-mono uppercase tracking-widest leading-none">Turn</span>
                <span className="text-base font-bold text-slate-200 font-mono leading-tight">#{gameState.turnNumber}</span>
              </div>
              <div className={`flex flex-col justify-center px-2 py-0.5 border rounded text-center ${phaseColors[gameState.phase]}`}>
                <span className="text-[7px] opacity-60 leading-none uppercase tracking-wider">Phase</span>
                <span className="text-[10px] font-extrabold tracking-wider leading-tight">{phaseNames[gameState.phase]}</span>
              </div>
            </div>

            {/* CENTER: Stellaris resource bar */}
            <div className="flex-1 flex items-center px-4 overflow-x-auto gap-6 border-r border-slate-700/50">
              {/* Credits (Energy Credits) */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base">🪙</span>
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wider leading-none">Credits</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-amber-400 font-mono leading-none">{me?.resources}R</span>
                    <span className="text-[10px] text-emerald-400 font-bold font-mono leading-none">+{myYield}</span>
                  </div>
                </div>
              </div>

              {/* Controlled Systems */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base">🌌</span>
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wider leading-none">Systems</span>
                  <span className="text-sm font-bold text-slate-200 font-mono leading-none">{myOwnedNodes.length}</span>
                </div>
              </div>

              {/* Navy Strength */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base">🚀</span>
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wider leading-none">Navy</span>
                  <span className="text-sm font-bold text-indigo-300 font-mono leading-none">{myShipsCount}</span>
                </div>
              </div>

              {/* Ground forces */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base">🛡️</span>
                <div className="flex flex-col">
                  <span className="text-[8px] text-slate-500 font-mono uppercase tracking-wider leading-none">Garrisons</span>
                  <span className="text-sm font-bold text-amber-500 font-mono leading-none">{myGroundCount}</span>
                </div>
              </div>
            </div>

            {/* RIGHT: Active Turn + compact multiplayer slots */}
            <div className="flex items-center px-4 gap-3 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {gameState.players.map((player, idx) => {
                  const isActive = idx === gameState.activePlayerIndex;
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
                      title={`${player.name}${isMe ? ' (You)' : ''}${isActive ? " — Active Turn" : ""}`}
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

        {/* In-Game log console (top-left corner, desktop only) */}
        <div className="absolute left-3 top-3 z-10 w-56 max-h-32 bg-slate-900/80 border border-slate-700/60 rounded p-2 overflow-y-auto text-[9px] font-mono text-slate-400 space-y-0.5 pointer-events-auto shadow-lg hidden md:block backdrop-blur-sm">
          <div className="border-b border-slate-700 pb-1 mb-1 font-bold text-indigo-400 text-[9px] uppercase tracking-wider">Event Journal</div>
          {gameState.actionLog.slice(-12).reverse().map((log, idx) => (
            <div key={idx} className="leading-tight text-[9px] border-b border-slate-900/30 pb-0.5">{log}</div>
          ))}
        </div>

        {/* Waiting for turn — persistent top banner */}
        {!isMyActiveTurn && gameState.status === 'playing' && (
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

      {/* ═══ 4. NEXT PHASE BUTTON (fixed bottom-right when it's my turn) ═══ */}
      {isMyActiveTurn && gameState.status === 'playing' && (
        <div className="fixed bottom-4 right-4 z-40">
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

      {/* ═══ 5. NODE DETAILS BOTTOM DRAWER (click-to-open) ═══ */}
      {selectedNode && (
        <NodeDetails
          node={selectedNode}
          gameState={gameState}
          myPlayerId={myPlayerId}
          selectedShip={selectedShip}
          onSelectShip={setSelectedShip}
          onUpdateState={handleUpdateGameState}
          onClose={() => { setSelectedNode(null); setSelectedShip(null); }}
        />
      )}

      {/* ═══ 6. SETTINGS OVERLAY ═══ */}
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
