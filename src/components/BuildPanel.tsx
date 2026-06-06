import React, { useRef, useState } from 'react';
import type { GameState, StarNode, Ship } from '../types';
import { SHIP_STATS, GROUND_UNIT_STATS, STRUCTURE_COSTS, createShip, createGroundUnit, getPlanetUpgradeTarget, getPlanetUpgradeCost, getPlanetResourceGeneration, getGroundUnitBuildLimit, getGroundUnitCapacity, countFriendlyGroundUnits } from '../services/gameLogic';
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

export const BuildPanel: React.FC<BuildPanelProps> = ({
  node,
  gameState,
  myPlayerId,
  onUpdateState
}) => {
  const pendingRef = useRef(false);
  const [busyAction, setBusyAction] = useState<BuildAction | null>(null);

  // Always use the freshest node/player from the current game state. Without this, the UI could
  // keep showing stale build counters/development until the player clicked another planet and back.
  const currentNode = gameState.nodes.find(n => n.id === node.id) || node;
  const me = gameState.players.find(p => p.id === myPlayerId);
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyTurn = activePlayer?.id === myPlayerId;
  const isBuildPhase = gameState.phase === 0;
  const isOwner = currentNode.claimedBy === myPlayerId;
  const canBuild = Boolean(me && isMyTurn && isBuildPhase && isOwner);
  const isBusy = busyAction !== null;

  if (!me) return null;

  const groundUnitsBuilt = currentNode.groundUnitsBuiltThisTurn ?? 0;
  const maxGroundUnits = getGroundUnitBuildLimit(currentNode.development);
  const perTurnCapReached = maxGroundUnits > 0 && groundUnitsBuilt >= maxGroundUnits;
  const surfaceFriendlyGround = countFriendlyGroundUnits(currentNode, myPlayerId);
  const groundUnitCapacity = getGroundUnitCapacity(currentNode.development);
  const surfaceCapReached = surfaceFriendlyGround >= groundUnitCapacity;
  const groundUnitsCapReached = perTurnCapReached || surfaceCapReached;
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
      const latestActive = gameState.players[gameState.activePlayerIndex];
      const latestNode = gameState.nodes.find(n => n.id === currentNode.id);
      const stillCanBuild = latestPlayer && latestActive?.id === myPlayerId && gameState.phase === 0 && latestNode?.claimedBy === myPlayerId;
      if (!latestPlayer || !latestNode || !stillCanBuild || latestPlayer.resources < amount) return;

      const updatedNodes = gameState.nodes.map(n => {
        if (n.id !== latestNode.id) return n;
        const copy: StarNode = {
          ...n,
          ships: [...n.ships],
          groundUnits: [...n.groundUnits]
        };
        const applied = applyChanges(copy);
        return applied === false ? n : copy;
      });

      const didChange = updatedNodes.some((n, idx) => n !== gameState.nodes[idx]);
      if (!didChange) return;

      audio.playBuild();
      const updatedPlayers = gameState.players.map(p =>
        p.id === myPlayerId ? { ...p, resources: Math.max(0, Number(p.resources) - amount) } : p
      );

      const timestamp = new Date().toISOString();
      const updatedState: GameState = {
        ...gameState,
        players: updatedPlayers,
        nodes: updatedNodes,
        actionLog: [...gameState.actionLog, `${latestPlayer.name}: ${logMsg} (Turn ${gameState.turnNumber})`],
        lastAction: `build_${String(action).toLowerCase()}`,
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
    if (!beginAction(`deconstruct-${struct}`)) return;
    try {
      const latestPlayer = gameState.players.find(p => p.id === myPlayerId);
      const latestNode = gameState.nodes.find(n => n.id === currentNode.id);
      if (!latestPlayer || !latestNode || !canBuild) return;

      const hasStructure = struct === 'Shipyard' ? latestNode.hasShipyard : struct === 'FtlInhibitor' ? latestNode.hasFtlInhibitor : latestNode.hasGateway;
      if (!hasStructure) return;

      const refund = Math.floor(STRUCTURE_COSTS[struct] / 2);
      const desc =
        struct === 'Shipyard'
          ? `Deconstructed Shipyard on ${latestNode.name} (+${refund}R)`
          : struct === 'FtlInhibitor'
            ? `Deconstructed FTL Inhibitor on ${latestNode.name} (+${refund}R)`
            : `Deconstructed Gateway on ${latestNode.name} (+${refund}R)`;

      audio.playBuild();
      const updatedPlayers = gameState.players.map(p =>
        p.id === myPlayerId ? { ...p, resources: p.resources + refund } : p
      );
      const updatedNodes = gameState.nodes.map(n => {
        if (n.id !== latestNode.id) return n;
        const copy = { ...n };
        if (struct === 'Shipyard') copy.hasShipyard = false;
        else if (struct === 'FtlInhibitor') copy.hasFtlInhibitor = false;
        else copy.hasGateway = false;
        return copy;
      });
      const timestamp = new Date().toISOString();
      await onUpdateState({
        ...gameState,
        players: updatedPlayers,
        nodes: updatedNodes,
        actionLog: [...gameState.actionLog, `${latestPlayer.name}: ${desc} (Turn ${gameState.turnNumber})`],
        lastAction: `deconstruct_${struct.toLowerCase()}`,
        lastActionAt: timestamp,
        lastUpdated: timestamp
      });
    } finally {
      endAction();
    }
  };

  const handleBuildShip = async (shipType: Ship['type']) => {
    const cost = SHIP_STATS[shipType].cost;
    await spendResources(shipType, cost, `Built ${shipType} at ${currentNode.name}`, (n) => {
      if (!n.hasShipyard) return false;
      n.ships.push(createShip(shipType, myPlayerId));
    });
  };

  const handleBuildGroundUnit = async () => {
    const latestNode = gameState.nodes.find(n => n.id === currentNode.id) || currentNode;
    const latestMax = getGroundUnitBuildLimit(latestNode.development);
    const latestBuilt = latestNode.groundUnitsBuiltThisTurn ?? 0;
    if (latestMax <= 0 || latestBuilt >= latestMax || countFriendlyGroundUnits(latestNode, myPlayerId) >= getGroundUnitCapacity(latestNode.development)) return;

    await spendResources('GroundUnit', GROUND_UNIT_STATS.cost, `Built Ground Unit at ${latestNode.name}`, (n) => {
      const nodeMax = getGroundUnitBuildLimit(n.development);
      const built = n.groundUnitsBuiltThisTurn ?? 0;
      if (nodeMax <= 0 || built >= nodeMax || countFriendlyGroundUnits(n, myPlayerId) >= getGroundUnitCapacity(n.development)) return false;
      n.groundUnits.push(createGroundUnit(myPlayerId));
      n.groundUnitsBuiltThisTurn = built + 1;
    });
  };

  const nextDev = getPlanetUpgradeTarget(currentNode.development, currentNode, gameState.nodes, myPlayerId);
  const upgradeCost = getPlanetUpgradeCost(currentNode.development, currentNode, gameState.nodes, myPlayerId);
  const currentGeneration = getPlanetResourceGeneration(currentNode.development);
  const nextGeneration = nextDev ? getPlanetResourceGeneration(nextDev) : currentGeneration;

  return (
    <div className="h-full min-h-0 space-y-5 p-1 overflow-y-auto overscroll-contain pb-28">
      {!canBuild && (
        <div className="text-center text-xs text-slate-500 py-4 bg-slate-950/40 border border-slate-900 rounded font-mono">
          {!isOwner
            ? 'Build screen unavailable: System not owned by your Empire'
            : !isMyTurn
              ? `View only: Waiting for ${activePlayer?.name || 'another player'}`
              : !isBuildPhase
                ? 'View only: Build actions require the BUILD phase'
                : 'Build options disabled'}
        </div>
      )}

      {isOwner && (
        <div className="space-y-4">
          <div>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
              Planet Infrastructure
            </span>
            <div className="grid grid-cols-2 gap-2">
              {nextDev ? (
                <button
                  onClick={handleUpgradePlanet}
                  disabled={!canBuild || isBusy || me.resources < upgradeCost}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-indigo-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-300">{busyAction === 'upgrade' ? 'Upgrading...' : 'Upgrade Planet'}</span>
                    <span className="text-[9px] text-slate-500 font-mono capitalize">to {nextDev} | Gen {currentGeneration}→{nextGeneration}/turn</span>
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
                  disabled={!canBuild || isBusy || me.resources < STRUCTURE_COSTS.Shipyard}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-cyan-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-300">Build Shipyard</span>
                    <span className="text-[9px] text-slate-500 font-mono">Allows ship construction</span>
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
                    disabled={!canBuild || isBusy}
                    className="flex items-center justify-center space-x-1 p-1 border border-red-900/40 bg-red-950/20 rounded text-red-400 text-[9px] font-mono hover:bg-red-950/40 disabled:opacity-40 transition-all"
                  >
                    <span>⚠ Deconstruct (+{Math.floor(STRUCTURE_COSTS.Shipyard / 2)}R)</span>
                  </button>
                </div>
              )}

              {!currentNode.hasFtlInhibitor ? (
                <button
                  onClick={() => handleBuildStructure('FtlInhibitor')}
                  disabled={!canBuild || isBusy || me.resources < STRUCTURE_COSTS.FtlInhibitor}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-red-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-300">FTL Inhibitor</span>
                    <span className="text-[9px] text-slate-500 font-mono">Blocks enemy ships transit</span>
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
                    disabled={!canBuild || isBusy}
                    className="flex items-center justify-center space-x-1 p-1 border border-red-900/40 bg-red-950/20 rounded text-red-400 text-[9px] font-mono hover:bg-red-950/40 disabled:opacity-40 transition-all"
                  >
                    <span>⚠ Deconstruct (+{Math.floor(STRUCTURE_COSTS.FtlInhibitor / 2)}R)</span>
                  </button>
                </div>
              )}

              {!currentNode.hasGateway ? (
                <button
                  onClick={() => handleBuildStructure('Gateway')}
                  disabled={!canBuild || isBusy || me.resources < STRUCTURE_COSTS.Gateway}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-purple-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-300">Jump Gateway</span>
                    <span className="text-[9px] text-slate-500 font-mono">Enables instant teleportation</span>
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
                    disabled={!canBuild || isBusy}
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
                  Built: {groundUnitsBuilt}/{maxGroundUnits} | Surface: {surfaceFriendlyGround}/{groundUnitCapacity}
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
              {!currentNode.hasShipyard && <span className="text-red-400 lowercase font-normal italic">Requires Shipyard</span>}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SHIP_STATS) as Array<keyof typeof SHIP_STATS>).map((type) => {
                const s = SHIP_STATS[type];
                const satisfiesShipyard = currentNode.hasShipyard;
                const canAfford = me.resources >= s.cost;
                return (
                  <button
                    key={type}
                    disabled={!canBuild || isBusy || !satisfiesShipyard || !canAfford}
                    onClick={() => handleBuildShip(type)}
                    className="flex items-center justify-between p-2 border border-slate-800 bg-slate-950/40 rounded hover:border-cyan-500/30 hover:bg-slate-900/40 disabled:opacity-30 transition-all text-left"
                  >
                    <div>
                      <span className="block text-xs font-semibold text-slate-300">{busyAction === type ? 'Building...' : type}</span>
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
    </div>
  );
};
