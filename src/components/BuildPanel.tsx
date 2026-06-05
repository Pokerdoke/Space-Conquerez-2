import React from 'react';
import type { GameState, StarNode } from '../types';
import { SHIP_STATS, GROUND_UNIT_STATS, STRUCTURE_COSTS, PLANET_UPGRADES, createShip, createGroundUnit } from '../services/gameLogic';
import { audio } from '../services/audio';
import { Shield, Star, Anchor } from 'lucide-react';


interface BuildPanelProps {
  node: StarNode;
  gameState: GameState;
  myPlayerId: string;
  onUpdateState: (newState: GameState) => void;
}

export const BuildPanel: React.FC<BuildPanelProps> = ({
  node,
  gameState,
  myPlayerId,
  onUpdateState
}) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const isMyTurn = gameState.players[gameState.activePlayerIndex].id === myPlayerId;
  const isBuildPhase = gameState.phase === 0;
  const isOwner = node.claimedBy === myPlayerId;

  if (!me) return null;

  // Active validation checks
  const canBuild = isMyTurn && isBuildPhase && isOwner;

  const groundUnitsBuilt = node.groundUnitsBuiltThisTurn ?? 0;
  const maxGroundUnits = node.development === 'metropolis' ? 6 : node.development === 'city' ? 3 : 0;
  const groundUnitsCapReached = groundUnitsBuilt >= maxGroundUnits;

  // Spend resources utility
  const spendResources = (amount: number, logMsg: string, applyChanges: (n: StarNode) => void) => {
    if (me.resources < amount) return;
    audio.playBuild();

    const updatedPlayers = gameState.players.map(p => {
      if (p.id === myPlayerId) {
        return { ...p, resources: p.resources - amount };
      }
      return p;
    });

    const updatedNodes = gameState.nodes.map(n => {
      if (n.id === node.id) {
        const copy = { ...n };
        applyChanges(copy);
        return copy;
      }
      return n;
    });

    const updatedState: GameState = {
      ...gameState,
      players: updatedPlayers,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: ${logMsg} (Turn ${gameState.turnNumber})`]
    };

    onUpdateState(updatedState);
  };

  // Build handlers
  const handleUpgradePlanet = () => {
    const currentDev = node.development;
    const upgradeInfo = PLANET_UPGRADES[currentDev];
    if (!upgradeInfo || !upgradeInfo.next) return;

    spendResources(
      upgradeInfo.cost,
      `Upgraded ${node.name} to ${upgradeInfo.next.toUpperCase()}`,
      (n) => {
        n.development = upgradeInfo.next!;
        n.resourceGeneration = PLANET_UPGRADES[upgradeInfo.next!].res;
      }
    );
  };

  const handleBuildStructure = (struct: 'Shipyard' | 'FtlInhibitor' | 'Gateway') => {
    const cost = STRUCTURE_COSTS[struct];
    let desc = '';
    let apply: (n: StarNode) => void;

    if (struct === 'Shipyard') {
      desc = `Built Shipyard on ${node.name}`;
      apply = (n) => { n.hasShipyard = true; };
    } else if (struct === 'FtlInhibitor') {
      desc = `Built FTL Inhibitor on ${node.name}`;
      apply = (n) => { n.hasFtlInhibitor = true; };
    } else {
      desc = `Built Jump Gateway on ${node.name}`;
      apply = (n) => { n.hasGateway = true; };
    }

    spendResources(cost, desc, apply);
  };

  const handleDeconstructStructure = (struct: 'Shipyard' | 'FtlInhibitor' | 'Gateway') => {
    if (!me || !canBuild) return;
    const refund = Math.floor(STRUCTURE_COSTS[struct] / 2);
    const desc =
      struct === 'Shipyard'
        ? `Deconstructed Shipyard on ${node.name} (+${refund}R)`
        : struct === 'FtlInhibitor'
        ? `Deconstructed FTL Inhibitor on ${node.name} (+${refund}R)`
        : `Deconstructed Gateway on ${node.name} (+${refund}R)`;

    audio.playBuild();
    const updatedPlayers = gameState.players.map(p =>
      p.id === myPlayerId ? { ...p, resources: p.resources + refund } : p
    );
    const updatedNodes = gameState.nodes.map(n => {
      if (n.id !== node.id) return n;
      const copy = { ...n };
      if (struct === 'Shipyard') copy.hasShipyard = false;
      else if (struct === 'FtlInhibitor') copy.hasFtlInhibitor = false;
      else copy.hasGateway = false;
      return copy;
    });
    onUpdateState({
      ...gameState,
      players: updatedPlayers,
      nodes: updatedNodes,
      actionLog: [...gameState.actionLog, `${me.name}: ${desc} (Turn ${gameState.turnNumber})`]
    });
  };

  const handleBuildShip = (shipType: 'Destroyer' | 'BattleShip' | 'Carrier' | 'ColonyShip' | 'Fighter') => {
    const cost = SHIP_STATS[shipType].cost;
    spendResources(
      cost,
      `Built ${shipType} at ${node.name}`,
      (n) => {
        n.ships.push(createShip(shipType, myPlayerId));
      }
    );
  };

  const handleBuildGroundUnit = () => {
    const cost = GROUND_UNIT_STATS.cost;
    spendResources(
      cost,
      `Built Ground Unit at ${node.name}`,
      (n) => {
        n.groundUnits.push(createGroundUnit(myPlayerId));
        n.groundUnitsBuiltThisTurn = (n.groundUnitsBuiltThisTurn ?? 0) + 1;
      }
    );
  };

  const upgradeInfo = PLANET_UPGRADES[node.development];
  const nextDev = upgradeInfo?.next;
  const upgradeCost = nextDev ? PLANET_UPGRADES[nextDev].cost : 0;

  return (
    <div className="space-y-5 p-1 max-h-[350px] overflow-y-auto">
      
      {!canBuild && (
        <div className="text-center text-xs text-slate-500 py-4 bg-slate-950/40 border border-slate-900 rounded font-mono">
          {!isMyTurn 
            ? 'Build options disabled: Not your active turn' 
            : !isBuildPhase 
              ? 'Build options disabled: Must be in BUILD phase' 
              : 'Build options disabled: System not owned by your Empire'}
        </div>
      )}

      {canBuild && (
        <div className="space-y-4">
          
          {/* Planet Upgrades & Structures */}
          <div>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono">
              Planet Infrastructure
            </span>
            <div className="grid grid-cols-2 gap-2">
              
              {/* Upgrade Planet */}
              {nextDev ? (
                <button
                  onClick={handleUpgradePlanet}
                  disabled={me.resources < upgradeCost}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-indigo-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-300">Upgrade Planet</span>
                    <span className="text-[9px] text-slate-500 font-mono capitalize">to {nextDev} (+{PLANET_UPGRADES[nextDev].res} res/turn)</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 border border-amber-800/40 px-1.5 py-0.5 rounded">
                    {upgradeCost}R
                  </span>
                </button>
              ) : (
                <div className="flex items-center justify-center p-2.5 border border-dashed border-slate-850 bg-slate-950/20 rounded text-slate-600 text-xs font-mono uppercase font-bold">
                  Metropolis Max Level
                </div>
              )}

              {/* Build / Deconstruct Shipyard */}
              {!node.hasShipyard ? (
                <button
                  onClick={() => handleBuildStructure('Shipyard')}
                  disabled={me.resources < STRUCTURE_COSTS.Shipyard}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-cyan-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-300">Build Shipyard</span>
                    <span className="text-[9px] text-slate-500 font-mono">Allows ship construction</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 border border-amber-800/40 px-1.5 py-0.5 rounded">
                    {STRUCTURE_COSTS.Shipyard}R
                  </span>
                </button>
              ) : (
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-center space-x-1 p-1.5 border border-cyan-950/30 bg-cyan-950/10 rounded text-cyan-400 text-xs font-mono font-bold">
                    <Anchor className="h-3 w-3" />
                    <span>Shipyard Active</span>
                  </div>
                  <button
                    onClick={() => handleDeconstructStructure('Shipyard')}
                    className="flex items-center justify-center space-x-1 p-1 border border-red-900/40 bg-red-950/20 rounded text-red-400 text-[9px] font-mono hover:bg-red-950/40 transition-all"
                  >
                    <span>⚠ Deconstruct (+{Math.floor(STRUCTURE_COSTS.Shipyard / 2)}R)</span>
                  </button>
                </div>
              )}

              {/* Build / Deconstruct FTL Inhibitor */}
              {!node.hasFtlInhibitor ? (
                <button
                  onClick={() => handleBuildStructure('FtlInhibitor')}
                  disabled={me.resources < STRUCTURE_COSTS.FtlInhibitor}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-red-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-300">FTL Inhibitor</span>
                    <span className="text-[9px] text-slate-500 font-mono">Blocks enemy ships transit</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 border border-amber-800/40 px-1.5 py-0.5 rounded">
                    {STRUCTURE_COSTS.FtlInhibitor}R
                  </span>
                </button>
              ) : (
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-center space-x-1 p-1.5 border border-red-950/30 bg-red-950/10 rounded text-red-400 text-xs font-mono font-bold">
                    <Shield className="h-3 w-3" />
                    <span>FTL Shield Active</span>
                  </div>
                  <button
                    onClick={() => handleDeconstructStructure('FtlInhibitor')}
                    className="flex items-center justify-center space-x-1 p-1 border border-red-900/40 bg-red-950/20 rounded text-red-400 text-[9px] font-mono hover:bg-red-950/40 transition-all"
                  >
                    <span>⚠ Deconstruct (+{Math.floor(STRUCTURE_COSTS.FtlInhibitor / 2)}R)</span>
                  </button>
                </div>
              )}

              {/* Build / Deconstruct Gateway */}
              {!node.hasGateway ? (
                <button
                  onClick={() => handleBuildStructure('Gateway')}
                  disabled={me.resources < STRUCTURE_COSTS.Gateway}
                  className="flex items-center justify-between p-2.5 border border-slate-800 bg-slate-950/60 rounded hover:border-purple-500/50 hover:bg-slate-900/60 disabled:opacity-40 transition-all"
                >
                  <div className="text-left">
                    <span className="block text-xs font-bold text-slate-300">Jump Gateway</span>
                    <span className="text-[9px] text-slate-500 font-mono">Enables instant teleportation</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 border border-amber-800/40 px-1.5 py-0.5 rounded">
                    {STRUCTURE_COSTS.Gateway}R
                  </span>
                </button>
              ) : (
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-center space-x-1 p-1.5 border border-purple-950/30 bg-purple-950/10 rounded text-purple-400 text-xs font-mono font-bold">
                    <Star className="h-3 w-3" />
                    <span>Gateway Active</span>
                  </div>
                  <button
                    onClick={() => handleDeconstructStructure('Gateway')}
                    className="flex items-center justify-center space-x-1 p-1 border border-red-900/40 bg-red-950/20 rounded text-red-400 text-[9px] font-mono hover:bg-red-950/40 transition-all"
                  >
                    <span>⚠ Deconstruct (+{Math.floor(STRUCTURE_COSTS.Gateway / 2)}R)</span>
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Shipyard constructions */}
          <div>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono flex justify-between">
              <span>Orbital Dockyards</span>
              {!node.hasShipyard && <span className="text-red-400 lowercase font-normal italic">Requires Shipyard</span>}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SHIP_STATS) as Array<keyof typeof SHIP_STATS>).map((type) => {
                const s = SHIP_STATS[type];
                const satisfiesShipyard = node.hasShipyard;
                const canAfford = me.resources >= s.cost;
                
                return (
                  <button
                    key={type}
                    disabled={!satisfiesShipyard || !canAfford}
                    onClick={() => handleBuildShip(type)}
                    className="flex items-center justify-between p-2 border border-slate-800 bg-slate-950/40 rounded hover:border-cyan-500/30 hover:bg-slate-900/40 disabled:opacity-30 transition-all text-left"
                  >
                    <div>
                      <span className="block text-xs font-semibold text-slate-300">{type}</span>
                      <span className="text-[8px] text-slate-500 font-mono block">
                        HP:{s.hp} | DMG:{s.dmgMin}-{s.dmgMax}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/25 border border-amber-900/30 px-1.5 py-0.5 rounded">
                      {s.cost}R
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ground Unit constructions */}
          <div>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 font-mono flex justify-between">
              <span>Ground Barracks</span>
              {node.development !== 'city' && node.development !== 'metropolis' ? (
                <span className="text-red-400 lowercase font-normal italic">Requires City/Metropolis</span>
              ) : (
                <span className="text-slate-500 lowercase font-normal">
                  Built: {groundUnitsBuilt}/{maxGroundUnits}
                </span>
              )}
            </span>
            
            <button
              disabled={
                (node.development !== 'city' && node.development !== 'metropolis') ||
                groundUnitsCapReached ||
                me.resources < GROUND_UNIT_STATS.cost
              }
              onClick={handleBuildGroundUnit}
              className="w-full flex items-center justify-between p-3 border border-slate-800 bg-slate-950/40 rounded hover:border-amber-500/30 hover:bg-slate-900/40 disabled:opacity-30 transition-all text-left"
            >
              <div>
                <span className="block text-xs font-semibold text-slate-300">Build Ground Unit ({GROUND_UNIT_STATS.cost})</span>
                <span className="text-[9px] text-slate-500 font-mono block">
                  HP:{GROUND_UNIT_STATS.hp} | DMG:{GROUND_UNIT_STATS.dmgMin}-{GROUND_UNIT_STATS.dmgMax}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/25 border border-amber-900/30 px-2.5 py-1 rounded">
                {GROUND_UNIT_STATS.cost}R
              </span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
