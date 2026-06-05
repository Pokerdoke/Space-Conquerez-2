import React, { useEffect, useMemo, useState } from 'react';
import type { GameState, StarNode, Ship } from '../types';
import { resolveSpaceCombat, invadePlanetWithCarriers, resolveGroundCombatRound, isHostileOwner } from '../services/gameLogic';
import { audio } from '../services/audio';
import { Swords, ShieldAlert, Crosshair, Eye } from 'lucide-react';

interface CombatPanelProps {
  node: StarNode;
  gameState: GameState;
  myPlayerId: string;
  onUpdateState: (newState: GameState) => void | Promise<void>;
}

const cloneNodeForCombat = (node: StarNode): StarNode => JSON.parse(JSON.stringify(node)) as StarNode;

const isCombatLogLine = (line: string) => {
  const lower = line.toLowerCase();
  return lower.includes('combat')
    || lower.includes('invaded')
    || lower.includes('invasion')
    || lower.includes('captured')
    || lower.includes('destroyed')
    || lower.includes('carrier cargo lost')
    || lower.includes('fired on');
};

export const CombatPanel: React.FC<CombatPanelProps> = ({
  node,
  gameState,
  myPlayerId,
  onUpdateState
}) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyTurn = activePlayer?.id === myPlayerId;
  const isCombatPhase = gameState.phase === 2;
  const perspectivePlayerId = isMyTurn ? myPlayerId : activePlayer?.id || myPlayerId;
  const isSpectating = isCombatPhase && !isMyTurn;

  const [selectedAttackerShipId, setSelectedAttackerShipId] = useState<string | null>(null);
  const [selectedDefenderShipId, setSelectedDefenderShipId] = useState<string | null>(null);
  const [selectedAttackerGroundId, setSelectedAttackerGroundId] = useState<string | null>(null);
  const [selectedDefenderGroundId, setSelectedDefenderGroundId] = useState<string | null>(null);
  const [combatReport, setCombatReport] = useState<string[]>([]);
  const [firingLaser, setFiringLaser] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lockedShipAttackerId, setLockedShipAttackerId] = useState<string | null>(null);
  const [lockedGroundAttackerId, setLockedGroundAttackerId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedAttackerShipId && !node.ships.some(s => s.id === selectedAttackerShipId)) {
      setSelectedAttackerShipId(null);
      setLockedShipAttackerId(null);
    }
    if (selectedDefenderShipId && !node.ships.some(s => s.id === selectedDefenderShipId)) setSelectedDefenderShipId(null);
    if (selectedAttackerGroundId && !node.groundUnits.some(g => g.id === selectedAttackerGroundId)) {
      setSelectedAttackerGroundId(null);
      setLockedGroundAttackerId(null);
    }
    if (selectedDefenderGroundId && !node.groundUnits.some(g => g.id === selectedDefenderGroundId)) setSelectedDefenderGroundId(null);
    setBusyAction(null);
  }, [node, gameState.lastUpdated, selectedAttackerShipId, selectedDefenderShipId, selectedAttackerGroundId, selectedDefenderGroundId]);

  useEffect(() => {
    if (!isMyTurn) {
      setSelectedAttackerShipId(null);
      setSelectedDefenderShipId(null);
      setSelectedAttackerGroundId(null);
      setSelectedDefenderGroundId(null);
      setLockedShipAttackerId(null);
      setLockedGroundAttackerId(null);
    }
  }, [isMyTurn, gameState.activePlayerIndex]);

  const liveCombatLog = useMemo(() => (
    gameState.actionLog.filter(isCombatLogLine).slice(-18).reverse()
  ), [gameState.actionLog]);

  if (!me || !activePlayer) return null;

  const getPlayerName = (ownerId: string) => {
    if (ownerId === 'npc') return 'Neutral Guardians';
    return gameState.players.find(p => p.id === ownerId)?.name || 'Unknown';
  };

  const getPlayerColorHex = (ownerId: string) => {
    if (ownerId === 'npc') return 'text-slate-500';
    const color = gameState.players.find(p => p.id === ownerId)?.color || 'green';
    const mappings = {
      green: 'text-emerald-400',
      blue: 'text-blue-400',
      purple: 'text-violet-400',
      yellow: 'text-amber-400'
    };
    return mappings[color];
  };

  const perspectiveName = getPlayerName(perspectivePlayerId);
  const myCombatShips = node.ships.filter(s => s.owner === perspectivePlayerId && s.type !== 'ColonyShip');
  const enemyCombatShips = node.ships.filter(s => isHostileOwner(gameState, perspectivePlayerId, s.owner) && s.type !== 'ColonyShip' && (s.blocksMovement || s.type === 'Fighter'));
  const myGroundUnits = node.groundUnits.filter(g => g.owner === perspectivePlayerId);
  const enemyGroundUnits = node.groundUnits.filter(g => isHostileOwner(gameState, perspectivePlayerId, g.owner));

  const hasSpaceCombatTargets = isCombatPhase && myCombatShips.length > 0 && enemyCombatShips.length > 0;
  const spaceCombatAvailable = isMyTurn && hasSpaceCombatTargets;
  const enemyShipsInOrbit = enemyCombatShips.length > 0;
  const invadingCarriers = node.ships.filter(s => s.owner === perspectivePlayerId && s.type === 'Carrier' && s.carriedUnits.length > 0);
  const invasionTroopCount = invadingCarriers.reduce((sum, carrier) => sum + carrier.carriedUnits.length, 0);
  const isEnemyOrNpcPlanet = node.isNpcPlanet || (node.claimedBy !== null && isHostileOwner(gameState, perspectivePlayerId, node.claimedBy));
  const canInvadePlanet = isMyTurn && isCombatPhase && isEnemyOrNpcPlanet && !enemyShipsInOrbit && invasionTroopCount > 0;
  const hasGroundCombatTargets = isCombatPhase && !enemyShipsInOrbit && myGroundUnits.length > 0 && enemyGroundUnits.length > 0;
  const groundCombatAvailable = isMyTurn && hasGroundCombatTargets;
  const hasAnyCombatWindow = isCombatPhase && (
    isEnemyOrNpcPlanet
    || myCombatShips.length > 0
    || enemyCombatShips.length > 0
    || myGroundUnits.length > 0
    || enemyGroundUnits.length > 0
    || gameState.activeCombatNodeId === node.id
  );

  const stampCombatState = (state: GameState, summary: string): GameState => ({
    ...state,
    activeCombatNodeId: node.id,
    activeCombatUpdatedAt: new Date().toISOString(),
    activeCombatSummary: summary
  });

  const handleSpaceCombat = () => {
    if (!isMyTurn || !selectedAttackerShipId || !selectedDefenderShipId || busyAction) return;
    if (lockedShipAttackerId && lockedShipAttackerId !== selectedAttackerShipId) return;

    const combatNode = cloneNodeForCombat(node);
    const attacker = combatNode.ships.find(s => s.id === selectedAttackerShipId);
    const defender = combatNode.ships.find(s => s.id === selectedDefenderShipId);
    if (!attacker || !defender) return;

    setLockedShipAttackerId(selectedAttackerShipId);
    setBusyAction('space');
    setFiringLaser(true);
    audio.playLaser();

    setTimeout(async () => {
      setFiringLaser(false);
      const res = resolveSpaceCombat(attacker, defender, combatNode, combatNode);
      const activePlayerName = getPlayerName(perspectivePlayerId);
      const roundDesc = [
        `[SPACE COMBAT] ${node.name}: ${activePlayerName}'s ${attacker.type} fired on ${getPlayerName(defender.owner)} ${defender.type}!`,
        `- Attacker dealt ${res.attackerDmg} damage (HP remaining: ${attacker.hp}/${attacker.maxHp})`,
        `- Defender dealt ${res.defenderDmg} damage (HP remaining: ${defender.hp}/${defender.maxHp})`
      ];

      if (res.attackerDestroyed) {
        audio.playExplosion();
        roundDesc.push(`- DESTROYED: Attacker ${attacker.type} exploded!`);
        if (res.carriedLossesCount > 0) roundDesc.push(`- CARRIER CARGO LOST: ${res.carriedLossesCount} units perished in deep space.`);
        setSelectedAttackerShipId(null);
      }
      if (res.defenderDestroyed) {
        audio.playExplosion();
        roundDesc.push(`- DESTROYED: Defender screen or ${defender.type} took critical damage!`);
        if (res.carriedLossesCount > 0) roundDesc.push(`- CARRIER CARGO LOST: ${res.carriedLossesCount} units perished in deep space.`);
        setSelectedDefenderShipId(null);
      }
      if (!combatNode.ships.some(s => isHostileOwner(gameState, perspectivePlayerId, s.owner) && s.type !== 'ColonyShip' && (s.blocksMovement || s.type === 'Fighter'))) {
        setLockedShipAttackerId(null);
      }

      setCombatReport(prev => [...roundDesc, ...prev]);
      const updatedNodes = gameState.nodes.map(n => n.id === combatNode.id ? combatNode : n);
      const updatedState: GameState = stampCombatState({
        ...gameState,
        nodes: updatedNodes,
        actionLog: [...gameState.actionLog, ...roundDesc],
        lastAction: 'space_combat_round',
        lastActionAt: new Date().toISOString()
      }, roundDesc[0]);
      await onUpdateState(updatedState);
      setBusyAction(null);
    }, 400);
  };

  const handleInvadePlanet = async () => {
    if (!canInvadePlanet || busyAction) return;
    setBusyAction('invade');
    try {
      audio.playMove();
      const result = invadePlanetWithCarriers(gameState, node.id, myPlayerId);
      if (result.report.length > 0) setCombatReport(prev => [...result.report, ...prev]);
      if (result.captured) { audio.playVictory(); setLockedGroundAttackerId(null); }
      if (result.startedGroundCombat) {
        setSelectedAttackerGroundId(null);
        setSelectedDefenderGroundId(null);
      }
      const summary = result.report[0] || `${getPlayerName(myPlayerId)} began an invasion at ${node.name}.`;
      await onUpdateState(stampCombatState(result.state, summary));
    } finally {
      setBusyAction(null);
    }
  };

  const handleGroundCombat = () => {
    if (!isMyTurn || !selectedAttackerGroundId || !selectedDefenderGroundId || busyAction) return;
    if (lockedGroundAttackerId && lockedGroundAttackerId !== selectedAttackerGroundId) return;
    setLockedGroundAttackerId(selectedAttackerGroundId);
    setBusyAction('ground');
    setFiringLaser(true);
    audio.playBeep(200, 0.15);

    setTimeout(async () => {
      setFiringLaser(false);
      const result = resolveGroundCombatRound(gameState, node.id, selectedAttackerGroundId, selectedDefenderGroundId, myPlayerId);
      if (!result) {
        setBusyAction(null);
        return;
      }
      if (result.attackerDestroyed) { setSelectedAttackerGroundId(null); setLockedGroundAttackerId(null); }
      if (result.defenderDestroyed) setSelectedDefenderGroundId(null);
      if (result.attackerDestroyed || result.defenderDestroyed) audio.playExplosion();
      if (result.captured) { audio.playVictory(); setLockedGroundAttackerId(null); }
      setCombatReport(prev => [...result.report, ...prev]);
      const summary = result.report[0] || `${getPlayerName(myPlayerId)} fought ground combat at ${node.name}.`;
      await onUpdateState(stampCombatState(result.state, summary));
      setBusyAction(null);
    }, 400);
  };

  return (
    <div className="space-y-4 max-h-[350px] overflow-y-auto p-1 font-mono">
      {firingLaser && (
        <div className="fixed inset-0 z-50 bg-red-600/10 pointer-events-none flex items-center justify-center animate-ping">
          <div className="text-2xl font-bold text-red-500 uppercase tracking-widest drop-shadow-[0_0_10px_red]">
            Firing Weapons...
          </div>
        </div>
      )}

      {isSpectating && (
        <div className="text-center text-xs text-cyan-300 py-3 bg-cyan-950/20 border border-cyan-900/50 rounded flex items-center justify-center gap-2">
          <Eye className="h-4 w-4" />
          <span>Live spectator view: watching {perspectiveName}'s action phase. Controls are locked until your turn.</span>
        </div>
      )}
      {isMyTurn && !isCombatPhase && (
        <div className="text-center text-xs text-slate-500 py-3 bg-slate-950/40 border border-slate-900 rounded">
          Combat options disabled: Must be in ATTACK phase
        </div>
      )}
      {isCombatPhase && !hasAnyCombatWindow && (
        <div className="text-center text-xs text-slate-500 py-3 bg-slate-950/40 border border-slate-900 rounded">
          No active combat information for this system yet.
        </div>
      )}

      {isCombatPhase && isEnemyOrNpcPlanet && (
        <div className="border border-amber-700/60 bg-amber-950/10 p-3 rounded space-y-2 invasion-pulse">
          <div className="flex justify-between items-center border-b border-amber-950/60 pb-2">
            <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5">
              <Swords className="h-3.5 w-3.5" />
              <span>PLANETARY INVASION</span>
            </span>
            <span className="text-[10px] text-slate-500">{perspectiveName}</span>
          </div>
          {enemyShipsInOrbit && (
            <div className="text-[10px] text-red-400/80 bg-red-950/10 border border-red-950/50 p-2 rounded flex items-start space-x-1.5">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Space must be cleared first. Enemy combat ships are still in orbit.</span>
            </div>
          )}
          {!enemyShipsInOrbit && invasionTroopCount === 0 && (
            <div className="text-[10px] text-slate-500 italic">Move one or more Carriers carrying ground units here to invade.</div>
          )}
          {!enemyShipsInOrbit && invasionTroopCount > 0 && (
            <div className="text-[10px] text-amber-300/90 bg-amber-950/10 border border-amber-900/30 p-2 rounded">
              Ready to drop <b>{invasionTroopCount}</b> troop(s) from <b>{invadingCarriers.length}</b> carrier(s). All loaded troops in this system will deploy to the surface.
            </div>
          )}
          <button
            onClick={handleInvadePlanet}
            disabled={!canInvadePlanet || busyAction !== null}
            className="w-full min-h-[44px] py-2.5 bg-red-950/30 border border-red-500 text-red-400 rounded hover:bg-red-900/20 font-bold uppercase text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40 scifi-danger-action"
          >
            <Crosshair className="h-4 w-4" />
            <span>{!isMyTurn ? 'Spectating Invasion' : busyAction === 'invade' ? 'Invading...' : 'Invade Planet'}</span>
          </button>
        </div>
      )}

      {isCombatPhase && (myCombatShips.length > 0 || enemyCombatShips.length > 0) && (
        <div className="border border-slate-800 bg-slate-950/20 p-3 rounded space-y-3">
          <div className="flex justify-between items-center border-b border-slate-850 pb-2">
            <span className="text-xs font-bold text-red-400 flex items-center space-x-1.5">
              <Swords className="h-3.5 w-3.5" />
              <span>ORBITAL ENGAGEMENT WINDOW</span>
            </span>
            <span className="text-[10px] text-slate-500">{perspectiveName}</span>
          </div>

          {!hasSpaceCombatTargets ? (
            <div className="text-[10px] text-slate-500 italic text-center py-2">No opposing combat fleets in orbit to target.</div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Select Attacking Ship</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {myCombatShips.map((s: Ship) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          if (!isMyTurn) return;
                          if (!lockedShipAttackerId || lockedShipAttackerId === s.id) { audio.playBeep(700, 0.04); setSelectedAttackerShipId(s.id); }
                        }}
                        disabled={!isMyTurn || Boolean(lockedShipAttackerId && lockedShipAttackerId !== s.id)}
                        className={`p-2 border text-left rounded text-[11px] transition-all disabled:opacity-40 ${selectedAttackerShipId === s.id ? 'border-emerald-500 bg-emerald-950/25 text-emerald-400' : 'border-slate-800 bg-slate-950/50 text-slate-400'}`}
                      >
                        <div className="font-bold">{s.type}</div>
                        <div className="text-[9px] text-slate-500 font-mono">HP: {s.hp}/{s.maxHp} | Dmg: {s.dmgMin}-{s.dmgMax}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Select Target Defender</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {enemyCombatShips.map((s: Ship) => (
                      <button
                        key={s.id}
                        onClick={() => { if (!isMyTurn) return; audio.playBeep(400, 0.04); setSelectedDefenderShipId(s.id); }}
                        disabled={!isMyTurn}
                        className={`p-2 border text-left rounded text-[11px] transition-all disabled:opacity-40 ${selectedDefenderShipId === s.id ? 'border-rose-500 bg-rose-950/25 text-rose-400' : 'border-slate-800 bg-slate-950/50 text-slate-400'}`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>{s.type}</span>
                          <span className={`text-[8px] font-bold ${getPlayerColorHex(s.owner)}`}>{getPlayerName(s.owner)}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">HP: {s.hp}/{s.maxHp} | Dmg: {s.dmgMin}-{s.dmgMax}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSpaceCombat}
                disabled={!spaceCombatAvailable || !selectedAttackerShipId || !selectedDefenderShipId || busyAction !== null}
                className="w-full py-2.5 bg-red-950/30 border border-red-500 text-red-400 rounded hover:bg-red-900/20 font-bold uppercase text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40"
              >
                <Crosshair className="h-4 w-4" />
                <span>{!isMyTurn ? 'Spectating Space Battle' : busyAction === 'space' ? 'Resolving...' : 'Initialize Space Battle'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {isCombatPhase && (myGroundUnits.length > 0 || enemyGroundUnits.length > 0) && (
        <div className="border border-slate-800 bg-slate-950/20 p-3 rounded space-y-3">
          <div className="flex justify-between items-center border-b border-slate-850 pb-2">
            <span className="text-xs font-bold text-amber-500 flex items-center space-x-1.5">
              <Swords className="h-3.5 w-3.5" />
              <span>SURFACE INVASION SECTOR</span>
            </span>
            <span className="text-[10px] text-slate-500">{perspectiveName}</span>
          </div>

          {enemyShipsInOrbit && (
            <div className="text-[10px] text-red-400/80 bg-red-950/10 border border-red-950/50 p-2 rounded flex items-start space-x-1.5">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
              <span>Ground invasion is blocked! You must clear all enemy ships from orbit before invading the planet surface.</span>
            </div>
          )}

          {!enemyShipsInOrbit && !hasGroundCombatTargets && (
            <div className="text-[10px] text-slate-500 italic text-center py-2">No surface combat division match available.</div>
          )}

          {!enemyShipsInOrbit && hasGroundCombatTargets && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Select Invasion Division</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {myGroundUnits.map(g => (
                      <button
                        key={g.id}
                        onClick={() => {
                          if (!isMyTurn) return;
                          if (!lockedGroundAttackerId || lockedGroundAttackerId === g.id) { audio.playBeep(700, 0.04); setSelectedAttackerGroundId(g.id); }
                        }}
                        disabled={!isMyTurn || Boolean(lockedGroundAttackerId && lockedGroundAttackerId !== g.id)}
                        className={`p-2 border text-left rounded text-[11px] transition-all disabled:opacity-40 ${selectedAttackerGroundId === g.id ? 'border-emerald-500 bg-emerald-950/25 text-emerald-400' : 'border-slate-800 bg-slate-950/50 text-slate-400'}`}
                      >
                        <div className="font-bold">Invading Troop</div>
                        <div className="text-[9px] text-slate-500 font-mono">HP: {g.hp}/{g.maxHp} | Dmg: {g.dmgMin}-{g.dmgMax}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Select Target Defender</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {enemyGroundUnits.map(g => (
                      <button
                        key={g.id}
                        onClick={() => { if (!isMyTurn) return; audio.playBeep(400, 0.04); setSelectedDefenderGroundId(g.id); }}
                        disabled={!isMyTurn}
                        className={`p-2 border text-left rounded text-[11px] transition-all disabled:opacity-40 ${selectedDefenderGroundId === g.id ? 'border-rose-500 bg-rose-950/25 text-rose-400' : 'border-slate-800 bg-slate-950/50 text-slate-400'}`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>Defending Garrison</span>
                          <span className={`text-[8px] font-bold ${getPlayerColorHex(g.owner)}`}>{getPlayerName(g.owner)}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">HP: {g.hp}/{g.maxHp} | Dmg: {g.dmgMin}-{g.dmgMax}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleGroundCombat}
                disabled={!groundCombatAvailable || !selectedAttackerGroundId || !selectedDefenderGroundId || busyAction !== null}
                className="w-full py-2.5 bg-amber-950/30 border border-amber-500 text-amber-400 rounded hover:bg-amber-900/20 font-bold uppercase text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40"
              >
                <Crosshair className="h-4 w-4" />
                <span>{!isMyTurn ? 'Spectating Ground Battle' : busyAction === 'ground' ? 'Resolving...' : 'Attack With Selected Troop'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {(combatReport.length > 0 || liveCombatLog.length > 0 || gameState.activeCombatSummary) && (
        <div className="space-y-1.5 border-t border-slate-900 pt-3">
          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide">Live Combat Engagement Log</span>
          {gameState.activeCombatSummary && (
            <div className="bg-cyan-950/20 border border-cyan-900/40 p-2 rounded text-[10px] text-cyan-300">
              {gameState.activeCombatSummary}
            </div>
          )}
          <div className="bg-slate-950/90 border border-slate-900 p-2.5 rounded max-h-[140px] overflow-y-auto text-[10px] space-y-1 font-mono text-slate-300">
            {(isSpectating ? liveCombatLog : combatReport.length > 0 ? combatReport : liveCombatLog).map((line, idx) => {
              const isHighlight = line.toLowerCase().includes('destroyed') || line.toLowerCase().includes('captured') || line.toLowerCase().includes('failed');
              return (
                <div key={`${idx}-${line}`} className={`${isHighlight ? 'text-rose-400 font-bold' : line.includes('COMBAT') ? 'text-cyan-400' : 'text-slate-400'}`}>
                  {line}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
