import React from 'react';
import type { GameState, StarNode, Ship } from '../types';
import { usePanZoom } from '../hooks/usePanZoom';
import { audio } from '../services/audio';

interface MapProps {
  gameState: GameState;
  myPlayerId: string;
  selectedNode: StarNode | null;
  onSelectNode: (node: StarNode) => void;
  selectedShip: Ship | null;
  reachableNodes: { [nodeId: string]: number };
  onMoveShip: (targetNodeId: string) => void;
  fogOfWarEnabled: boolean;
}

// ─── Ship SVG Silhouettes ──────────────────────────────────────────────────
// Each returns a small SVG path group centered at (0,0), scaled to ~10px size.

const ShipIcon: React.FC<{ type: Ship['type']; color: string; size?: number }> = ({
  type,
  color,
  size = 10,
}) => {
  const s = size;
  switch (type) {
    case 'Destroyer':
      // Sleek elongated arrowhead hull
      return (
        <g fill={color} stroke={color} strokeWidth="0.3" opacity="0.95">
          <polygon points={`0,${-s} ${s * 0.35},${s * 0.5} 0,${s * 0.2} ${-s * 0.35},${s * 0.5}`} />
          <line x1="0" y1={-s} x2="0" y2={s * 0.2} strokeWidth="0.5" stroke="#fff" opacity="0.4" />
        </g>
      );
    case 'BattleShip':
      // Wide delta-wing dreadnought
      return (
        <g fill={color} stroke={color} strokeWidth="0.3" opacity="0.95">
          <polygon points={`0,${-s} ${s * 0.6},${s * 0.6} ${s * 0.15},${s * 0.2} ${-s * 0.15},${s * 0.2} ${-s * 0.6},${s * 0.6}`} />
          <rect x={-s * 0.08} y={-s * 0.5} width={s * 0.16} height={s * 0.6} fill="#fff" opacity="0.25" rx="1" />
        </g>
      );
    case 'Carrier':
      // Broad rectangular carrier with flight deck
      return (
        <g fill={color} stroke={color} strokeWidth="0.3" opacity="0.95">
          <rect x={-s * 0.55} y={-s * 0.4} width={s * 1.1} height={s * 0.8} rx={s * 0.1} />
          <polygon points={`${-s * 0.55},${-s * 0.4} 0,${-s * 0.8} ${s * 0.55},${-s * 0.4}`} />
          <line x1={-s * 0.35} y1="0" x2={s * 0.35} y2="0" stroke="#fff" strokeWidth="0.6" opacity="0.4" />
        </g>
      );
    case 'ColonyShip':
      // Rounded habitat sphere with thruster bell
      return (
        <g fill={color} stroke={color} strokeWidth="0.3" opacity="0.9">
          <circle r={s * 0.45} fill={color} />
          <polygon points={`${-s * 0.2},${s * 0.45} 0,${s * 0.85} ${s * 0.2},${s * 0.45}`} />
          <circle r={s * 0.2} fill="#fff" opacity="0.2" />
        </g>
      );
    case 'Fighter':
      // Tiny dart
      return (
        <g fill={color} stroke={color} strokeWidth="0.2" opacity="0.9">
          <polygon points={`0,${-s * 0.7} ${s * 0.25},${s * 0.5} 0,${s * 0.1} ${-s * 0.25},${s * 0.5}`} />
        </g>
      );
    default:
      return <circle r={s * 0.5} fill={color} />;
  }
};

// ─── Planet Development SVG Icons ─────────────────────────────────────────
// Drawn inside the planet circle (radius ~18px). Keep icons small (max ~12px).

