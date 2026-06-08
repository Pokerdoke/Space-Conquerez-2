import React, { useEffect, useRef, useState } from 'react';
import type { GameState, StarNode, Ship } from '../types';
import { SHIP_STATS, GROUND_UNIT_STATS, STRUCTURE_COSTS, createPendingAction, getBuildDurationSeconds, formatSeconds, getPlanetUpgradeTarget, getPlanetUpgradeCost, getPlanetResourceGeneration, getGroundUnitBuildLimit, getGroundUnitCapacity, countFriendlyGroundUnits, cancelRealtimeAction } from '../services/gameLogic';
import { audio } from '../services/audio';
import { Shield, Star, Anchor } from 'lucide-react';

interface BuildPanelProps {
  node: StarNode;
  gameState: GameState;
  myPlayerId: string;
  onUpdateState: (newState: GameState) => void | Promise<void>;
}

type StructureType = 'Shipyard' | 'FtlInhibitor' | 'Gateway';
type BuildAction = 'upgrade' | StructureType | 'GroundUnit' | Ship['type'] | `deconstruct-${StructureType}`;

const INFRASTRUCTURE_ACTION_TYPES = new Set(['upgrade_planet', 'build_structure', 'deconstruct_structure']);

const isInfrastructureBuildAction = (action: BuildAction) =>
  action === 'upgrade' ||
  action === 'Shipyard' ||
  action === 'FtlInhibitor' ||
  action === 'Gateway' ||
  String(action).startsWith('deconstruct-');

const getInfrastructureActionIcon = (actionType: string, detail?: string) => {
  if (actionType === 'upgrade_planet') return '↑';
  if (detail === 'Shipyard') return '⚓';
  if (detail === 'FtlInhibitor') return '⛨';
  if (detail === 'Gateway') return '✦';
  return '▣';
};

