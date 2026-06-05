import React, { useEffect, useState } from 'react';
import type { GameState, StarNode, Ship, GroundUnit } from '../types';
import { audio } from '../services/audio';
import { Navigation, PackageOpen, Plus, Minus, Shield } from 'lucide-react';
import { loadGroundUnitToCarrier, unloadGroundUnitFromCarrier } from '../services/gameLogic';

interface FleetPanelProps {
  node: StarNode;
  gameState: GameState;
  myPlayerId: string;
  selectedShip: Ship | null;
  onSelectShip: (ship: Ship | null) => void;
  onUpdateState: (newState: GameState) => void;
}

const troopButtonKey = (action: string, carrierId: string, unitId: string) => `${action}:${carrierId}:${unitId}`;

export const FleetPanel: React.FC<FleetPanelProps> = ({
  node,
  gameState,
  myPlayerId,
  selectedShip,
  onSelectShip,
  onUpdateState
}) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyTurn = activePlayer?.id === myPlayerId;
  const isMovePhase = gameState.phase === 1;
  const isFriendlyNode = node.claimedBy === myPlayerId;
  const [busyTroops, setBusyTroops] = useState<Set<string>>(new Set());
  const [expandedCarrierId, setExpandedCarrierId] = useState<string | null>(null);

  useEffect(() => {
    // When a Realtime/local state update arrives, the server-confirmed state is now visible.
    setBusyTroops(new Set());
  }, [gameState.lastUpdated, gameState.lastActionAt, node.groundUnits.length, node.ships.length]);

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

  const handleSelectShipForMove = (ship: Ship) => {
    if (!isMyTurn || !isMovePhase) return;
    audio.playBeep(600, 0.05);
    onSelectShip(selectedShip?.id === ship.id ? null : ship);
  };

  const handleColonize = (colonyShip: Ship) => {
    if (!isMyTurn || gameState.phase !== 2 || node.claimedBy !== null || node.groundUnits.length > 0) return;
    audio.playColonize();
    const updatedNodes = gameState.nodes.map(n => {
      if (n.id !== node.id) return n;
      return {
        ...n,
        claimedBy: myPlayerId,
        development: 'colony' as const,
        resourceGeneration: 2,
        ships: n.ships.filter(s => s.id !== colonyShip.id),
        isNpcPlanet: false
      };
    });
    onSelectShip(null);
    onUpdateState({
      ...gameState,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: Colonized system ${node.name}. Colony ship consumed.`],
      lastAction: 'colonize',
      lastActionAt: new Date().toISOString()
    });
  };

  const handleLoadTroop = (carrier: Ship, unit: GroundUnit) => {
    const key = troopButtonKey('load', carrier.id, unit.id);
    if (busyTroops.has(key)) return;
    setBusyTroops(prev => new Set(prev).add(key));
    audio.playBeep(700, 0.04);
    onUpdateState(loadGroundUnitToCarrier(gameState, node.id, carrier.id, unit.id, myPlayerId));
  };

  const handleUnloadTroop = (carrier: Ship, unit: GroundUnit) => {
    const key = troopButtonKey('unload', carrier.id, unit.id);
    if (busyTroops.has(key)) return;
    setBusyTroops(prev => new Set(prev).add(key));
    audio.playBeep(600, 0.04);
    onUpdateState(unloadGroundUnitFromCarrier(gameState, node.id, carrier.id, unit.id, myPlayerId));
  };

  const friendlyGroundUnits = node.groundUnits.filter(g => g.owner === myPlayerId);
  const friendlyCarriers = node.ships.filter(s => s.type === 'Carrier' && s.owner === myPlayerId);
  const canManageTroops = isMyTurn && isMovePhase && isFriendlyNode;

  return (
    <div className="space-y-4 max-h-[350px] overflow-y-auto p-1">
      {!isMyTurn && (
        <div className="text-center text-xs text-slate-500 py-3 bg-slate-950/40 border border-slate-900 rounded font-mono">
          Waiting for {activePlayer?.name || 'the active player'} — fleet orders disabled.
        </div>
      )}

      <div>
        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
          Orbiting Space Fleets ({node.ships.length})
        </span>

        {node.ships.length === 0 ? (
          <div className="text-[11px] text-slate-600 font-mono italic p-2 border border-slate-900 bg-slate-950/20 text-center rounded">
            No orbital fleets present.
          </div>
        ) : (
          <div className="space-y-2">
            {node.ships.map(ship => {
              const isOwner = ship.owner === myPlayerId;
              const isCurrentlySelected = selectedShip?.id === ship.id;
              const isCarrier = ship.type === 'Carrier';
              const canMoveThisShip = isMyTurn && isOwner && isMovePhase && ship.canMove && ship.movesLeft > 0;
              const canColonize = isMyTurn && isOwner && gameState.phase === 2 && ship.type === 'ColonyShip' && node.claimedBy === null && node.groundUnits.length === 0;
              const carrierExpanded = expandedCarrierId === ship.id;

              return (
                <div
                  key={ship.id}
                  className={`p-3 border rounded bg-slate-950/50 flex flex-col space-y-2 transition-all ${
                    isCurrentlySelected
                      ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.15)] bg-slate-900/60'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-200">{ship.type}</span>
                        <span className={`text-[9px] font-mono font-bold uppercase ${getPlayerColorHex(ship.owner)}`}>
                          [{getPlayerName(ship.owner)}]
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                        HP: {ship.hp}/{ship.maxHp} | DMG: {ship.dmgMin}-{ship.dmgMax} | Speed: {ship.movesLeft}J
                      </span>
                    </div>

                    {isOwner && (
                      <div className="flex items-center flex-wrap justify-end gap-1.5">
                        {isMovePhase && ship.canMove && (
                          <button
                            onClick={() => handleSelectShipForMove(ship)}
                            disabled={!canMoveThisShip}
                            className={`min-h-[44px] flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold uppercase border rounded transition-all ${
                              isCurrentlySelected
                                ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-40'
                            }`}
                          >
                            <Navigation className="h-3 w-3" />
                            <span>{isCurrentlySelected ? 'Selected' : 'Move'}</span>
                          </button>
                        )}

                        {canColonize && (
                          <button
                            onClick={() => handleColonize(ship)}
                            className="min-h-[44px] px-2.5 py-1 text-[10px] font-bold uppercase bg-emerald-500/20 border border-emerald-500 text-emerald-400 rounded hover:bg-emerald-500/30"
                          >
                            Colonize
                          </button>
                        )}

                        {isCarrier && (
                          <button
                            onClick={() => setExpandedCarrierId(carrierExpanded ? null : ship.id)}
                            className="min-h-[44px] flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold uppercase bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 rounded"
                          >
                            <PackageOpen className="h-3 w-3" />
                            <span>Troops</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isCarrier && (
                    <div className="bg-slate-950/70 border border-slate-900/60 p-2 rounded text-[10px] font-mono text-slate-400 space-y-2">
                      <div className="flex justify-between items-center text-[9px] text-slate-500 border-b border-slate-900 pb-1 font-bold">
                        <span>CARRIER TROOP BAY</span>
                        <span>Carrying: {ship.carriedUnits.length}/3</span>
                      </div>

                      {ship.carriedUnits.length === 0 ? (
                        <div className="text-[9px] text-slate-600 italic">No ground units loaded.</div>
                      ) : (
                        <div className="space-y-1">
                          {ship.carriedUnits.map((unit, idx) => {
                            const key = troopButtonKey('unload', ship.id, unit.id);
                            return (
                              <div key={unit.id} className="flex justify-between gap-2 items-center text-amber-500 font-semibold">
                                <span>• Troop {idx + 1} ({unit.hp}/{unit.maxHp} HP)</span>
                                {canManageTroops && (
                                  <button
                                    onClick={() => handleUnloadTroop(ship, unit)}
                                    disabled={busyTroops.has(key)}
                                    className="min-h-[44px] text-[8px] font-bold uppercase px-2 py-1 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-500 transition-all disabled:opacity-40"
                                  >
                                    {busyTroops.has(key) ? 'Saving...' : 'Unload'}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {carrierExpanded && (
                        <div className="border border-indigo-950 bg-indigo-950/15 p-3 rounded space-y-3 animate-fadeIn">
                          {!canManageTroops && (
                            <div className="text-[10px] text-slate-500 bg-slate-950/50 border border-slate-900 p-2 rounded">
                              Troop loading/unloading requires your Move phase on a friendly node.
                            </div>
                          )}

                          {canManageTroops && (
                            <>
                              <div>
                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1 font-mono">
                                  Load Troops from Surface
                                </div>
                                {friendlyGroundUnits.length === 0 ? (
                                  <div className="text-[10px] text-slate-600 font-mono italic">No friendly ground units available here.</div>
                                ) : (
                                  <div className="space-y-1">
                                    {friendlyGroundUnits.map((unit, idx) => {
                                      const key = troopButtonKey('load', ship.id, unit.id);
                                      const full = ship.carriedUnits.length >= 3;
                                      return (
                                        <div key={unit.id} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                                          <span className="text-slate-400 font-mono">Troop {idx + 1} ({unit.hp}/{unit.maxHp} HP)</span>
                                          <button
                                            onClick={() => handleLoadTroop(ship, unit)}
                                            disabled={full || busyTroops.has(key)}
                                            className="min-h-[44px] px-2 rounded bg-slate-900 border border-slate-800 hover:border-emerald-500 text-emerald-400 disabled:opacity-30"
                                          >
                                            {busyTroops.has(key) ? '...' : <Plus className="h-3 w-3" />}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {ship.carriedUnits.length > 0 && (
                                <div>
                                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1 font-mono">
                                    Unload Troops to Surface
                                  </div>
                                  <div className="space-y-1">
                                    {ship.carriedUnits.map((unit, idx) => {
                                      const key = troopButtonKey('unload', ship.id, unit.id);
                                      return (
                                        <div key={unit.id} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                                          <span className="text-amber-500 font-mono">Cargo Troop {idx + 1} ({unit.hp}/{unit.maxHp} HP)</span>
                                          <button
                                            onClick={() => handleUnloadTroop(ship, unit)}
                                            disabled={busyTroops.has(key)}
                                            className="min-h-[44px] px-2 rounded bg-slate-900 border border-slate-800 hover:border-red-500 text-red-400 disabled:opacity-30"
                                          >
                                            {busyTroops.has(key) ? '...' : <Minus className="h-3 w-3" />}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
          Ground Units on Surface ({node.groundUnits.length})
        </span>

        {node.groundUnits.length === 0 ? (
          <div className="text-[11px] text-slate-600 font-mono italic p-2 border border-slate-900 bg-slate-950/20 text-center rounded">
            No ground divisions stationed here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {node.groundUnits.map(unit => {
              const pct = Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100)));
              const loadCarrier = friendlyCarriers.find(c => c.carriedUnits.length < 3);
              const key = loadCarrier ? troopButtonKey('load', loadCarrier.id, unit.id) : '';
              return (
                <div key={unit.id} className="p-2.5 border border-slate-800 bg-slate-950/30 rounded flex justify-between items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <Shield className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-bold text-slate-300 font-mono">Ground Unit</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded mt-1 overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                      HP: {unit.hp}/{unit.maxHp} | DMG: {unit.dmgMin}-{unit.dmgMax}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`text-[10px] font-mono font-bold uppercase ${getPlayerColorHex(unit.owner)}`}>
                      {getPlayerName(unit.owner)}
                    </span>
                    {canManageTroops && unit.owner === myPlayerId && loadCarrier && (
                      <button
                        onClick={() => handleLoadTroop(loadCarrier, unit)}
                        disabled={busyTroops.has(key)}
                        className="min-h-[44px] px-2 py-1 text-[9px] font-bold uppercase bg-indigo-500/20 border border-indigo-500 text-indigo-400 rounded hover:bg-indigo-500/30 disabled:opacity-40"
                      >
                        {busyTroops.has(key) ? 'Saving...' : 'Load Troop'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
