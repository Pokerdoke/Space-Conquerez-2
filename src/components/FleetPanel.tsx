import React, { useEffect, useRef, useState } from 'react';
import type { GameState, StarNode, Ship, GroundUnit } from '../types';
import { audio } from '../services/audio';
import { Navigation, PackageOpen, Plus, Minus, Shield, Recycle, ChevronDown } from 'lucide-react';
import { HealthBar } from './HealthBar';
import { SHIP_STATS, loadGroundUnitToCarrier, unloadGroundUnitFromCarrier, loadFighterToCarrier, unloadFighterFromCarrier, getGroundUnitCapacity, countFriendlyGroundUnits, createPendingAction, getBuildDurationSeconds, formatSeconds, cancelRealtimeAction, fullyLoadCarrierFromPlanet } from '../services/gameLogic';

type FleetMoveSelection = { nodeId: string; shipIds: string[]; label: string };

interface FleetPanelProps {
  node: StarNode;
  gameState: GameState;
  myPlayerId: string;
  selectedShip: Ship | null;
  onSelectShip: (ship: Ship | null) => void;
  onSelectFleetMove?: (selection: FleetMoveSelection | null) => void;
  selectedFleetMove?: FleetMoveSelection | null;
  onUpdateState: (newState: GameState) => void;
}

const troopButtonKey = (action: string, carrierId: string, unitId: string) => `${action}:${carrierId}:${unitId}`;