export const BuildPanel: React.FC<BuildPanelProps> = ({
  node,
  gameState,
  myPlayerId,
  onUpdateState
}) => {
  const pendingRef = useRef(false);
  const [busyAction, setBusyAction] = useState<BuildAction | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 40);
    return () => window.clearInterval(interval);
  }, []);

  // Always use the freshest node/player from the current game state. Without this, the UI could
  // keep showing stale build counters/development until the player clicked another planet and back.
  const currentNode = gameState.nodes.find(n => n.id === node.id) || node;
  const me = gameState.players.find(p => p.id === myPlayerId);
  const isOwner = currentNode.claimedBy === myPlayerId;
  const canBuild = Boolean(me && isOwner);
  const isBusy = busyAction !== null;
  const pendingHere = (gameState.pendingActions || []).filter(action => action.nodeId === currentNode.id);
  const pendingGroundHere = pendingHere.filter(action => action.type === 'build_ground' && action.playerId === myPlayerId).length;
  const shipyardShipQueue = pendingHere.filter(action => action.type === 'build_ship').length;
  const shipyardQueueFull = shipyardShipQueue >= 5;
  const pendingInfrastructureHere = pendingHere.find(action => INFRASTRUCTURE_ACTION_TYPES.has(action.type));
  const infrastructureLocked = Boolean(pendingInfrastructureHere);
  const canStartInfrastructure = canBuild && !isBusy && !infrastructureLocked;

  if (!me) return null;

  const groundUnitsBuilt = pendingGroundHere;
  const maxGroundUnits = getGroundUnitBuildLimit(currentNode.development);
  const perTurnCapReached = maxGroundUnits > 0 && pendingGroundHere >= maxGroundUnits;
  const surfaceFriendlyGround = countFriendlyGroundUnits(currentNode, myPlayerId);
  const groundUnitCapacity = getGroundUnitCapacity(currentNode.development);
  const surfaceCapReached = surfaceFriendlyGround >= groundUnitCapacity;
  const groundUnitsCapReached = perTurnCapReached || surfaceCapReached || (surfaceFriendlyGround + pendingGroundHere >= groundUnitCapacity);
  const canBuildGroundUnit = canBuild && !isBusy && maxGroundUnits > 0 && !groundUnitsCapReached && me.resources >= GROUND_UNIT_STATS.cost;

  const beginAction = (action: BuildAction) => {
    if (pendingRef.current || !canBuild) return false;
    pendingRef.current = true;
    setBusyAction(action);
    return true;
  };

  const endAction = () => {
    pendingRef.current = false;
    setBusyAction(null);
  };

  const spendResources = async (
    action: BuildAction,
    amount: number,
    logMsg: string,
    applyChanges: (n: StarNode) => boolean | void
  ) => {
    if (!beginAction(action)) return;

    try {
      const latestPlayer = gameState.players.find(p => p.id === myPlayerId);
      const latestNode = gameState.nodes.find(n => n.id === currentNode.id);
      const stillCanBuild = latestPlayer && latestNode?.claimedBy === myPlayerId;
      if (!latestPlayer || !latestNode || !stillCanBuild || latestPlayer.resources < amount) return;

      const latestInfrastructureBusy = (gameState.pendingActions || []).some(
        pending => pending.nodeId === latestNode.id && INFRASTRUCTURE_ACTION_TYPES.has(pending.type)
      );
      if (isInfrastructureBuildAction(action) && latestInfrastructureBusy) return;

      const testNode: StarNode = {
        ...latestNode,
        ships: [...latestNode.ships],
        groundUnits: [...latestNode.groundUnits]
      };
      const applied = applyChanges(testNode);
      if (applied === false) return;
      const changed = JSON.stringify(testNode) !== JSON.stringify({ ...latestNode, ships: [...latestNode.ships], groundUnits: [...latestNode.groundUnits] });
      if (!changed) return;

      let pendingType: 'build_ship' | 'build_ground' | 'upgrade_planet' | 'build_structure' | 'deconstruct_structure' = 'build_ground';
      let shipType: Ship['type'] | undefined;
      let structureType: StructureType | undefined;
      let targetDevelopment: StarNode['development'] | undefined;

      if (action === 'GroundUnit') pendingType = 'build_ground';
      else if (action === 'upgrade') {
        pendingType = 'upgrade_planet';
        targetDevelopment = testNode.development;
      } else if (String(action).startsWith('deconstruct-')) {
        pendingType = 'deconstruct_structure';
        structureType = String(action).replace('deconstruct-', '') as StructureType;
      } else if (action === 'Shipyard' || action === 'FtlInhibitor' || action === 'Gateway') {
        pendingType = 'build_structure';
        structureType = action;
      } else {
        pendingType = 'build_ship';
        shipType = action as Ship['type'];
      }

      const durationSeconds = getBuildDurationSeconds(pendingType, shipType || structureType || targetDevelopment);
      const pendingAction = createPendingAction({
        type: pendingType,
        playerId: myPlayerId,
        nodeId: latestNode.id,
        shipType,
        structureType,
        targetDevelopment,
        durationSeconds,
        label: logMsg,
        refundCost: amount
      });

      audio.playBuild();
      const updatedPlayers = gameState.players.map(p =>
        p.id === myPlayerId ? { ...p, resources: Math.max(0, Number(p.resources) - amount) } : p
      );

      const timestamp = new Date().toISOString();
      const updatedState: GameState = {
        ...gameState,
        players: updatedPlayers,
        pendingActions: [...(gameState.pendingActions || []), pendingAction],
        actionLog: [...gameState.actionLog, `${latestPlayer.name}: Started ${logMsg}; completes in ${formatSeconds(durationSeconds)}.`],
        lastAction: `queue_${String(action).toLowerCase()}`,
        lastActionAt: timestamp,
        lastUpdated: timestamp
      };

      await onUpdateState(updatedState);
    } finally {
      endAction();
    }
  };

  const handleUpgradePlanet = async () => {
    const latestNode = gameState.nodes.find(n => n.id === currentNode.id) || currentNode;
    const nextDev = getPlanetUpgradeTarget(latestNode.development, latestNode, gameState.nodes, myPlayerId);
    if (!nextDev) return;

    // Use the exact same helper for the displayed price and the amount deducted.
    // This fixes the bug where an upgrade could show 4R in the UI but charge a stale/wrong amount.
    const cost = getPlanetUpgradeCost(latestNode.development, latestNode, gameState.nodes, myPlayerId);

    await spendResources('upgrade', cost, `Upgraded ${latestNode.name} to ${nextDev.toUpperCase()} (-${cost}R)`, (n) => {
      if (n.development !== latestNode.development) return false;
      n.development = nextDev;
      n.resourceGeneration = getPlanetResourceGeneration(nextDev);
    });
  };

  const handleBuildStructure = async (struct: StructureType) => {
    const cost = STRUCTURE_COSTS[struct];
    const desc =
      struct === 'Shipyard'
        ? `Built Shipyard on ${currentNode.name}`
        : struct === 'FtlInhibitor'
          ? `Built FTL Inhibitor on ${currentNode.name}`
          : `Built Jump Gateway on ${currentNode.name}`;

    await spendResources(struct, cost, desc, (n) => {
      if (struct === 'Shipyard') {
        if (n.hasShipyard) return false;
        n.hasShipyard = true;
      } else if (struct === 'FtlInhibitor') {
        if (n.hasFtlInhibitor) return false;
        n.hasFtlInhibitor = true;
      } else {
        if (n.hasGateway) return false;
        n.hasGateway = true;
      }
    });
  };

  const handleDeconstructStructure = async (struct: StructureType) => {
    const refund = Math.floor(STRUCTURE_COSTS[struct] / 2);
    const desc =
      struct === 'Shipyard'
        ? `Deconstructed Shipyard on ${currentNode.name} (+${refund}R on completion)`
        : struct === 'FtlInhibitor'
          ? `Deconstructed FTL Inhibitor on ${currentNode.name} (+${refund}R on completion)`
          : `Deconstructed Gateway on ${currentNode.name} (+${refund}R on completion)`;

    await spendResources(`deconstruct-${struct}`, 0, desc, (n) => {
      if (struct === 'Shipyard') {
        if (!n.hasShipyard) return false;
        n.hasShipyard = false;
      } else if (struct === 'FtlInhibitor') {
        if (!n.hasFtlInhibitor) return false;
        n.hasFtlInhibitor = false;
      } else {
        if (!n.hasGateway) return false;
        n.hasGateway = false;
      }
    });
  };

  const handleBuildShip = async (shipType: Ship['type']) => {
    if (shipyardQueueFull) return;
    const cost = SHIP_STATS[shipType].cost;
    await spendResources(shipType, cost, `Built ${shipType} at ${currentNode.name}`, (n) => {
      if (!n.hasShipyard || shipyardQueueFull) return false;
      n.ships.push({ ...(n.ships[0] as Ship | undefined), id: `pending-${shipType}`, type: shipType } as Ship);
    });
  };

  const handleBuildGroundUnit = async () => {
    const latestNode = gameState.nodes.find(n => n.id === currentNode.id) || currentNode;
    const latestMax = getGroundUnitBuildLimit(latestNode.development);
    const queuedGround = (gameState.pendingActions || []).filter(action => action.nodeId === latestNode.id && action.type === 'build_ground' && action.playerId === myPlayerId).length;
    if (latestMax <= 0 || queuedGround >= latestMax || countFriendlyGroundUnits(latestNode, myPlayerId) >= getGroundUnitCapacity(latestNode.development)) return;

    await spendResources('GroundUnit', GROUND_UNIT_STATS.cost, `Built Ground Unit at ${latestNode.name}`, (n) => {
      const nodeMax = getGroundUnitBuildLimit(n.development);
      const queued = (gameState.pendingActions || []).filter(action => action.nodeId === n.id && action.type === 'build_ground' && action.playerId === myPlayerId).length;
      if (nodeMax <= 0 || queued >= nodeMax || countFriendlyGroundUnits(n, myPlayerId) >= getGroundUnitCapacity(n.development)) return false;
      n.groundUnits.push({ id: 'pending-ground', type: 'GroundUnit', owner: myPlayerId, hp: 1, maxHp: 1, dmgMin: 0, dmgMax: 0, turnsInTerritory: 0 });
    });
  };

  const handleCancelAction = async (actionId: string) => {
    audio.playBeep(260, 0.06);
    await onUpdateState(cancelRealtimeAction(gameState, actionId, myPlayerId));
  };

  const nextDev = getPlanetUpgradeTarget(currentNode.development, currentNode, gameState.nodes, myPlayerId);
  const upgradeCost = getPlanetUpgradeCost(currentNode.development, currentNode, gameState.nodes, myPlayerId);
  const currentGeneration = getPlanetResourceGeneration(currentNode.development);
  const nextGeneration = nextDev ? getPlanetResourceGeneration(nextDev) : currentGeneration;

  return (
    <div className="h-full min-h-0 space-y-5 p-1 overflow-y-auto overscroll-contain pb-6">

      {!canBuild && (
        <div className="text-center text-xs text-slate-500 py-4 bg-slate-950/40 border border-slate-900 rounded font-mono">
          {!isOwner
            ? 'Build screen unavailable: System not owned by your Empire'
            : 'Build options disabled'}
        </div>
      )}

      {isOwner && (
        <div className="space-y-4">
          {pendingInfrastructureHere && (
            <div className="rounded border border-indigo-900/50 bg-indigo-950/20 px-3 py-2 font-mono text-[10px] text-indigo-200">
              <span className="font-bold uppercase tracking-wider text-indigo-300">Infrastructure busy:</span>{' '}
              {pendingInfrastructureHere.label}. Only one planet upgrade/structure job can run here at once.
            </div>
          )}

          <div>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
              Planet Infrastructure
            </span>
            <div className="grid grid-cols-2 gap-2">
              {nextDev ? (
                <button
                  onClick={handleUpgradePlanet}
                  disabled={!canStartInfrastructure || me.resources < upgradeCost}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-indigo-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-indigo-700/50 bg-indigo-950/40 text-sm font-black text-indigo-200">↑</span>
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-slate-300">{infrastructureLocked ? 'Infrastructure Busy' : busyAction === 'upgrade' ? 'Upgrading...' : 'Upgrade Planet'}</span>
                      <span className="text-[9px] text-slate-500 font-mono capitalize">to {nextDev} | Gen {currentGeneration}→{nextGeneration}/tick</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 border border-amber-800/40 px-1.5 py-0.5 rounded">
                    {upgradeCost}R
                  </span>
                </button>
              ) : (
                <div className="flex items-center justify-center p-2.5 border border-dashed border-slate-850 bg-slate-950/20 rounded text-slate-600 text-xs font-mono uppercase font-bold">
                  No Upgrade Available
                </div>
              )}

              {!currentNode.hasShipyard ? (
                <button
                  onClick={() => handleBuildStructure('Shipyard')}
                  disabled={!canStartInfrastructure || me.resources < STRUCTURE_COSTS.Shipyard}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-cyan-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <Anchor className="h-5 w-5 shrink-0 text-cyan-300" />
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-slate-300">{infrastructureLocked ? 'Infrastructure Busy' : 'Build Shipyard'}</span>
                      <span className="text-[9px] text-slate-500 font-mono">Allows ship construction</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 border border-amber-800/40 px-1.5 py-0.5 rounded">{STRUCTURE_COSTS.Shipyard}R</span>
                </button>
              ) : (
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-center space-x-1 p-1.5 border border-cyan-950/30 bg-cyan-950/10 rounded text-cyan-400 text-xs font-mono font-bold">
                    <Anchor className="h-3 w-3" />
                    <span>Shipyard Active</span>
                  </div>
                  <button
                    onClick={() => handleDeconstructStructure('Shipyard')}
                    disabled={!canStartInfrastructure}
                    className="flex items-center justify-center space-x-1 p-1 border border-red-900/40 bg-red-950/20 rounded text-red-400 text-[9px] font-mono hover:bg-red-950/40 disabled:opacity-40 transition-all"
                  >
                    <span>⚠ Deconstruct (+{Math.floor(STRUCTURE_COSTS.Shipyard / 2)}R)</span>
                  </button>
                </div>
              )}

              {!currentNode.hasFtlInhibitor ? (
                <button
                  onClick={() => handleBuildStructure('FtlInhibitor')}
                  disabled={!canStartInfrastructure || me.resources < STRUCTURE_COSTS.FtlInhibitor}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-red-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <Shield className="h-5 w-5 shrink-0 text-red-300" />
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-slate-300">{infrastructureLocked ? 'Infrastructure Busy' : 'FTL Inhibitor'}</span>
                      <span className="text-[9px] text-slate-500 font-mono">Blocks enemy ships transit</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 border border-amber-800/40 px-1.5 py-0.5 rounded">{STRUCTURE_COSTS.FtlInhibitor}R</span>
                </button>
              ) : (
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-center space-x-1 p-1.5 border border-red-950/30 bg-red-950/10 rounded text-red-400 text-xs font-mono font-bold">
                    <Shield className="h-3 w-3" />
                    <span>FTL Shield Active</span>
                  </div>
                  <button
                    onClick={() => handleDeconstructStructure('FtlInhibitor')}
                    disabled={!canStartInfrastructure}
                    className="flex items-center justify-center space-x-1 p-1 border border-red-900/40 bg-red-950/20 rounded text-red-400 text-[9px] font-mono hover:bg-red-950/40 disabled:opacity-40 transition-all"
                  >
                    <span>⚠ Deconstruct (+{Math.floor(STRUCTURE_COSTS.FtlInhibitor / 2)}R)</span>
                  </button>
                </div>
              )}

              {!currentNode.hasGateway ? (
                <button
                  onClick={() => handleBuildStructure('Gateway')}
                  disabled={!canStartInfrastructure || me.resources < STRUCTURE_COSTS.Gateway}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-purple-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <Star className="h-5 w-5 shrink-0 text-purple-300" />
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-slate-300">{infrastructureLocked ? 'Infrastructure Busy' : 'Jump Gateway'}</span>
                      <span className="text-[9px] text-slate-500 font-mono">Enables instant teleportation</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 border border-amber-800/40 px-1.5 py-0.5 rounded">{STRUCTURE_COSTS.Gateway}R</span>
                </button>
              ) : (
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-center space-x-1 p-1.5 border border-purple-950/30 bg-purple-950/10 rounded text-purple-400 text-xs font-mono font-bold">
                    <Star className="h-3 w-3" />
                    <span>Gateway Active</span>
                  </div>
                  <button
                    onClick={() => handleDeconstructStructure('Gateway')}
                    disabled={!canStartInfrastructure}
                    className="flex items-center justify-center space-x-1 p-1 border border-red-900/40 bg-red-950/20 rounded text-red-400 text-[9px] font-mono hover:bg-red-950/40 disabled:opacity-40 transition-all"
                  >
                    <span>⚠ Deconstruct (+{Math.floor(STRUCTURE_COSTS.Gateway / 2)}R)</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono flex justify-between">
              <span>Ground Barracks</span>
              {maxGroundUnits <= 0 ? (
                <span className="text-red-400 lowercase font-normal italic">Requires City+</span>
              ) : (
                <span className={`${groundUnitsCapReached ? 'text-red-400' : 'text-slate-500'} lowercase font-normal`}>
                  Queued: {groundUnitsBuilt}/{maxGroundUnits} | Surface: {surfaceFriendlyGround}/{groundUnitCapacity}
                </span>
              )}
            </span>

            <button
              disabled={!canBuildGroundUnit}
              onClick={handleBuildGroundUnit}
              className="w-full flex items-center justify-between p-3 border border-slate-800 bg-slate-950/40 rounded hover:border-amber-500/30 hover:bg-slate-900/40 disabled:opacity-30 transition-all text-left"
            >
              <div>
                <span className="block text-xs font-semibold text-slate-300">
                  {busyAction === 'GroundUnit' ? 'Building Ground Unit...' : `Build Ground Unit (${GROUND_UNIT_STATS.cost}R)`}
                </span>
                <span className="text-[9px] text-slate-500 font-mono block">
                  HP:{GROUND_UNIT_STATS.hp} | DMG:{GROUND_UNIT_STATS.dmgMin}-{GROUND_UNIT_STATS.dmgMax}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/25 border border-amber-900/30 px-2.5 py-1 rounded">{GROUND_UNIT_STATS.cost}R</span>
            </button>
          </div>

          <div>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono flex justify-between">
              <span>Orbital Dockyards</span>
              {!currentNode.hasShipyard ? <span className="text-red-400 lowercase font-normal italic">Requires Shipyard</span> : <span className={`${shipyardQueueFull ? 'text-red-400' : 'text-slate-500'} lowercase font-normal`}>Queue: {shipyardShipQueue}/5</span>}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SHIP_STATS) as Array<keyof typeof SHIP_STATS>).map((type) => {
                const s = SHIP_STATS[type];
                const satisfiesShipyard = currentNode.hasShipyard;
                const canAfford = me.resources >= s.cost;
                return (
                  <button
                    key={type}
                    disabled={!canBuild || isBusy || !satisfiesShipyard || !canAfford || shipyardQueueFull}
                    onClick={() => handleBuildShip(type)}
                    className="flex items-center justify-between p-2 border border-slate-800 bg-slate-950/40 rounded hover:border-cyan-500/30 hover:bg-slate-900/40 disabled:opacity-30 transition-all text-left"
                  >
                    <div>
                      <span className="block text-xs font-semibold text-slate-300">{shipyardQueueFull ? 'Queue Full' : busyAction === type ? 'Building...' : type}</span>
                      <span className="text-[8px] text-slate-500 font-mono block">HP:{s.hp} | DMG:{s.dmgMin}-{s.dmgMax}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/25 border border-amber-900/30 px-1.5 py-0.5 rounded">{s.cost}R</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}



      {pendingHere.length > 0 && (
        <div className="rounded border border-cyan-900/60 bg-cyan-950/15 p-3 space-y-1 font-mono">
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Real-time work queue</div>
          {pendingHere.map(action => {
            const remaining = Math.max(0, Math.ceil((new Date(action.completesAt).getTime() - now) / 1000));
            return (
              <div key={action.id} className="space-y-1 rounded border border-cyan-950/40 bg-slate-950/30 px-2 py-1.5 text-[10px] text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-cyan-800/50 bg-cyan-950/40 text-[10px] text-cyan-200">
                      {getInfrastructureActionIcon(action.type, action.structureType || action.targetDevelopment || action.shipType)}
                    </span>
                    <span className="truncate">{action.label}</span>
                  </span>
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
    </div>
  );
};