const DevelopmentIcon: React.FC<{ development: string }> = ({ development }) => {
  switch (development) {
    case 'colony':
      // Small dome / outpost
      return (
        <g fill="none" stroke="#a3e635" strokeWidth="1.2" opacity="0.85">
          {/* dome */}
          <path d="M-5,2 A5,5 0 0,1 5,2 Z" />
          <line x1="-6" y1="2" x2="6" y2="2" strokeWidth="1" />
          {/* antenna */}
          <line x1="0" y1="2" x2="0" y2="-4" strokeWidth="0.8" />
          <circle cx="0" cy="-4.5" r="0.8" fill="#a3e635" stroke="none" />
        </g>
      );
    case 'city':
      // Mid-size buildings / cityscape
      return (
        <g fill="#60a5fa" stroke="#60a5fa" strokeWidth="0.5" opacity="0.85">
          {/* left building */}
          <rect x="-7" y="-1" width="4" height="5" rx="0.5" />
          <rect x="-6" y="-3" width="2" height="2" rx="0.3" />
          {/* center tall tower */}
          <rect x="-1.5" y="-5" width="3" height="9" rx="0.5" />
          {/* right building */}
          <rect x="3" y="-2" width="4" height="6" rx="0.5" />
          <rect x="4" y="-4" width="2" height="2" rx="0.3" />
          {/* ground line */}
          <line x1="-8" y1="4" x2="8" y2="4" strokeWidth="0.8" stroke="#94a3b8" />
        </g>
      );
    case 'metropolis':
      // Dense skyscraper skyline
      return (
        <g fill="#c084fc" stroke="#c084fc" strokeWidth="0.4" opacity="0.9">
          {/* far-left */}
          <rect x="-9" y="0" width="3" height="6" rx="0.4" />
          {/* left-mid */}
          <rect x="-6" y="-3" width="3.5" height="9" rx="0.4" />
          {/* center megaspire */}
          <rect x="-2" y="-7" width="4" height="13" rx="0.5" />
          <polygon points="-2,-7 0,-10 2,-7" fill="#e879f9" />
          {/* right-mid */}
          <rect x="2.5" y="-4" width="3.5" height="10" rx="0.4" />
          {/* far-right */}
          <rect x="6" y="-1" width="3" height="7" rx="0.4" />
          {/* windows dots */}
          <circle cx="0" cy="-4" r="0.6" fill="#fff" opacity="0.5" />
          <circle cx="0" cy="-1" r="0.6" fill="#fff" opacity="0.5" />
          <circle cx="0" cy="2" r="0.6" fill="#fff" opacity="0.5" />
          {/* ground */}
          <line x1="-10" y1="6" x2="10" y2="6" strokeWidth="0.8" stroke="#94a3b8" />
        </g>
      );
    default:
      return null;
  }
};

// ─── Orbital Ship Cluster Renderer ────────────────────────────────────────
// Renders up to 8 ship icons evenly spaced on an orbit ring around the planet.
// Groups ships by type so duplicates are shown with a count badge.

interface OrbitShipsProps {
  ships: Ship[];
  playerColors: Record<string, string>;
  players: GameState['players'];
  planetRadius: number;
}

const OrbitShips: React.FC<OrbitShipsProps> = ({ ships, playerColors, players, planetRadius }) => {
  if (ships.length === 0) return null;

  // Deduplicate by (type, owner) pair for display grouping
  const groups: { type: Ship['type']; owner: string; count: number }[] = [];
  ships.forEach((ship) => {
    const existing = groups.find((g) => g.type === ship.type && g.owner === ship.owner);
    if (existing) existing.count++;
    else groups.push({ type: ship.type, owner: ship.owner, count: 1 });
  });

  // Cap display to 8 slots
  const display = groups.slice(0, 8);
  const orbitRadius = planetRadius + 20;
  const angleStep = (2 * Math.PI) / Math.max(display.length, 1);

  return (
    <>
      {display.map((group, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const cx = Math.cos(angle) * orbitRadius;
        const cy = Math.sin(angle) * orbitRadius;
        const player = players.find((p) => p.id === group.owner);
        const color = player ? playerColors[player.color] : '#94a3b8';
        return (
          <g key={`${group.type}-${group.owner}-${i}`} transform={`translate(${cx}, ${cy})`} pointerEvents="none">
            <ShipIcon type={group.type} color={color} size={7} />
            {group.count > 1 && (
              <>
                <circle cx="5" cy="-5" r="4" fill="#0f172a" stroke={color} strokeWidth="0.8" />
                <text x="5" y="-2.5" textAnchor="middle" fill={color} fontSize="4.5" fontWeight="bold" fontFamily="monospace">
                  {group.count}
                </text>
              </>
            )}
          </g>
        );
      })}
    </>
  );
};

