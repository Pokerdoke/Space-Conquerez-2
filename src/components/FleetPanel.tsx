import React, { useState } from 'react';
import type { GameState, StarNode, Ship, GroundUnit } from '../types';
import { audio } from '../services/audio';
import { Navigation, ChevronDown, ChevronUp, PackageOpen, Plus, Minus } from 'lucide-react';

interface FleetPanelProps {
  node: StarNode;
  gameState: GameState;
  myPlayerId: string;
  selectedShip: Ship | null;
  onSelectShip: (ship: Ship | null) => void;
  onUpdateState: (newState: GameState) => void;
}

export const FleetPanel: React.FC<FleetPanelProps> = ({
  node,
  gameState,
  myPlayerId,
  selectedShip,
  onSelectShip,
  onUpdateState
}) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const isMyTurn = gameState.players[gameState.activePlayerIndex].id === myPlayerId;


  // Carrier Management State
  const [managingCarrierId, setManagingCarrierId] = useState<string | null>(null);
  
  // Pending load state for the selected carrier: list of unit IDs
  const [pendingCarriedFighters, setPendingCarriedFighters] = useState<Ship[]>([]);
  const [pendingCarriedGround, setPendingCarriedGround] = useState<GroundUnit[]>([]);

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

  // Toggle movement select
  const handleSelectShipForMove = (ship: Ship) => {
    audio.playBeep(600, 0.05);
    if (selectedShip && selectedShip.id === ship.id) {
      onSelectShip(null);
    } else {
      onSelectShip(ship);
    }
  };

  // Colonize command
  const handleColonize = (colonyShip: Ship) => {
    audio.playColonize();
    
    // Consume colony ship
    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === node.id) {
        return {
          ...n,
          claimedBy: myPlayerId,
          development: 'colony' as const,
          resourceGeneration: 2,
          ships: n.ships.filter(s => s.id !== colonyShip.id)
        };
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: Colonized system ${node.name}. Colony ship consumed.`]
    };

    onSelectShip(null);
    onUpdateState(updatedState);
  };

  // Invade command: deploy ground units from Carrier to planet orbit
  // Invade command: deploy ground units from Carrier to planet surface
  const handleInvade = (carrier: Ship) => {
    audio.playMove();

    // Move carried ground units to the planet's surface
    const deployedUnits = [...carrier.carriedUnits];

    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === node.id) {
        // Find carrier on node and update it, add ground units to node
        const updatedShips = n.ships.map(s => {
          if (s.id === carrier.id) {
            return { ...s, carriedUnits: [] };
          }
          return s;
        });

        return {
          ...n,
          ships: updatedShips,
          groundUnits: [...n.groundUnits, ...deployedUnits]
        };
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: Invaded surface of ${node.name} deploying ${deployedUnits.length} Ground units.`]
    };

    onUpdateState(updatedState);
  };

  // Quick load Fighter into a carrier orbiting the node
  const handleQuickLoadFighter = (fighter: Ship, carrier: Ship) => {
    audio.playBeep(700, 0.04);
    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === node.id) {
        // Remove fighter from node.ships, load it into carrier
        const filteredShips = n.ships.filter(s => s.id !== fighter.id);
        const updatedShips = filteredShips.map(s => {
          if (s.id === carrier.id) {
            return {
              ...s,
              carriedFighters: [...s.carriedFighters, fighter]
            };
          }
          return s;
        });
        return { ...n, ships: updatedShips };
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: Loaded Fighter into Carrier at ${node.name}.`]
    };
    onUpdateState(updatedState);
  };

  // Quick load Ground Unit into a carrier orbiting the node
  const handleQuickLoadGround = (unit: GroundUnit, carrier: Ship) => {
    audio.playBeep(700, 0.04);
    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === node.id) {
        // Remove ground unit from node.groundUnits, load it into carrier
        const filteredGround = n.groundUnits.filter(g => g.id !== unit.id);
        const updatedShips = n.ships.map(s => {
          if (s.id === carrier.id) {
            return {
              ...s,
              carriedUnits: [...s.carriedUnits, unit]
            };
          }
          return s;
        });
        return { ...n, ships: updatedShips, groundUnits: filteredGround };
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: Loaded Ground Unit into Carrier at ${node.name}.`]
    };
    onUpdateState(updatedState);
  };

  // Quick unload Fighter from a carrier orbiting the node
  const handleQuickUnloadFighter = (carrier: Ship, fighter: Ship) => {
    audio.playBeep(600, 0.04);
    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === node.id) {
        const updatedShips = n.ships.map(s => {
          if (s.id === carrier.id) {
            return {
              ...s,
              carriedFighters: s.carriedFighters.filter(f => f.id !== fighter.id)
            };
          }
          return s;
        });
        return { ...n, ships: [...updatedShips, fighter] };
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: Unloaded Fighter from Carrier at ${node.name}.`]
    };
    onUpdateState(updatedState);
  };

  // Quick unload Ground Unit from a carrier orbiting the node
  const handleQuickUnloadGround = (carrier: Ship, unit: GroundUnit) => {
    audio.playBeep(600, 0.04);
    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === node.id) {
        const updatedShips = n.ships.map(s => {
          if (s.id === carrier.id) {
            return {
              ...s,
              carriedUnits: s.carriedUnits.filter(u => u.id !== unit.id)
            };
          }
          return s;
        });
        return { ...n, ships: updatedShips, groundUnits: [...n.groundUnits, unit] };
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: Unloaded Ground Unit from Carrier at ${node.name}.`]
    };
    onUpdateState(updatedState);
  };

  // Carrier Management Setup
  const openCarrierCargoManager = (carrier: Ship) => {
    audio.playBeep();
    setManagingCarrierId(carrier.id);
    setPendingCarriedFighters([...carrier.carriedFighters]);
    setPendingCarriedGround([...carrier.carriedUnits]);
  };

  const saveCarrierCargo = (carrier: Ship) => {
    audio.playBuild();
    
    // Compute what was added vs removed to adjust node ships/groundUnits lists
    const originalCarriedFighterIds = new Set(carrier.carriedFighters.map(f => f.id));
    const originalCarriedGroundIds = new Set(carrier.carriedUnits.map(g => g.id));

    const finalFighterIds = new Set(pendingCarriedFighters.map(f => f.id));
    const finalGroundIds = new Set(pendingCarriedGround.map(g => g.id));

    // Fighters removed from carrier back to node
    const fightersToUnload = carrier.carriedFighters.filter(f => !finalFighterIds.has(f.id));
    // Fighters loaded from node to carrier
    const fightersToLoad = pendingCarriedFighters.filter(f => !originalCarriedFighterIds.has(f.id));
    const loadedFighterIds = new Set(fightersToLoad.map(f => f.id));

    // Ground units removed from carrier back to node
    const groundToUnload = carrier.carriedUnits.filter(g => !finalGroundIds.has(g.id));
    // Ground units loaded from node to carrier
    const groundToLoad = pendingCarriedGround.filter(g => !originalCarriedGroundIds.has(g.id));
    const loadedGroundIds = new Set(groundToLoad.map(g => g.id));

    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === node.id) {
        // Filter out loaded ships/ground units from the node
        const filteredShips = n.ships.filter(s => !loadedFighterIds.has(s.id));
        // Add unloaded ships back to the node
        const nodeShips = [...filteredShips, ...fightersToUnload];

        // Filter out loaded ground units from the node
        const filteredGround = n.groundUnits.filter(g => !loadedGroundIds.has(g.id));
        // Add unloaded ground units back to the node
        const nodeGround = [...filteredGround, ...groundToUnload];

        // Update Carrier inside nodeShips
        const updatedShips = nodeShips.map(s => {
          if (s.id === carrier.id) {
            return {
              ...s,
              carriedFighters: pendingCarriedFighters,
              carriedUnits: pendingCarriedGround
            };
          }
          return s;
        });

        return {
          ...n,
          ships: updatedShips,
          groundUnits: nodeGround
        };
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: Updated Cargo load of Carrier at ${node.name}.`]
    };

    setManagingCarrierId(null);
    onUpdateState(updatedState);
  };

  // Loading Toggles
  const handleLoadFighter = (fighter: Ship, carrierCapacityLeft: number) => {
    audio.playBeep(700, 0.04);
    if (carrierCapacityLeft <= 0) return;
    if (pendingCarriedFighters.length >= 2) return; // Spec: max 2 fighters
    setPendingCarriedFighters([...pendingCarriedFighters, fighter]);
  };

  const handleUnloadFighter = (fighter: Ship) => {
    audio.playBeep(600, 0.04);
    setPendingCarriedFighters(pendingCarriedFighters.filter(f => f.id !== fighter.id));
  };

  const handleLoadGround = (unit: GroundUnit, carrierCapacityLeft: number) => {
    audio.playBeep(700, 0.04);
    if (carrierCapacityLeft <= 0) return;
    setPendingCarriedGround([...pendingCarriedGround, unit]);
  };

  const handleUnloadGround = (unit: GroundUnit) => {
    audio.playBeep(600, 0.04);
    setPendingCarriedGround(pendingCarriedGround.filter(u => u.id !== unit.id));
  };

  return (
    <div className="space-y-4 max-h-[350px] overflow-y-auto p-1">
      
      {/* 1. Orbiting Fleets */}
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
              
              // Find details if managing cargo
              const isManagingCargo = managingCarrierId === ship.id;

              return (
                <div
                  key={ship.id}
                  className={`p-3 border rounded bg-slate-950/50 flex flex-col space-y-2 transition-all ${
                    isCurrentlySelected 
                      ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.15)] bg-slate-900/60' 
                      : 'border-slate-800'
                  }`}
                >
                  {/* Ship Info Row */}
                  <div className="flex justify-between items-start">
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

                    {/* Ship Actions */}
                    {isMyTurn && isOwner && (
                      <div className="flex items-center space-x-1.5">
                        {/* Board Carrier (Fighters only) */}
                        {ship.type === 'Fighter' && (
                          (() => {
                            const friendlyCarriers = node.ships.filter(
                              s => s.type === 'Carrier' && s.owner === myPlayerId && 
                                   (s.carriedFighters.length + s.carriedUnits.length) < 3 &&
                                   s.carriedFighters.length < 2
                            );
                            if (friendlyCarriers.length > 0) {
                              return (
                                <button
                                  onClick={() => handleQuickLoadFighter(ship, friendlyCarriers[0])}
                                  className="px-2 py-1 text-[10px] font-bold uppercase bg-indigo-500/20 border border-indigo-500 text-indigo-400 rounded hover:bg-indigo-500/30"
                                >
                                  Board
                                </button>
                              );
                            }
                            return null;
                          })()
                        )}

                        {/* Phase 1: Move */}
                        {gameState.phase === 1 && ship.canMove && (
                          <button
                            onClick={() => handleSelectShipForMove(ship)}
                            disabled={ship.movesLeft <= 0}
                            className={`flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold uppercase border rounded transition-all ${
                              isCurrentlySelected
                                ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-40'
                            }`}
                          >
                            <Navigation className="h-3 w-3" />
                            <span>{isCurrentlySelected ? 'Selected' : 'Move'}</span>
                          </button>
                        )}

                        {/* Phase 2: Action - Colonize */}
                        {gameState.phase === 2 && ship.type === 'ColonyShip' && node.claimedBy === null && (
                          <button
                            onClick={() => handleColonize(ship)}
                            disabled={node.groundUnits.length > 0}
                            className="px-2.5 py-1 text-[10px] font-bold uppercase bg-emerald-500/20 border border-emerald-500 text-emerald-400 rounded hover:bg-emerald-500/30 disabled:opacity-45"
                            title={node.groundUnits.length > 0 ? "Blocked by hostile surface garrison" : undefined}
                          >
                            Colonize
                          </button>
                        )}

                        {/* Phase 2: Action - Invade */}
                        {gameState.phase === 2 && ship.type === 'Carrier' && ship.carriedUnits.length > 0 && 
                         node.claimedBy !== null && node.claimedBy !== myPlayerId && 
                         !node.ships.some(s => s.owner !== myPlayerId) && (
                          <button
                            onClick={() => handleInvade(ship)}
                            className="px-2.5 py-1 text-[10px] font-bold uppercase bg-amber-500/20 border border-amber-500 text-amber-400 rounded hover:bg-amber-500/30"
                          >
                            Invade
                          </button>
                        )}

                        {/* Carrier management trigger */}
                        {ship.type === 'Carrier' && (
                          <button
                            onClick={() => isManagingCargo ? setManagingCarrierId(null) : openCarrierCargoManager(ship)}
                            className="flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold uppercase bg-slate-900 border border-slate-755 hover:border-slate-500 text-slate-300 rounded"
                          >
                            <span>Cargo</span>
                            {isManagingCargo ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Carrier Cargo info display */}
                  {ship.type === 'Carrier' && (
                    <div className="bg-slate-950/70 border border-slate-900/60 p-2 rounded text-[10px] font-mono text-slate-400 space-y-1">
                      <div className="flex justify-between items-center text-[9px] text-slate-500 border-b border-slate-900 pb-1 mb-1 font-bold">
                        <span>CARRIER CARGO SLOTS</span>
                        <span>
                          {ship.carriedFighters.length + ship.carriedUnits.length}/3 TOTAL (MAX 2 FIGHTERS)
                        </span>
                      </div>
                      {ship.carriedFighters.length === 0 && ship.carriedUnits.length === 0 ? (
                        <div className="text-[9px] text-slate-600 italic">Cargo bay empty.</div>
                      ) : (
                        <div className="space-y-1">
                          {ship.carriedFighters.map(f => (
                            <div key={f.id} className="flex justify-between text-blue-400 font-semibold items-center">
                              <span>• Fighter Wing ({f.hp}/{f.maxHp} HP)</span>
                              {isMyTurn && isOwner && (
                                <button
                                  onClick={() => handleQuickUnloadFighter(ship, f)}
                                  className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-500 transition-all"
                                >
                                  Unload
                                </button>
                              )}
                            </div>
                          ))}
                          {ship.carriedUnits.map(g => (
                            <div key={g.id} className="flex justify-between text-amber-500 font-semibold items-center">
                              <span>• Ground Combat Division ({g.hp}/{g.maxHp} HP)</span>
                              {isMyTurn && isOwner && (
                                <button
                                  onClick={() => handleQuickUnloadGround(ship, g)}
                                  className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-500 transition-all"
                                >
                                  Unload
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expanded Cargo Load/Unload Manager Panel */}
                  {isManagingCargo && (
                    <div className="border border-indigo-950 bg-indigo-950/15 p-3 rounded space-y-3 mt-1 animate-fadeIn">
                      <div className="flex justify-between items-center text-xs font-bold text-indigo-400 border-b border-indigo-950 pb-1.5">
                        <span className="flex items-center space-x-1">
                          <PackageOpen className="h-3.5 w-3.5" />
                          <span>Warp Cargo Configurator</span>
                        </span>
                        <span className="font-mono text-[10px]">
                          Pending: {pendingCarriedFighters.length + pendingCarriedGround.length}/3 Slots
                        </span>
                      </div>

                      {/* Math bounds for capacity */}
                      {(() => {
                        const totalSlots = 3;
                        const slotsUsed = pendingCarriedFighters.length + pendingCarriedGround.length;
                        const capacityLeft = totalSlots - slotsUsed;

                        // Fighters currently on the node that belong to me and are NOT in carrier yet
                        const availableFighters = node.ships.filter(
                          s => s.type === 'Fighter' && s.owner === myPlayerId
                        );

                        // Ground units currently on the node that belong to me
                        const availableGround = node.groundUnits.filter(
                          gu => gu.owner === myPlayerId
                        );

                        return (
                          <div className="space-y-2.5 text-[11px]">
                            {/* Fighter wing loaders */}
                            <div>
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1 font-mono">
                                Fighter Wings (Max 2)
                              </span>
                              
                              {/* Inside Carrier List */}
                              {pendingCarriedFighters.length > 0 && (
                                <div className="space-y-1 mb-1.5">
                                  {pendingCarriedFighters.map((f, idx) => (
                                    <div key={`carrier-f-${f.id}`} className="flex justify-between items-center bg-indigo-900/10 border border-indigo-900/30 p-1.5 rounded text-blue-400">
                                      <span>Wing {idx + 1} ({f.hp} HP)</span>
                                      <button
                                        onClick={() => handleUnloadFighter(f)}
                                        className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-red-500 text-red-400"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Available on Node List */}
                              {availableFighters.length === 0 && pendingCarriedFighters.length === 0 ? (
                                <div className="text-[10px] text-slate-600 font-mono italic">No fighter ships in orbital hangar.</div>
                              ) : (
                                availableFighters.map(f => (
                                  <div key={`node-f-${f.id}`} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                                    <span className="text-slate-400">Hangar Wing ({f.hp} HP)</span>
                                    <button
                                      onClick={() => handleLoadFighter(f, capacityLeft)}
                                      disabled={capacityLeft <= 0 || pendingCarriedFighters.length >= 2}
                                      className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-emerald-500 text-emerald-400 disabled:opacity-30"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Ground Unit loaders */}
                            <div>
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1 font-mono">
                                Ground Units
                              </span>

                              {/* Inside Carrier List */}
                              {pendingCarriedGround.length > 0 && (
                                <div className="space-y-1 mb-1.5">
                                  {pendingCarriedGround.map((gu, idx) => (
                                    <div key={`carrier-g-${gu.id}`} className="flex justify-between items-center bg-indigo-900/10 border border-indigo-900/30 p-1.5 rounded text-amber-500">
                                      <span>Division {idx + 1} ({gu.hp} HP)</span>
                                      <button
                                        onClick={() => handleUnloadGround(gu)}
                                        className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-red-500 text-red-400"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Available on Node List */}
                              {availableGround.length === 0 && pendingCarriedGround.length === 0 ? (
                                <div className="text-[10px] text-slate-600 font-mono italic">No ground divisions in staging barracks.</div>
                              ) : (
                                availableGround.map(g => (
                                  <div key={`node-g-${g.id}`} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                                    <span className="text-slate-400 font-mono">Division ({g.hp} HP)</span>
                                    <button
                                      onClick={() => handleLoadGround(g, capacityLeft)}
                                      disabled={capacityLeft <= 0}
                                      className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-emerald-500 text-emerald-400 disabled:opacity-30"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => saveCarrierCargo(ship)}
                              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase text-[10px] rounded transition-colors"
                            >
                              Confirm Cargo Bay Lock
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Ground Divisions */}
      <div>
        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
          Ground Divisions on Surface ({node.groundUnits.length})
        </span>

        {node.groundUnits.length === 0 ? (
          <div className="text-[11px] text-slate-600 font-mono italic p-2 border border-slate-900 bg-slate-950/20 text-center rounded">
            No ground divisions stationed here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {node.groundUnits.map(unit => {
              const isOwner = unit.owner === myPlayerId;
              const friendlyCarriers = node.ships.filter(
                s => s.type === 'Carrier' && s.owner === myPlayerId && 
                     (s.carriedFighters.length + s.carriedUnits.length) < 3
              );

              return (
                <div
                  key={unit.id}
                  className="p-2.5 border border-slate-850 bg-slate-950/30 rounded flex justify-between items-center"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-300 font-mono">Surface Garrison</span>
                      {isMyTurn && isOwner && friendlyCarriers.length > 0 && (
                        <button
                          onClick={() => handleQuickLoadGround(unit, friendlyCarriers[0])}
                          className="px-2 py-0.5 text-[9px] font-bold uppercase bg-indigo-500/20 border border-indigo-500 text-indigo-400 rounded hover:bg-indigo-500/30"
                        >
                          Board Carrier
                        </button>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                      HP: {unit.hp}/{unit.maxHp} | DMG: {unit.dmgMin}-{unit.dmgMax}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold uppercase ${getPlayerColorHex(unit.owner)}`}>
                    {getPlayerName(unit.owner)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
