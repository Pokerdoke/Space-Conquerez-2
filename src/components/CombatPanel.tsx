import React, { useState } from 'react';
import type { GameState, StarNode } from '../types';
import { resolveSpaceCombat, resolveGroundCombat, invadePlanetWithCarrier } from '../services/gameLogic';
import { audio } from '../services/audio';
import { Swords, ShieldAlert, Crosshair } from 'lucide-react';


interface CombatPanelProps {
  node: StarNode;
  gameState: GameState;
  myPlayerId: string;
  onUpdateState: (newState: GameState) => void;
}

export const CombatPanel: React.FC<CombatPanelProps> = ({
  node,
  gameState,
  myPlayerId,
  onUpdateState
}) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const isMyTurn = gameState.players[gameState.activePlayerIndex].id === myPlayerId;
  const isCombatPhase = gameState.phase === 2;

  // Selected attacker/defender IDs
  const [selectedAttackerShipId, setSelectedAttackerShipId] = useState<string | null>(null);
  const [selectedDefenderShipId, setSelectedDefenderShipId] = useState<string | null>(null);

  const [selectedAttackerGroundId, setSelectedAttackerGroundId] = useState<string | null>(null);
  const [selectedDefenderGroundId, setSelectedDefenderGroundId] = useState<string | null>(null);

  // Local log for this combat encounter
  const [combatReport, setCombatReport] = useState<string[]>([]);
  const [firingLaser, setFiringLaser] = useState(false);

  if (!me) return null;

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

  // Group combat forces
  const myCombatShips = node.ships.filter(s => s.owner === myPlayerId && s.type !== 'ColonyShip');
  const enemyCombatShips = node.ships.filter(s => s.owner !== myPlayerId && s.type !== 'ColonyShip' && s.blocksMovement);
  
  const myGroundUnits = node.groundUnits.filter(g => g.owner === myPlayerId);
  const enemyGroundUnits = node.groundUnits.filter(g => g.owner !== myPlayerId);

  // Combat status flags
  const spaceCombatAvailable = isMyTurn && isCombatPhase && myCombatShips.length > 0 && enemyCombatShips.length > 0;
  
  // Ground combat is available ONLY when no enemy ships are in orbit
  const enemyShipsInOrbit = enemyCombatShips.length > 0;
  const invadingCarrier = node.ships.find(s => s.owner === myPlayerId && s.type === 'Carrier' && s.carriedUnits.length > 0);
  const canInvadePlanet = isMyTurn && isCombatPhase && Boolean(invadingCarrier) && !enemyShipsInOrbit && (node.isNpcPlanet || (node.claimedBy !== null && node.claimedBy !== myPlayerId));
  const groundCombatAvailable = isMyTurn && isCombatPhase && !enemyShipsInOrbit && myGroundUnits.length > 0 && enemyGroundUnits.length > 0;

  // Space Combat resolution handler
  const handleSpaceCombat = () => {
    if (!selectedAttackerShipId || !selectedDefenderShipId) return;

    const attacker = node.ships.find(s => s.id === selectedAttackerShipId);
    const defender = node.ships.find(s => s.id === selectedDefenderShipId);

    if (!attacker || !defender) return;

    // Trigger lasers visual and sound
    setFiringLaser(true);
    audio.playLaser();

    setTimeout(() => {
      setFiringLaser(false);
      const res = resolveSpaceCombat(attacker, defender, node, node);

      // Construct detailed combat description
      const roundDesc = [
        `[SPACE COMBAT] ${attacker.type} fired on ${defender.type}!`,
        `- Attacker dealt ${res.attackerDmg} damage (HP remaining: ${attacker.hp}/${attacker.maxHp})`,
        `- Defender dealt ${res.defenderDmg} damage (HP remaining: ${defender.hp}/${defender.maxHp})`
      ];

      if (res.attackerDestroyed) {
        audio.playExplosion();
        roundDesc.push(`- DESTROYED: Attacker ${attacker.type} exploded!`);
        if (res.carriedLossesCount > 0) {
          roundDesc.push(`- CARRIER CARGO LOST: ${res.carriedLossesCount} units perished in deep space.`);
        }
        setSelectedAttackerShipId(null);
      }
      if (res.defenderDestroyed) {
        audio.playExplosion();
        roundDesc.push(`- DESTROYED: Defender ${defender.type} exploded!`);
        if (res.carriedLossesCount > 0) {
          roundDesc.push(`- CARRIER CARGO LOST: ${res.carriedLossesCount} units perished in deep space.`);
        }
        setSelectedDefenderShipId(null);
      }

      setCombatReport(prev => [...roundDesc, ...prev]);

      // Apply changes to database
      const updatedNodes = gameState.nodes.map(n => {
        if (n.id === node.id) {
          return { ...node }; // Modified in-place by resolveSpaceCombat
        }
        return n;
      });

      const updatedState: GameState = {
        ...gameState,
        nodes: updatedNodes,
        actionLog: [...gameState.actionLog, ...roundDesc]
      };

      onUpdateState(updatedState);
    }, 400);
  };

  const handleInvadePlanet = () => {
    if (!invadingCarrier || !canInvadePlanet) return;
    audio.playMove();
    const updatedState = invadePlanetWithCarrier(gameState, node.id, invadingCarrier.id, myPlayerId);
    const newNode = updatedState.nodes.find(n => n.id === node.id);
    const latestLog = updatedState.actionLog.slice(-2);
    setCombatReport(prev => [...latestLog, ...prev]);
    if (newNode?.claimedBy === myPlayerId && !newNode.groundUnits.some(g => g.owner !== myPlayerId)) {
      audio.playVictory();
    }
    onUpdateState(updatedState);
  };

  // Ground Combat resolution handler
  const handleGroundCombat = () => {
    if (!selectedAttackerGroundId || !selectedDefenderGroundId) return;

    const attacker = node.groundUnits.find(g => g.id === selectedAttackerGroundId);
    const defender = node.groundUnits.find(g => g.id === selectedDefenderGroundId);

    if (!attacker || !defender) return;

    setFiringLaser(true);
    audio.playBeep(200, 0.15); // Bullet noise

    setTimeout(() => {
      setFiringLaser(false);
      const res = resolveGroundCombat(attacker, defender, node);

      const roundDesc = [
        `[GROUND COMBAT] Invasion force clashed on surface of ${node.name}!`,
        `- Invader dealt ${res.attackerDmg} damage (HP remaining: ${attacker.hp}/${attacker.maxHp})`,
        `- Defender dealt ${res.defenderDmg} damage (HP remaining: ${defender.hp}/${defender.maxHp})`
      ];

      if (res.attackerDestroyed) {
        audio.playExplosion();
        roundDesc.push(`- DESTROYED: Invading division eliminated!`);
        setSelectedAttackerGroundId(null);
      }
      
      let captured = false;
      if (res.defenderDestroyed) {
        audio.playExplosion();
        roundDesc.push(`- DESTROYED: Defending garrison eliminated!`);
        setSelectedDefenderGroundId(null);

        // Check if all enemy/neutral defenders are dead to capture planet!
        const remainingDefenders = node.groundUnits.filter(g => g.owner !== myPlayerId);
        if (remainingDefenders.length === 0) {
          captured = true;
          roundDesc.push(`- Planet captured! ${me.name} has captured the surface of ${node.name}!`);
        }
      }

      setCombatReport(prev => [...roundDesc, ...prev]);

      // Apply changes
      const updatedNodes = gameState.nodes.map(n => {
        if (n.id === node.id) {
          const updatedNode = { ...node }; // Modified in-place by resolveGroundCombat
          if (captured) {
            updatedNode.claimedBy = myPlayerId;
            updatedNode.isNpcPlanet = false;
            // Downgrade planet slightly due to intense bombardment (optional but fun 4X trope!)
            if (updatedNode.development === 'metropolis') {
              updatedNode.development = 'city';
              updatedNode.resourceGeneration = 4;
              roundDesc.push(`- Infrastructure damaged: Metropolis downgraded to City.`);
            }
            // Align ground units owner to me if any neutral survived (none did, but safety)
            updatedNode.groundUnits.forEach(gu => {
              gu.owner = myPlayerId;
            });
          }
          return updatedNode;
        }
        return n;
      });

      const updatedState: GameState = {
        ...gameState,
        nodes: updatedNodes,
        actionLog: [...gameState.actionLog, ...roundDesc]
      };

      onUpdateState(updatedState);
    }, 400);
  };

  return (
    <div className="space-y-4 max-h-[350px] overflow-y-auto p-1 font-mono">
      
      {/* Laser firing visual overlay */}
      {firingLaser && (
        <div className="fixed inset-0 z-50 bg-red-600/10 pointer-events-none flex items-center justify-center animate-ping">
          <div className="text-2xl font-bold text-red-500 uppercase tracking-widest drop-shadow-[0_0_10px_red]">
            Firing Weapons...
          </div>
        </div>
      )}

      {/* Basic state warnings */}
      {!isMyTurn && (
        <div className="text-center text-xs text-slate-500 py-3 bg-slate-950/40 border border-slate-900 rounded">
          Combat options disabled: Not your active turn
        </div>
      )}
      {isMyTurn && !isCombatPhase && (
        <div className="text-center text-xs text-slate-500 py-3 bg-slate-950/40 border border-slate-900 rounded">
          Combat options disabled: Must be in ATTACK phase
        </div>
      )}

      {/* PLANETARY INVASION MODULE */}
      {isCombatPhase && isMyTurn && (node.isNpcPlanet || (node.claimedBy !== null && node.claimedBy !== myPlayerId)) && (
        <div className="border border-amber-700/60 bg-amber-950/10 p-3 rounded space-y-2 invasion-pulse">
          <div className="flex justify-between items-center border-b border-amber-950/60 pb-2">
            <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5">
              <Swords className="h-3.5 w-3.5" />
              <span>PLANETARY INVASION</span>
            </span>
            <span className="text-[10px] text-slate-500">Carrier Troops Required</span>
          </div>
          {enemyShipsInOrbit && (
            <div className="text-[10px] text-red-400/80 bg-red-950/10 border border-red-950/50 p-2 rounded flex items-start space-x-1.5">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Space must be cleared first. Enemy combat ships are still in orbit.</span>
            </div>
          )}
          {!invadingCarrier && !enemyShipsInOrbit && (
            <div className="text-[10px] text-slate-500 italic">Move a Carrier carrying at least one ground unit here to invade.</div>
          )}
          <button
            onClick={handleInvadePlanet}
            disabled={!canInvadePlanet}
            className="w-full min-h-[44px] py-2.5 bg-red-950/30 border border-red-500 text-red-400 rounded hover:bg-red-900/20 font-bold uppercase text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40 scifi-danger-action"
          >
            <Crosshair className="h-4 w-4" />
            <span>Invade Planet</span>
          </button>
        </div>
      )}

      {/* SPACE COMBAT MODULE */}
      {isCombatPhase && isMyTurn && (myCombatShips.length > 0 || enemyCombatShips.length > 0) && (
        <div className="border border-slate-800 bg-slate-950/20 p-3 rounded space-y-3">
          <div className="flex justify-between items-center border-b border-slate-850 pb-2">
            <span className="text-xs font-bold text-red-400 flex items-center space-x-1.5">
              <Swords className="h-3.5 w-3.5" />
              <span>ORBITAL ENGAGEMENT WINDOW</span>
            </span>
            <span className="text-[10px] text-slate-500">Space Phase</span>
          </div>

          {!spaceCombatAvailable ? (
            <div className="text-[10px] text-slate-500 italic text-center py-2">
              No opposing combat fleets in orbit to target.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Stack Attacker/Defender lists vertically for mobile */}
              <div className="space-y-2">
                {/* Attacker List */}
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Select Attacking Ship</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {myCombatShips.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { audio.playBeep(700, 0.04); setSelectedAttackerShipId(s.id); }}
                        className={`p-2 border text-left rounded text-[11px] transition-all ${
                          selectedAttackerShipId === s.id
                            ? 'border-emerald-500 bg-emerald-950/25 text-emerald-400'
                            : 'border-slate-800 bg-slate-950/50 text-slate-400'
                        }`}
                      >
                        <div className="font-bold">{s.type}</div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          HP: {s.hp}/{s.maxHp} | Dmg: {s.dmgMin}-{s.dmgMax}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Defender List */}
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Select Target Defender</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {enemyCombatShips.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { audio.playBeep(400, 0.04); setSelectedDefenderShipId(s.id); }}
                        className={`p-2 border text-left rounded text-[11px] transition-all ${
                          selectedDefenderShipId === s.id
                            ? 'border-rose-500 bg-rose-950/25 text-rose-400'
                            : 'border-slate-800 bg-slate-950/50 text-slate-400'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>{s.type}</span>
                          <span className={`text-[8px] font-bold ${getPlayerColorHex(s.owner)}`}>
                            {getPlayerName(s.owner)}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          HP: {s.hp}/{s.maxHp} | Dmg: {s.dmgMin}-{s.dmgMax}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fire space laser */}
              <button
                onClick={handleSpaceCombat}
                disabled={!selectedAttackerShipId || !selectedDefenderShipId}
                className="w-full py-2.5 bg-red-950/30 border border-red-500 text-red-400 rounded hover:bg-red-900/20 font-bold uppercase text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40"
              >
                <Crosshair className="h-4 w-4" />
                <span>Initialize Space Battle</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SURFACE COMBAT MODULE */}
      {isCombatPhase && isMyTurn && (myGroundUnits.length > 0 || enemyGroundUnits.length > 0) && (
        <div className="border border-slate-800 bg-slate-950/20 p-3 rounded space-y-3">
          <div className="flex justify-between items-center border-b border-slate-850 pb-2">
            <span className="text-xs font-bold text-amber-500 flex items-center space-x-1.5">
              <Swords className="h-3.5 w-3.5" />
              <span>SURFACE INVASION SECTOR</span>
            </span>
            <span className="text-[10px] text-slate-500">Ground Phase</span>
          </div>

          {enemyShipsInOrbit && (
            <div className="text-[10px] text-red-400/80 bg-red-950/10 border border-red-950/50 p-2 rounded flex items-start space-x-1.5">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
              <span>Ground invasion is blocked! You must clear all enemy ships from orbit before invading the planet surface.</span>
            </div>
          )}

          {!enemyShipsInOrbit && !groundCombatAvailable && (
            <div className="text-[10px] text-slate-500 italic text-center py-2">
              No surface combat division match available.
            </div>
          )}

          {!enemyShipsInOrbit && groundCombatAvailable && (
            <div className="space-y-3">
              <div className="space-y-2">
                {/* Attacking Ground Units */}
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Select Invasion Division</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {myGroundUnits.map(g => (
                      <button
                        key={g.id}
                        onClick={() => { audio.playBeep(700, 0.04); setSelectedAttackerGroundId(g.id); }}
                        className={`p-2 border text-left rounded text-[11px] transition-all ${
                          selectedAttackerGroundId === g.id
                            ? 'border-emerald-500 bg-emerald-950/25 text-emerald-400'
                            : 'border-slate-800 bg-slate-950/50 text-slate-400'
                        }`}
                      >
                        <div className="font-bold">Garrison Unit</div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          HP: {g.hp}/{g.maxHp} | Dmg: {g.dmgMin}-{g.dmgMax}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Defending Ground Units */}
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Select Target Defender</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {enemyGroundUnits.map(g => (
                      <button
                        key={g.id}
                        onClick={() => { audio.playBeep(400, 0.04); setSelectedDefenderGroundId(g.id); }}
                        className={`p-2 border text-left rounded text-[11px] transition-all ${
                          selectedDefenderGroundId === g.id
                            ? 'border-rose-500 bg-rose-950/25 text-rose-400'
                            : 'border-slate-800 bg-slate-950/50 text-slate-400'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>Garrison</span>
                          <span className={`text-[8px] font-bold ${getPlayerColorHex(g.owner)}`}>
                            {getPlayerName(g.owner)}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          HP: {g.hp}/{g.maxHp} | Dmg: {g.dmgMin}-{g.dmgMax}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fire ground weapon */}
              <button
                onClick={handleGroundCombat}
                disabled={!selectedAttackerGroundId || !selectedDefenderGroundId}
                className="w-full py-2.5 bg-amber-950/30 border border-amber-500 text-amber-400 rounded hover:bg-amber-900/20 font-bold uppercase text-xs flex items-center justify-center space-x-1.5 disabled:opacity-40"
              >
                <Crosshair className="h-4 w-4" />
                <span>Initialize Ground Invasion</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* COMBAT REPORT JOURNAL */}
      {combatReport.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-900 pt-3">
          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide">Combat Engagement Log</span>
          <div className="bg-slate-950/90 border border-slate-900 p-2.5 rounded max-h-[140px] overflow-y-auto text-[10px] space-y-1 font-mono text-slate-300">
            {combatReport.map((line, idx) => {
              const isHighlight = line.includes('DESTROYED') || line.includes('PLANET CAPTURED');
              return (
                <div
                  key={idx}
                  className={`${isHighlight ? 'text-rose-400 font-bold' : line.includes('FIRE') ? 'text-cyan-400' : 'text-slate-400'}`}
                >
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