// ─── Main Map Component ───────────────────────────────────────────────────

export const Map: React.FC<MapProps> = ({
  gameState,
  myPlayerId,
  selectedNode,
  onSelectNode,
  selectedShip,
  reachableNodes,
  onMoveShip,
  fogOfWarEnabled,
}) => {
  const { panX, panY, scale, handlers, reset } = usePanZoom(0.3, 2.5, 50, 50, 0.65);

  // Player Color Mapping
  const playerColors: Record<string, string> = {
    green: '#10b981',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    yellow: '#f59e0b',
  };

  const getPlayerColorHex = (claimedBy: string | null) => {
    if (!claimedBy) return '#475569';
    const player = gameState.players.find((p) => p.id === claimedBy);
    return player ? playerColors[player.color] : '#475569';
  };

  // Fog of war check
  const isNodeVisible = (node: StarNode) => {
    if (!fogOfWarEnabled) return true;
    const isMine = node.claimedBy === myPlayerId;
    const hasMyUnits =
      node.ships.some((s) => s.owner === myPlayerId) ||
      node.groundUnits.some((g) => g.owner === myPlayerId);
    if (isMine || hasMyUnits) return true;
    const myNodeIds = new Set(
      gameState.nodes
        .filter(
          (n) =>
            n.claimedBy === myPlayerId ||
            n.ships.some((s) => s.owner === myPlayerId) ||
            n.groundUnits.some((g) => g.owner === myPlayerId)
        )
        .map((n) => n.id)
    );
    return node.links.some((linkId) => myNodeIds.has(linkId));
  };

  const handleNodeClick = (node: StarNode) => {
    audio.playBeep(500, 0.05);
    const isReachable = reachableNodes[node.id] !== undefined;
    if (
      selectedShip &&
      isReachable &&
      gameState.phase === 1 &&
      gameState.players[gameState.activePlayerIndex].id === myPlayerId
    ) {
      onMoveShip(node.id);
    } else {
      onSelectNode(node);
    }
  };

  const ringsCount = Math.ceil(Math.sqrt(gameState.nodes.length / 3));
  const maxRadius = 450;
  const centerX = 500;
  const centerY = 500;

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden touch-none border border-slate-900">
      <svg className="w-full h-full cursor-grab active:cursor-grabbing select-none" {...handlers}>
        <defs>
          <radialGradient id="nebula" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </radialGradient>
          <filter id="glow-green" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-blue" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-purple" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-yellow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-orange" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Nebula Background */}
        <circle cx={centerX} cy={centerY} r={maxRadius + 100} fill="url(#nebula)" pointerEvents="none" />

        <g transform={`translate(${panX}, ${panY}) scale(${scale})`}>
          {/* Grid Rings */}
          {Array.from({ length: ringsCount }).map((_, idx) => {
            const radius = ((idx + 1) / ringsCount) * maxRadius;
            return (
              <circle
                key={`grid-ring-${idx}`}
                cx={centerX}
                cy={centerY}
                r={radius}
                fill="none"
                stroke="#334155"
                strokeWidth="1"
                strokeDasharray="4 6"
                opacity="0.25"
                pointerEvents="none"
              />
            );
          })}

          {/* Radar sweep */}
          <line
            x1={centerX}
            y1={centerY}
            x2={centerX + maxRadius}
            y2={centerY}
            stroke="#1e293b"
            strokeWidth="1.5"
            opacity="0.3"
            pointerEvents="none"
            className="origin-[500px_500px] animate-radar-sweep"
          />

          {/* Hyperlanes */}
          {gameState.nodes.map((node) =>
            node.links.map((linkId) => {
              if (node.id > linkId) return null;
              const targetNode = gameState.nodes.find((n) => n.id === linkId);
              if (!targetNode) return null;
              const visible = isNodeVisible(node) || isNodeVisible(targetNode);
              if (!visible) return null;
              const isSelectedPath =
                selectedShip &&
                ((node.id === selectedNode?.id && reachableNodes[targetNode.id] !== undefined) ||
                  (targetNode.id === selectedNode?.id && reachableNodes[node.id] !== undefined));
              return (
                <line
                  key={`link-${node.id}-${linkId}`}
                  x1={node.x}
                  y1={node.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                  stroke={isSelectedPath ? '#eab308' : '#1e293b'}
                  strokeWidth={isSelectedPath ? 2.5 : 1.5}
                  strokeDasharray={isSelectedPath ? '5 3' : undefined}
                  className="transition-all duration-300"
                  opacity={isSelectedPath ? 0.9 : 0.4}
                />
              );
            })
          )}

          {/* Star System Nodes */}
          {gameState.nodes.map((node) => {
            const visible = isNodeVisible(node);
            const isSelected = selectedNode?.id === node.id;
            const isReachable = reachableNodes[node.id] !== undefined;
            const nodeColor = getPlayerColorHex(node.claimedBy);
            const planetR = node.isDysonSphere ? 22 : 18;

            // Fog of war hidden node
            if (!visible) {
              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <circle r="15" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
                  <text y="3" textAnchor="middle" fill="#334155" fontSize="8" fontFamily="monospace">?</text>
                </g>
              );
            }

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer group"
                onClick={() => handleNodeClick(node)}
              >
                {/* Reachable ring */}
                {isReachable && (
                  <circle
                    r={planetR + 16}
                    fill="none"
                    stroke="#eab308"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="animate-spin"
                    style={{ animationDuration: '8s' }}
                  />
                )}

                {/* Selection glow */}
                {isSelected && (
                  <circle
                    r={planetR + 14}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="2.5"
                    className="animate-pulse"
                  />
                )}

                {/* Structure rings */}
                {node.hasGateway && (
                  <circle
                    r={planetR + 10}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="1.5"
                    strokeDasharray="8 4"
                    className="animate-spin"
                    style={{ animationDuration: '15s' }}
                  />
                )}
                {node.hasShipyard && (
                  <circle
                    r={planetR + 7}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}
                {node.hasFtlInhibitor && (
                  <circle
                    r={planetR + 8}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                  />
                )}

                {/* ── Planet base circle ── */}
                <circle
                  r={planetR}
                  fill={node.isDysonSphere ? '#f59e0b' : node.claimedBy ? nodeColor : '#1e293b'}
                  stroke={isSelected ? '#f43f5e' : isReachable ? '#eab308' : '#475569'}
                  strokeWidth={node.isDysonSphere ? 3 : 2}
                  filter={
                    node.isDysonSphere
                      ? 'url(#glow-orange)'
                      : node.claimedBy
                      ? `url(#glow-${gameState.players.find((p) => p.id === node.claimedBy)?.color})`
                      : undefined
                  }
                  className="transition-all duration-300 group-hover:scale-110"
                />

                {/* ── Planet development icon (inside planet) ── */}
                {!node.isDysonSphere && node.development !== 'none' && (
                  <g transform="translate(0, 3)" pointerEvents="none">
                    <DevelopmentIcon development={node.development} />
                  </g>
                )}

                {/* Dyson sphere center dot */}
                {node.isDysonSphere && (
                  <circle r="6" fill="#fff" className="animate-ping" style={{ animationDuration: '2s' }} />
                )}

                {/* ── Orbiting ship silhouettes ── */}
                <OrbitShips
                  ships={node.ships}
                  playerColors={playerColors}
                  players={gameState.players}
                  planetRadius={planetR}
                />

                {/* Ground unit square icons, grouped below the orbital ring */}
                {node.groundUnits.length > 0 && (() => {
                  const groups: { owner: string; count: number }[] = [];
                  node.groundUnits.forEach((unit) => {
                    const existing = groups.find((g) => g.owner === unit.owner);
                    if (existing) existing.count += 1;
                    else groups.push({ owner: unit.owner, count: 1 });
                  });
                  const shadeMap: Record<string, string> = {
                    green: '#34d399', blue: '#60a5fa', purple: '#a78bfa', yellow: '#fbbf24'
                  };
                  return (
                    <g transform={`translate(${-((groups.length - 1) * 8)}, ${planetR + 8})`} pointerEvents="none">
                      {groups.map((group, idx) => {
                        const player = gameState.players.find((p) => p.id === group.owner);
                        const color = group.owner === 'npc' ? '#94a3b8' : shadeMap[player?.color || 'green'];
                        return (
                          <g key={`${node.id}-ground-${group.owner}`} transform={`translate(${idx * 16}, 0)`}>
                            <rect x="-5" y="-5" width="10" height="10" fill={color} stroke="#020617" strokeWidth="1" rx="1.5" opacity="0.95" />
                            {group.count > 1 && (
                              <text x="0" y="3" textAnchor="middle" fill="#020617" fontSize="6" fontWeight="bold" fontFamily="monospace">
                                {group.count}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}

                {/* Star name */}
                <text
                  y={planetR + 18}
                  textAnchor="middle"
                  fill={isSelected ? '#f43f5e' : isReachable ? '#eab308' : '#94a3b8'}
                  fontSize="11"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  fontFamily="monospace"
                  className="bg-slate-950 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute right-4 bottom-4 flex flex-col space-y-2 z-10">
        <button
          onClick={() => { audio.playBeep(); reset(); }}
          className="px-3 py-1.5 bg-slate-900/90 border border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 rounded hover:text-white"
        >
          Recenter Map
        </button>
      </div>

      {/* Map Legend */}
      <div className="absolute left-4 top-4 bg-slate-900/80 border border-slate-800/60 rounded px-2.5 py-1.5 text-[9px] font-mono text-slate-400 space-y-1 z-10 pointer-events-none hidden md:block">
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-slate-600" />
          <span>Neutral System</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_4px_#10b981]" />
          <span>Friendly Territory</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2.5 h-2.5 border border-cyan-500 border-dashed rounded-full" />
          <span>Shipyard</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2.5 h-2.5 border border-purple-500 border-dashed rounded-full" />
          <span>Gateway (Instant Jump)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2.5 h-2.5 border border-red-500 rounded-full" />
          <span>FTL Inhibitor</span>
        </div>
        <div className="mt-1 pt-1 border-t border-slate-800 space-y-0.5">
          <div className="flex items-center space-x-1.5">
            <svg width="10" height="10" viewBox="-5 -5 10 10"><polygon points="0,-4 1.5,2 0,1 -1.5,2" fill="#94a3b8" /></svg>
            <span>Destroyer</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <svg width="10" height="10" viewBox="-6 -6 12 12"><polygon points="0,-5 2.5,3 0.6,1 -0.6,1 -2.5,3" fill="#94a3b8" /></svg>
            <span>BattleShip</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <svg width="10" height="10" viewBox="-6 -6 12 12"><rect x="-4" y="-2" width="8" height="5" rx="1" fill="#94a3b8" /></svg>
            <span>Carrier</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <svg width="10" height="10" viewBox="-5 -5 10 10"><circle r="3" fill="#94a3b8" /></svg>
            <span>Colony Ship</span>
          </div>
        </div>
      </div>
    </div>
  );
};
