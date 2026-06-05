import React, { useEffect, useState } from 'react';
import type { GameState, StarNode, Ship } from '../types';
import { BuildPanel } from './BuildPanel';
import { FleetPanel } from './FleetPanel';
import { CombatPanel } from './CombatPanel';
import { audio } from '../services/audio';
import { Hammer, Swords, Anchor, Shield, Orbit, X } from 'lucide-react';

interface NodeDetailsProps {
  node: StarNode;
  gameState: GameState;
  myPlayerId: string;
  selectedShip: Ship | null;
  onSelectShip: (ship: Ship | null) => void;
  onUpdateState: (newState: GameState) => void;
  onClose: () => void;
  forceCombatTab?: boolean;
}

export const NodeDetails: React.FC<NodeDetailsProps> = ({
  node,
  gameState,
  myPlayerId,
  selectedShip,
  onSelectShip,
  onUpdateState,
  onClose,
  forceCombatTab = false
}) => {
  const [activeTab, setActiveTab] = useState<'build' | 'fleet' | 'combat'>(forceCombatTab ? 'combat' : 'fleet');
  
  // Collapse/Expand state for drawer on mobile
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (forceCombatTab) {
      setActiveTab('combat');
      setIsExpanded(true);
    }
  }, [forceCombatTab, gameState.activeCombatNodeId, gameState.activeCombatUpdatedAt]);

  // Always render the latest version of the selected node from gameState.
  // This prevents build/development/troop UI from staying stale until the user clicks away and back.
  const currentNode = gameState.nodes.find(n => n.id === node.id) || node;

  const getPlayerName = (ownerId: string | null) => {
    if (!ownerId) return 'Neutral/Unclaimed';
    return gameState.players.find(p => p.id === ownerId)?.name || 'Unknown';
  };

  const getPlayerColorHex = (ownerId: string | null) => {
    if (!ownerId) return 'text-slate-500';
    const color = gameState.players.find(p => p.id === ownerId)?.color || 'green';
    const mappings = {
      green: 'text-emerald-400',
      blue: 'text-blue-400',
      purple: 'text-violet-400',
      yellow: 'text-amber-400'
    };
    return mappings[color];
  };

  const isDysonSphere = currentNode.isDysonSphere;

  return (
    <div className={`fixed top-[56px] right-0 bottom-0 z-30 transition-all duration-300 ease-in-out bg-slate-900/95 border-l border-slate-800 backdrop-blur-md shadow-[-8px_0_30px_rgba(0,0,0,0.45)] glass-panel ${
      isExpanded ? 'w-full sm:w-[380px]' : 'w-[56px]'
    }`}>
      
      {/* 1. Header Collapse Handle */}
      <div className="h-2" />

      <div className="px-4 flex justify-between items-start gap-2">
        
        {/* Node Metadata Summary */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="text-left">
            <h3 className="text-base font-bold uppercase tracking-wider text-slate-100 flex items-center">
              {currentNode.name}
              {isDysonSphere && (
                <span className="ml-2 text-[9px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/40 px-1 py-0.5 rounded animate-pulse">
                  DYSON SPHERE
                </span>
              )}
              {forceCombatTab && (
                <span className="ml-2 text-[9px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1 py-0.5 rounded animate-pulse">
                  LIVE COMBAT
                </span>
              )}
            </h3>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              Owner: <span className={`font-bold ${getPlayerColorHex(currentNode.claimedBy)}`}>{getPlayerName(currentNode.claimedBy)}</span> | 
              Dev: <span className="capitalize text-indigo-400 font-semibold">{currentNode.development}</span> | 
              Gen: <span className="text-emerald-400 font-bold font-mono">{currentNode.resourceGeneration}R/turn</span>
            </span>
          </div>
          
          {/* Active Structure Badges */}
          <div className="flex space-x-1 items-center">
            {currentNode.hasShipyard && <span title="Shipyard Present"><Anchor className="h-3.5 w-3.5 text-cyan-400" /></span>}
            {currentNode.hasFtlInhibitor && <span title="FTL Inhibitor Present"><Shield className="h-3.5 w-3.5 text-red-400" /></span>}
            {currentNode.hasGateway && <span title="Hyper-gateway Present"><Orbit className="h-3.5 w-3.5 text-purple-400" /></span>}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Collapse/Expand indicator */}
          <button
            onClick={() => { audio.playBeep(); setIsExpanded(!isExpanded); }}
            className="text-xs uppercase tracking-wider font-bold font-mono text-slate-500 border border-slate-800 bg-slate-950/40 px-2 py-1 rounded hover:text-slate-300"
          >
            {isExpanded ? 'Hide' : 'Open'}
          </button>
          
          <button 
            onClick={() => { audio.playBeep(); onClose(); }}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/80"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 2. Expanded Content Tab-Bar & Panels */}
      {isExpanded && (
        <div className="px-4 mt-3 space-y-3 h-[calc(100%-92px)] flex flex-col min-h-0">
          
          {/* Tabs Bar */}
          <div className="grid grid-cols-3 gap-2 border-b border-slate-800/60 pb-2">
            <button
              onClick={() => { audio.playBeep(); setActiveTab('fleet'); }}
              className={`flex items-center justify-center py-2 text-xs font-bold uppercase tracking-wider border rounded transition-all ${
                activeTab === 'fleet'
                  ? 'border-blue-500 bg-blue-950/20 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.15)]'
                  : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:border-slate-700'
              }`}
            >
              <Orbit className="h-3.5 w-3.5 mr-1.5" />
              <span>Orbit Fleets</span>
            </button>

            <button
              onClick={() => { audio.playBeep(); setActiveTab('build'); }}
              className={`flex items-center justify-center py-2 text-xs font-bold uppercase tracking-wider border rounded transition-all ${
                activeTab === 'build'
                  ? 'border-indigo-500 bg-indigo-950/20 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.15)]'
                  : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:border-slate-700'
              }`}
            >
              <Hammer className="h-3.5 w-3.5 mr-1.5" />
              <span>Infrastructure</span>
            </button>

            <button
              onClick={() => { audio.playBeep(); setActiveTab('combat'); }}
              className={`flex items-center justify-center py-2 text-xs font-bold uppercase tracking-wider border rounded transition-all ${
                activeTab === 'combat'
                  ? 'border-rose-500 bg-rose-950/20 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
                  : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:border-slate-700'
              }`}
            >
              <Swords className="h-3.5 w-3.5 mr-1.5" />
              <span>Combat Area</span>
            </button>
          </div>

          {/* Active Tab Component */}
          <div className="mt-2 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-28">
            {activeTab === 'build' && (
              <BuildPanel
                node={currentNode}
                gameState={gameState}
                myPlayerId={myPlayerId}
                onUpdateState={onUpdateState}
              />
            )}

            {activeTab === 'fleet' && (
              <FleetPanel
                node={currentNode}
                gameState={gameState}
                myPlayerId={myPlayerId}
                selectedShip={selectedShip}
                onSelectShip={onSelectShip}
                onUpdateState={onUpdateState}
              />
            )}

            {activeTab === 'combat' && (
              <CombatPanel
                node={currentNode}
                gameState={gameState}
                myPlayerId={myPlayerId}
                onUpdateState={onUpdateState}
              />
            )}
          </div>

        </div>
      )}

    </div>
  );
};