export const FleetPanel: React.FC<FleetPanelProps> = ({
  node,
  gameState,
  myPlayerId,
  selectedShip,
  onSelectShip,
  onSelectFleetMove,
  selectedFleetMove,
  onUpdateState
}) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const isFriendlyNode = node.claimedBy === myPlayerId;
  const [busyTroops, setBusyTroops] = useState<Set<string>>(new Set());
  const [expandedCarrierId, setExpandedCarrierId] = useState<string | null>(null);
  const [fleetMoveOpen, setFleetMoveOpen] = useState(true);
  const [now, setNow] = useState(Date.now());
  const latestGameStateRef = useRef(gameState);

  useEffect(() => {
    latestGameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

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

  const handleCancelAction = (actionId: string) => {
    audio.playBeep(260, 0.06);
    onUpdateState(cancelRealtimeAction(gameState, actionId, myPlayerId));
  };

  const handleSelectShipForMove = (ship: Ship) => {
    if (ship.owner !== myPlayerId || !ship.canMove) return;
    audio.playBeep(600, 0.05);
    onSelectFleetMove?.(null);
    onSelectShip(selectedShip?.id === ship.id ? null : ship);
  };

  const myMovableShips = node.ships.filter(s => s.owner === myPlayerId && s.canMove && s.movesLeft > 0);
  const movableShipTypes = (['BattleShip', 'Destroyer', 'Carrier', 'ColonyShip'] as Ship['type'][])
    .map(type => ({ type, ships: myMovableShips.filter(ship => ship.type === type) }))
    .filter(group => group.ships.length > 0);

  const handleSelectFleetMove = (ships: Ship[], label: string) => {
    if (ships.length === 0) return;
    audio.playBeep(680, 0.06);
    onSelectShip(ships[0]);
    onSelectFleetMove?.({ nodeId: node.id, shipIds: ships.map(ship => ship.id), label });
  };

  const handleFullyLoadCarrier = (carrier: Ship) => {
    if (!canManageTroops || carrier.owner !== myPlayerId || carrier.type !== 'Carrier') return;
    audio.playBeep(760, 0.06);
    onUpdateState(fullyLoadCarrierFromPlanet(latestGameStateRef.current, node.id, carrier.id, myPlayerId));
  };

  const finishCarrierTransfer = (key: string, updater: (state: GameState) => GameState) => {
    window.setTimeout(() => {
      const latest = latestGameStateRef.current;
      const updated = updater(latest);
      latestGameStateRef.current = updated;
      onUpdateState(updated);
      setBusyTroops(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 1500);
  };

  const handleColonize = (colonyShip: Ship) => {
    if (colonyShip.owner !== myPlayerId || node.claimedBy !== null || node.groundUnits.length > 0) return;
    audio.playColonize();
    const durationSeconds = getBuildDurationSeconds('colonize');
    const pendingAction = createPendingAction({
      type: 'colonize',
      playerId: myPlayerId,
      nodeId: node.id,
      shipId: colonyShip.id,
      durationSeconds,
      label: `Colonize ${node.name}`
    });
    onSelectShip(null);
    onUpdateState({
      ...gameState,
      pendingActions: [...(gameState.pendingActions || []), pendingAction],
      actionLog: [...gameState.actionLog, `${me.name}: Started colonizing ${node.name}; completes in ${formatSeconds(durationSeconds)}.`],
      lastAction: 'queue_colonize',
      lastActionAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });
  };

  const handleScrapShip = (ship: Ship) => {
    const key = troopButtonKey('scrap', ship.id, 'ship');
    const hasCargo = ship.type === 'Carrier' && (ship.carriedUnits.length > 0 || ship.carriedFighters.length > 0);
    const canScrap = ship.owner === myPlayerId && isFriendlyNode && node.hasShipyard && ship.hp >= ship.maxHp && !hasCargo;
    if (!canScrap || busyTroops.has(key)) return;

    const refund = Math.floor(SHIP_STATS[ship.type].cost * 0.75);
    const durationSeconds = getBuildDurationSeconds('scrap_ship');
    setBusyTroops(prev => new Set(prev).add(key));
    audio.playBuild();

    const pendingAction = createPendingAction({
      type: 'scrap_ship',
      playerId: myPlayerId,
      nodeId: node.id,
      shipId: ship.id,
      durationSeconds,
      label: `Scrap ${ship.type} at ${node.name}`
    });

    if (selectedShip?.id === ship.id) onSelectShip(null);
    onUpdateState({
      ...gameState,
      pendingActions: [...(gameState.pendingActions || []), pendingAction],
      actionLog: [...gameState.actionLog, `${me.name}: Started scrapping ${ship.type} at ${node.name}; +${refund}R in ${formatSeconds(durationSeconds)}.`],
      lastAction: 'queue_scrap_ship',
      lastActionAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });
  };

  const handleLoadTroop = (carrier: Ship, unit: GroundUnit) => {
    const key = troopButtonKey('load', carrier.id, unit.id);
    if (busyTroops.has(key)) return;
    setBusyTroops(prev => new Set(prev).add(key));
    audio.playBeep(700, 0.04);
    finishCarrierTransfer(key, latest => loadGroundUnitToCarrier(latest, node.id, carrier.id, unit.id, myPlayerId));
  };

  const handleUnloadTroop = (carrier: Ship, unit: GroundUnit) => {
    const key = troopButtonKey('unload', carrier.id, unit.id);
    if (busyTroops.has(key) || surfaceFull) return;
    setBusyTroops(prev => new Set(prev).add(key));
    audio.playBeep(600, 0.04);
    finishCarrierTransfer(key, latest => unloadGroundUnitFromCarrier(latest, node.id, carrier.id, unit.id, myPlayerId));
  };

  const handleLoadFighter = (carrier: Ship, fighter: Ship) => {
    const key = troopButtonKey('load-fighter', carrier.id, fighter.id);
    if (busyTroops.has(key)) return;
    setBusyTroops(prev => new Set(prev).add(key));
    audio.playBeep(740, 0.04);
    finishCarrierTransfer(key, latest => loadFighterToCarrier(latest, node.id, carrier.id, fighter.id, myPlayerId));
  };

  const handleUnloadFighter = (carrier: Ship, fighter: Ship) => {
    const key = troopButtonKey('unload-fighter', carrier.id, fighter.id);
    if (busyTroops.has(key)) return;
    setBusyTroops(prev => new Set(prev).add(key));
    audio.playBeep(540, 0.04);
    finishCarrierTransfer(key, latest => unloadFighterFromCarrier(latest, node.id, carrier.id, fighter.id, myPlayerId));
  };

  const friendlyGroundUnits = node.groundUnits.filter(g => g.owner === myPlayerId);
  const friendlyCarriers = node.ships.filter(s => s.type === 'Carrier' && s.owner === myPlayerId);
  const friendlyFighters = node.ships.filter(s => s.type === 'Fighter' && s.owner === myPlayerId);
  const friendlySurfaceCount = countFriendlyGroundUnits(node, myPlayerId);
  const groundUnitCapacity = getGroundUnitCapacity(node.development);
  const surfaceFull = friendlySurfaceCount >= groundUnitCapacity;
  const canManageTroops = isFriendlyNode;

  return (
    <div className="space-y-4 max-h-[350px] overflow-y-auto p-1">


      {(gameState.pendingActions || []).filter(action => action.nodeId === node.id || action.targetNodeId === node.id).length > 0 && (
        <div className="rounded border border-cyan-900/60 bg-cyan-950/15 p-3 space-y-1 font-mono">
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Active real-time orders</div>
          {(gameState.pendingActions || []).filter(action => action.nodeId === node.id || action.targetNodeId === node.id).map(action => {
            const remaining = Math.max(0, Math.ceil((new Date(action.completesAt).getTime() - now) / 1000));
            return (
              <div key={action.id} className="space-y-1 rounded border border-cyan-950/40 bg-slate-950/30 px-2 py-1.5 text-[10px] text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{action.label}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-cyan-300 font-bold">{remaining}s</span>
                    {action.playerId === myPlayerId && (
                      <button
                        onClick={() => handleCancelAction(action.id)}
                        className="rounded border border-red-900/50 bg-red-950/40 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-red-300 hover:border-red-400 hover:text-red-100"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-900 border border-slate-800">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, ((now - new Date(action.startedAt).getTime()) / Math.max(1, new Date(action.completesAt).getTime() - new Date(action.startedAt).getTime())) * 100))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {myMovableShips.length > 0 && (
        <div className="rounded border border-blue-900/60 bg-blue-950/15 p-3 space-y-2 font-mono">
          <button
            type="button"
            onClick={() => setFleetMoveOpen(open => !open)}
            className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-300"
          >
            <span>Fleet movement controls</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${fleetMoveOpen ? 'rotate-180' : ''}`} />
          </button>
          {fleetMoveOpen && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleSelectFleetMove(myMovableShips, 'All movable ships')}
                className={`w-full rounded border px-2.5 py-2 text-[10px] font-bold uppercase ${selectedFleetMove?.nodeId === node.id && selectedFleetMove.label === 'All movable ships' ? 'border-yellow-500 bg-yellow-950/20 text-yellow-300' : 'border-blue-800/50 bg-slate-950/40 text-blue-200 hover:border-blue-400'}`}
              >
                Move all ships ({myMovableShips.length})
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                {movableShipTypes.map(group => (
                  <button
                    key={group.type}
                    type="button"
                    onClick={() => handleSelectFleetMove(group.ships, `All ${group.type}`)}
                    className={`rounded border px-2 py-1.5 text-[9px] font-bold uppercase ${selectedFleetMove?.nodeId === node.id && selectedFleetMove.label === `All ${group.type}` ? 'border-yellow-500 bg-yellow-950/20 text-yellow-300' : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-500'}`}
                  >
                    Move all {group.type}s ({group.ships.length})
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-slate-500">
                Pick one option, then click a destination planet on the map. All selected ships travel together.
              </div>
            </div>
          )}
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
              const canMoveThisShip = isOwner && ship.canMove && ship.movesLeft > 0;
              const canColonize = isOwner && ship.type === 'ColonyShip' && node.claimedBy === null && node.groundUnits.length === 0;
              const carrierExpanded = expandedCarrierId === ship.id;
              const scrapKey = troopButtonKey('scrap', ship.id, 'ship');
              const scrapRefund = Math.floor(SHIP_STATS[ship.type].cost * 0.75);
              const hasCarrierCargo = ship.type === 'Carrier' && (ship.carriedUnits.length > 0 || ship.carriedFighters.length > 0);
              const canScrapShip = isOwner && isFriendlyNode && node.hasShipyard && ship.hp >= ship.maxHp && !hasCarrierCargo;
              const scrapDisabledReason = !node.hasShipyard
                ? 'Requires a friendly shipyard in this system.'
                : ship.hp < ship.maxHp
                  ? 'Ship must be at full health before scrapping.'
                  : hasCarrierCargo
                    ? 'Unload carrier cargo before scrapping.'
                    : undefined;

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
                      <HealthBar hp={ship.hp} maxHp={ship.maxHp} label="Hull" className="mt-1.5" />
                      <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                        DMG: {ship.dmgMin}-{ship.dmgMax} | Speed: {ship.movesLeft}J
                      </span>
                    </div>

                    {isOwner && (
                      <div className="flex items-center flex-wrap justify-end gap-1.5">
                        {ship.canMove && (
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

                        {isOwner && node.hasShipyard && (
                          <button
                            onClick={() => handleScrapShip(ship)}
                            disabled={!canScrapShip || busyTroops.has(scrapKey)}
                            title={scrapDisabledReason || `Scrap for ${scrapRefund}R (75% refund)`}
                            className="min-h-[44px] flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold uppercase bg-amber-950/20 border border-amber-700/60 text-amber-300 rounded hover:bg-amber-900/25 disabled:opacity-40 disabled:hover:bg-amber-950/20"
                          >
                            <Recycle className="h-3 w-3" />
                            <span>{busyTroops.has(scrapKey) ? 'Scrapping...' : `Scrap +${scrapRefund}R`}</span>
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
                      {canManageTroops && ship.owner === myPlayerId && friendlyGroundUnits.length > 0 && ship.carriedUnits.length < 3 && (
                        <button
                          type="button"
                          onClick={() => handleFullyLoadCarrier(ship)}
                          className="w-full min-h-[36px] rounded border border-emerald-600/50 bg-emerald-950/25 px-2 py-1 text-[9px] font-bold uppercase text-emerald-300 hover:border-emerald-400"
                        >
                          Fully load carrier now ({Math.min(3 - ship.carriedUnits.length, friendlyGroundUnits.length)} troop{Math.min(3 - ship.carriedUnits.length, friendlyGroundUnits.length) === 1 ? '' : 's'})
                        </button>
                      )}

                      {ship.carriedUnits.length === 0 ? (
                        <div className="text-[9px] text-slate-600 italic">No ground units loaded.</div>
                      ) : (
                        <div className="space-y-1">
                          {ship.carriedUnits.map((unit, idx) => {
                            const key = troopButtonKey('unload', ship.id, unit.id);
                            return (
                              <div key={unit.id} className="flex justify-between gap-2 items-center text-amber-500 font-semibold">
                                <span className="min-w-[110px]">• Troop {idx + 1}</span><HealthBar hp={unit.hp} maxHp={unit.maxHp} label="HP" className="max-w-[95px]" />
                                {canManageTroops && (
                                  <button
                                    onClick={() => handleUnloadTroop(ship, unit)}
                                    disabled={busyTroops.has(key) || surfaceFull}
                                    title={surfaceFull ? 'Surface garrison is full (6/6)' : undefined}
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

                      <div className="border-t border-slate-900 pt-2 space-y-1">
                        <div className="flex justify-between items-center text-[9px] text-slate-500 font-bold">
                          <span>CARRIER FIGHTER BAY</span>
                          <span>Fighters: {ship.carriedFighters.length}/2</span>
                        </div>
                        {ship.carriedFighters.length === 0 ? (
                          <div className="text-[9px] text-slate-600 italic">No fighters loaded.</div>
                        ) : (
                          <div className="space-y-1">
                            {ship.carriedFighters.map((fighter, idx) => {
                              const key = troopButtonKey('unload-fighter', ship.id, fighter.id);
                              return (
                                <div key={fighter.id} className="flex justify-between gap-2 items-center text-cyan-400 font-semibold">
                                  <span className="min-w-[110px]">• Fighter {idx + 1}</span><HealthBar hp={fighter.hp} maxHp={fighter.maxHp} label="HP" className="max-w-[95px]" />
                                  {canManageTroops && (
                                    <button
                                      onClick={() => handleUnloadFighter(ship, fighter)}
                                      disabled={busyTroops.has(key)}
                                      className="min-h-[44px] text-[8px] font-bold uppercase px-2 py-1 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-500 transition-all disabled:opacity-40"
                                    >
                                      {busyTroops.has(key) ? 'Saving...' : 'Launch'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {carrierExpanded && (
                        <div className="border border-indigo-950 bg-indigo-950/15 p-3 rounded space-y-3 animate-fadeIn">
                          {!canManageTroops && (
                            <div className="text-[10px] text-slate-500 bg-slate-950/50 border border-slate-900 p-2 rounded">
                              Troop loading/unloading requires a friendly node.
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
                                          <div className="min-w-0 flex-1"><span className="text-slate-400 font-mono block">Troop {idx + 1}</span><HealthBar hp={unit.hp} maxHp={unit.maxHp} label="HP" /></div>
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

                              <div>
                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1 font-mono">
                                  Load Fighters into Carrier
                                </div>
                                {friendlyFighters.length === 0 ? (
                                  <div className="text-[10px] text-slate-600 font-mono italic">No friendly fighters in orbit here.</div>
                                ) : (
                                  <div className="space-y-1">
                                    {friendlyFighters.map((fighter, idx) => {
                                      const key = troopButtonKey('load-fighter', ship.id, fighter.id);
                                      const full = ship.carriedFighters.length >= 2;
                                      return (
                                        <div key={fighter.id} className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-900">
                                          <div className="min-w-0 flex-1"><span className="text-cyan-400 font-mono block">Fighter {idx + 1}</span><HealthBar hp={fighter.hp} maxHp={fighter.maxHp} label="HP" /></div>
                                          <button
                                            onClick={() => handleLoadFighter(ship, fighter)}
                                            disabled={full || busyTroops.has(key)}
                                            className="min-h-[44px] px-2 rounded bg-slate-900 border border-slate-800 hover:border-cyan-500 text-cyan-400 disabled:opacity-30"
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
                                          <div className="min-w-0 flex-1"><span className="text-amber-500 font-mono block">Cargo Troop {idx + 1}</span><HealthBar hp={unit.hp} maxHp={unit.maxHp} label="HP" /></div>
                                          <button
                                            onClick={() => handleUnloadTroop(ship, unit)}
                                            disabled={busyTroops.has(key) || surfaceFull}
                                            title={surfaceFull ? 'Surface garrison is full (6/6)' : undefined}
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
          Ground Units on Surface ({node.groundUnits.length}) — Friendly {friendlySurfaceCount}/{groundUnitCapacity}
        </span>

        {node.groundUnits.length === 0 ? (
          <div className="text-[11px] text-slate-600 font-mono italic p-2 border border-slate-900 bg-slate-950/20 text-center rounded">
            No ground divisions stationed here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {node.groundUnits.map(unit => {
              const loadCarrier = friendlyCarriers.find(c => c.carriedUnits.length < 3);
              const key = loadCarrier ? troopButtonKey('load', loadCarrier.id, unit.id) : '';
              return (
                <div key={unit.id} className="p-2.5 border border-slate-800 bg-slate-950/30 rounded flex justify-between items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <Shield className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs font-bold text-slate-300 font-mono">Ground Unit</span>
                    </div>
                    <HealthBar hp={unit.hp} maxHp={unit.maxHp} label="HP" className="mt-1" />
                    <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                      DMG: {unit.dmgMin}-{unit.dmgMax}
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
