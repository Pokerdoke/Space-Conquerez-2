import React, { useEffect, useMemo, useRef } from 'react';
import type { GameState, PlanetBiome, Ship, StarNode } from '../types';
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

const PLAYER_COLORS: Record<string, string> = {
  green: '#10b981',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  yellow: '#f59e0b',
};

const BIOMES: PlanetBiome[] = [
  'ocean',
  'tropical',
  'continental',
  'savannah',
  'desert',
  'arid',
  'tundra',
  'alpine',
  'arctic',
  'gas',
  'rock',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getBiome(node: StarNode): PlanetBiome {
  if (node.isDysonSphere) return 'gas';
  return node.biome ?? BIOMES[hashString(node.id) % BIOMES.length];
}

function getBiomePalette(biome: PlanetBiome) {
  switch (biome) {
    case 'ocean':
      return { base: '#3a86c6', secondary: '#86d1ff', accent: '#d9f4ff', cloud: '#ffffff', city: '#93c5fd' };
    case 'tropical':
      return { base: '#2a6db0', secondary: '#34b77d', accent: '#b7f0cf', cloud: '#ecfeff', city: '#86efac' };
    case 'continental':
      return { base: '#53715a', secondary: '#9f8f69', accent: '#d8d1bb', cloud: '#f8fafc', city: '#cbd5e1' };
    case 'savannah':
      return { base: '#99673e', secondary: '#d59b57', accent: '#f7d998', cloud: '#fff7e6', city: '#fde68a' };
    case 'desert':
      return { base: '#b9854d', secondary: '#e3bc76', accent: '#f8e2b5', cloud: '#fff1d6', city: '#fdba74' };
    case 'arid':
      return { base: '#b99b74', secondary: '#d8be94', accent: '#efe0bb', cloud: '#fff6df', city: '#fcd34d' };
    case 'tundra':
      return { base: '#667a6f', secondary: '#b7c5a8', accent: '#ecf4d6', cloud: '#ffffff', city: '#d9f99d' };
    case 'alpine':
      return { base: '#9f89a4', secondary: '#d8bfd8', accent: '#f8edf8', cloud: '#ffffff', city: '#e9d5ff' };
    case 'arctic':
      return { base: '#d7dde7', secondary: '#f1f5f9', accent: '#ffffff', cloud: '#ffffff', city: '#e0f2fe' };
    case 'gas':
      return { base: '#8b6fb0', secondary: '#f0aa5b', accent: '#f8d2a2', cloud: '#fff8ef', city: '#f5d0fe' };
    case 'rock':
    default:
      return { base: '#656d77', secondary: '#8e9aa8', accent: '#c0cad5', cloud: '#f8fafc', city: '#cbd5e1' };
  }
}

const GalaxyBackdrop: React.FC<{ panX: number; panY: number }> = ({ panX, panY }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<{ x: number; y: number; r: number; o: number }[]>([]);
  const brightStarsRef = useRef<{ x: number; y: number; r: number; o: number }[]>([]);

  if (starsRef.current.length === 0) {
    starsRef.current = Array.from({ length: 400 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.45 + Math.random() * 1.2,
      o: 0.3 + Math.random() * 0.6,
    }));
    brightStarsRef.current = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 1 + Math.random() * 1.4,
      o: 0.25 + Math.random() * 0.35,
    }));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;

    const draw = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const targetW = Math.max(1, Math.floor(width * dpr));
      const targetH = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#020718');
      bg.addColorStop(0.45, '#07102a');
      bg.addColorStop(1, '#020617');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const parallaxX = ((panX * 0.3) % width + width) % width;
      const parallaxY = ((panY * 0.3) % height + height) % height;

      const nebulaCenters = [
        { x: width * 0.2 + parallaxX * 0.25, y: height * 0.35 + parallaxY * 0.18, r: Math.min(width, height) * 0.5, c: 'rgba(80, 110, 255, 0.18)' },
        { x: width * 0.7 - parallaxX * 0.18, y: height * 0.28 + parallaxY * 0.15, r: Math.min(width, height) * 0.46, c: 'rgba(70, 220, 220, 0.12)' },
        { x: width * 0.5 + parallaxX * 0.15, y: height * 0.72 - parallaxY * 0.2, r: Math.min(width, height) * 0.6, c: 'rgba(120, 80, 255, 0.18)' },
      ];

      nebulaCenters.forEach(({ x, y, r, c }) => {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, c);
        grad.addColorStop(0.55, c.replace(/0\.\d+\)/, '0.06)'));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });

      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      const hex = 54;
      const hexH = Math.sin(Math.PI / 3) * hex;
      const gridOffsetX = ((panX * 0.12) % (hex * 1.5) + hex * 1.5) % (hex * 1.5);
      const gridOffsetY = ((panY * 0.12) % (hexH * 2) + hexH * 2) % (hexH * 2);
      for (let row = -2; row < Math.ceil(height / hexH) + 3; row++) {
        for (let col = -2; col < Math.ceil(width / (hex * 1.5)) + 3; col++) {
          const x = col * hex * 1.5 - gridOffsetX;
          const y = row * hexH + (col % 2 ? hexH / 1 : 0) - gridOffsetY;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            const px = x + Math.cos(a) * hex * 0.5;
            const py = y + Math.sin(a) * hex * 0.5;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();

      starsRef.current.forEach((star) => {
        ctx.fillStyle = `rgba(255,255,255,${star.o})`;
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
        ctx.fill();
      });

      brightStarsRef.current.forEach((star) => {
        const x = (star.x * width + parallaxX * 0.18) % width;
        const y = (star.y * height + parallaxY * 0.18) % height;
        ctx.fillStyle = `rgba(220,235,255,${star.o})`;
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const scheduleDraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    scheduleDraw();
    resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(host);
    window.addEventListener('resize', scheduleDraw);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleDraw);
    };
  }, [panX, panY]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />;
};

const ShipIcon: React.FC<{ type: Ship['type']; color: string; size?: number }> = ({ type, color, size = 7 }) => {
  const s = size;
  switch (type) {
    case 'Destroyer':
      return (
        <g fill={color} stroke="#0f172a" strokeWidth="0.3" opacity="0.96">
          <path d={`M0 ${-s} L${s * 0.62} ${s * 0.58} L0 ${s * 0.18} L${-s * 0.62} ${s * 0.58} Z`} />
          <path d={`M0 ${-s * 0.65} L${s * 0.18} ${-s * 0.05} L0 ${s * 0.16} L${-s * 0.18} ${-s * 0.05} Z`} fill="#e2e8f0" opacity="0.45" />
        </g>
      );
    case 'BattleShip':
      return (
        <g fill={color} stroke="#0f172a" strokeWidth="0.35" opacity="0.98">
          <path d={`M0 ${-s} L${s * 0.74} ${s * 0.6} L${s * 0.2} ${s * 0.3} L${-s * 0.2} ${s * 0.3} L${-s * 0.74} ${s * 0.6} Z`} />
          <rect x={-s * 0.12} y={-s * 0.56} width={s * 0.24} height={s * 0.74} rx="0.8" fill="#f8fafc" opacity="0.28" />
        </g>
      );
    case 'Carrier':
      return (
        <g fill={color} stroke="#0f172a" strokeWidth="0.35" opacity="0.96">
          <path d={`M${-s * 0.72} ${s * 0.36} L${-s * 0.52} ${-s * 0.12} L0 ${-s * 0.84} L${s * 0.52} ${-s * 0.12} L${s * 0.72} ${s * 0.36} Z`} />
          <path d={`M${-s * 0.24} ${-s * 0.02} L0 ${-s * 0.42} L${s * 0.24} ${-s * 0.02}`} stroke="#f8fafc" strokeWidth="0.45" fill="none" opacity="0.42" />
        </g>
      );
    case 'ColonyShip':
      return (
        <g fill={color} stroke="#0f172a" strokeWidth="0.25" opacity="0.92">
          <ellipse rx={s * 0.58} ry={s * 0.42} />
          <path d={`M${-s * 0.22} ${s * 0.38} L0 ${s * 0.8} L${s * 0.22} ${s * 0.38}`} />
          <circle r={s * 0.18} fill="#ffffff" opacity="0.25" />
        </g>
      );
    case 'Fighter':
      return (
        <g fill={color} stroke="#0f172a" strokeWidth="0.2" opacity="0.92">
          <path d={`M0 ${-s * 0.72} L${s * 0.28} ${s * 0.52} L0 ${s * 0.12} L${-s * 0.28} ${s * 0.52} Z`} />
        </g>
      );
    default:
      return <circle r={s * 0.5} fill={color} />;
  }
};

const DevelopmentIcon: React.FC<{ development: string; color: string }> = ({ development, color }) => {
  if (development === 'none') return null;
  if (development === 'colony') {
    return (
      <g opacity="0.96">
        <ellipse cx="0" cy="5.5" rx="7" ry="2" fill="rgba(2,6,23,0.45)" />
        <path d="M-6,4 A6,6 0 0,1 6,4" fill="none" stroke={color} strokeWidth="1.2" />
        <line x1="-7" y1="4" x2="7" y2="4" stroke={color} strokeWidth="1" />
        <line x1="0" y1="4" x2="0" y2="-2" stroke={color} strokeWidth="0.9" />
        <circle cx="0" cy="-2.5" r="0.9" fill={color} />
      </g>
    );
  }

  const skyline = {
    city: [
      [-7, 0, 3, 5],
      [-3.5, -2, 3, 7],
      [0, -4, 3.2, 9],
      [3.8, -1, 3, 6],
    ],
    metropolis: [
      [-8, -1, 3, 6],
      [-4.3, -5, 3.2, 10],
      [-0.3, -7, 3.3, 12],
      [3.6, -4, 3.1, 9],
      [7.1, -2, 2.6, 7],
    ],
    arcology: [
      [-7.5, -2, 3, 7],
      [-4, -6, 3.5, 11],
      [0, -8, 4, 13],
      [4.5, -5, 3.5, 10],
      [8.3, -1, 2.6, 6],
    ],
    coreworld: [
      [-7.5, -3, 3, 8],
      [-3.8, -7, 3.6, 12],
      [0, -10, 4.4, 15],
      [4.6, -6, 3.6, 11],
      [8.5, -2, 2.7, 7],
    ],
  } as Record<string, number[][]>;

  const bars = skyline[development] ?? skyline.city;
  return (
    <g opacity="0.98">
      <ellipse cx="0" cy="6" rx="10" ry="2.5" fill="rgba(2,6,23,0.45)" />
      {bars.map(([x, y, w, h], idx) => (
        <g key={`${development}-${idx}`}>
          <rect x={x + 0.7} y={y + 0.8} width={w} height={h} rx="0.4" fill="rgba(2,6,23,0.38)" />
          <rect x={x} y={y} width={w} height={h} rx="0.4" fill={color} />
        </g>
      ))}
      <line x1="-10" y1="5.2" x2="10" y2="5.2" stroke="rgba(15,23,42,0.8)" strokeWidth="0.8" />
    </g>
  );
};

const OrbitShips: React.FC<{
  ships: Ship[];
  playerColors: Record<string, string>;
  players: GameState['players'];
  planetRadius: number;
}> = ({ ships, playerColors, players, planetRadius }) => {
  if (ships.length === 0) return null;

  const groups: { type: Ship['type']; owner: string; count: number }[] = [];
  ships.forEach((ship) => {
    const existing = groups.find((g) => g.type === ship.type && g.owner === ship.owner);
    if (existing) existing.count += 1;
    else groups.push({ type: ship.type, owner: ship.owner, count: 1 });
  });

  const display = groups.slice(0, 8);
  const orbitRadius = planetRadius + 18;
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
                <circle cx="5" cy="-5" r="4" fill="#020617" stroke={color} strokeWidth="0.8" />
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

const PlanetBody: React.FC<{
  node: StarNode;
  radius: number;
  isSelected: boolean;
  claimedColor?: string | null;
}> = ({ node, radius, isSelected, claimedColor }) => {
  const biome = getBiome(node);
  const palette = getBiomePalette(biome);
  const gradientId = `planet-grad-${node.id}`;
  const clipId = `planet-clip-${node.id}`;
  const surfaceId = `planet-surface-${node.id}`;

  const developmentColors: Record<string, string> = {
    colony: '#a3e635',
    city: '#93c5fd',
    metropolis: '#c084fc',
    arcology: '#67e8f9',
    coreworld: '#fde68a',
  };

  return (
    <>
      <defs>
        <radialGradient id={gradientId} cx="30%" cy="28%" r="75%">
          <stop offset="0%" stopColor={palette.accent} />
          <stop offset="52%" stopColor={palette.secondary} />
          <stop offset="100%" stopColor={palette.base} />
        </radialGradient>
        <clipPath id={clipId}>
          <circle r={radius} />
        </clipPath>
        <radialGradient id={surfaceId} cx="35%" cy="32%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.0)" />
          <stop offset="70%" stopColor="rgba(255,255,255,0.0)" />
          <stop offset="100%" stopColor="rgba(2,6,23,0.5)" />
        </radialGradient>
      </defs>

      {claimedColor && (
        <>
          <circle r={radius + 12} fill={claimedColor} opacity="0.06" />
          <circle r={radius + 5} fill="none" stroke={claimedColor} strokeWidth="1.6" opacity="0.6" />
        </>
      )}

      <ellipse cx="0" cy={radius * 0.95} rx={radius * 1.25} ry={radius * 0.45} fill="rgba(0,0,0,0.35)" />

      <g clipPath={`url(#${clipId})`}>
        <circle r={radius} fill={`url(#${gradientId})`} />

        {biome === 'gas' ? (
          <>
            <ellipse cx="-1" cy="-7" rx={radius * 1.05} ry={radius * 0.2} fill={palette.accent} opacity="0.45" />
            <ellipse cx="1" cy="-1" rx={radius * 1.05} ry={radius * 0.17} fill={palette.secondary} opacity="0.45" />
            <ellipse cx="0" cy="6" rx={radius * 1.05} ry={radius * 0.2} fill={palette.base} opacity="0.35" />
            <path d={`M${-radius} ${radius * 0.1} Q0 ${-radius * 0.2} ${radius} ${radius * 0.1}`} stroke={palette.cloud} strokeWidth="1.2" opacity="0.3" fill="none" />
          </>
        ) : (
          <>
            <ellipse cx={-radius * 0.2} cy={-radius * 0.18} rx={radius * 0.5} ry={radius * 0.24} fill={palette.secondary} opacity="0.58" transform="rotate(-18)" />
            <ellipse cx={radius * 0.24} cy={radius * 0.12} rx={radius * 0.38} ry={radius * 0.19} fill={palette.base} opacity="0.42" transform="rotate(24)" />
            <ellipse cx={-radius * 0.34} cy={radius * 0.28} rx={radius * 0.22} ry={radius * 0.14} fill={palette.accent} opacity="0.34" transform="rotate(-10)" />
            {(biome === 'ocean' || biome === 'tropical' || biome === 'continental' || biome === 'savannah' || biome === 'tundra') && (
              <>
                <path d={`M${-radius * 0.85} ${-radius * 0.1} Q${-radius * 0.2} ${-radius * 0.55} ${radius * 0.25} ${-radius * 0.18} Q${radius * 0.45} ${radius * 0.05} ${radius * 0.8} ${-radius * 0.2}`} stroke={palette.cloud} strokeWidth="1.1" opacity="0.38" fill="none" />
                <path d={`M${-radius * 0.7} ${radius * 0.38} Q0 ${radius * 0.15} ${radius * 0.55} ${radius * 0.42}`} stroke={palette.cloud} strokeWidth="0.9" opacity="0.28" fill="none" />
              </>
            )}
            {biome === 'desert' && (
              <>
                <path d={`M${-radius * 0.95} ${-radius * 0.25} Q${-radius * 0.2} ${-radius * 0.42} ${radius * 0.7} ${-radius * 0.2}`} stroke={palette.accent} strokeWidth="1" opacity="0.35" fill="none" />
                <path d={`M${-radius * 0.8} ${radius * 0.25} Q0 0 ${radius * 0.8} ${radius * 0.25}`} stroke={palette.accent} strokeWidth="0.9" opacity="0.25" fill="none" />
              </>
            )}
            {biome === 'arid' && <ellipse cx={radius * 0.18} cy={-radius * 0.14} rx={radius * 0.62} ry={radius * 0.12} fill={palette.accent} opacity="0.22" transform="rotate(-24)" />}
            {biome === 'arctic' && <ellipse cx={-radius * 0.08} cy={-radius * 0.08} rx={radius * 0.75} ry={radius * 0.5} fill="#ffffff" opacity="0.3" />}
            {biome === 'rock' && (
              <>
                <circle cx={-radius * 0.25} cy={-radius * 0.15} r={radius * 0.16} fill="rgba(15,23,42,0.28)" />
                <circle cx={radius * 0.3} cy={radius * 0.22} r={radius * 0.12} fill="rgba(15,23,42,0.24)" />
              </>
            )}
          </>
        )}

        <circle r={radius} fill={`url(#${surfaceId})`} />
        <ellipse cx={-radius * 0.2} cy={-radius * 0.55} rx={radius * 0.6} ry={radius * 0.28} fill="#ffffff" opacity="0.22" transform="rotate(-18)" />
      </g>

      <circle r={radius} fill="none" stroke={isSelected ? '#38bdf8' : 'rgba(226,232,240,0.18)'} strokeWidth="1.3" />

      {!node.isDysonSphere && node.development !== 'none' && (
        <g transform={`translate(0, ${radius * 0.15})`} pointerEvents="none">
          <DevelopmentIcon development={node.development} color={developmentColors[node.development] ?? palette.city} />
        </g>
      )}

      {node.isDysonSphere && (
        <g opacity="0.7">
          <circle r={radius * 0.52} fill="none" stroke="#fde68a" strokeWidth="1.2" />
          <circle r={radius * 0.26} fill="#fcd34d" opacity="0.85" />
        </g>
      )}

      <circle r={radius} fill="none" stroke="#0f172a" strokeWidth="0.8" opacity="0.55" />
      <circle r={radius - 0.8} fill="none" stroke="#ffffff" strokeWidth="0.5" opacity="0.14" />
    </>
  );
};

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

  const getPlayerColorHex = (claimedBy: string | null) => {
    if (!claimedBy) return '#475569';
    const player = gameState.players.find((p) => p.id === claimedBy);
    return player ? PLAYER_COLORS[player.color] : '#475569';
  };

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

  const visibleNodes = useMemo(() => gameState.nodes.filter(isNodeVisible), [gameState.nodes, fogOfWarEnabled, myPlayerId, selectedNode, selectedShip]);

  return (
    <div className="relative h-full w-full overflow-hidden border border-slate-900 bg-slate-950 touch-none">
      <GalaxyBackdrop panX={panX} panY={panY} />

      <svg className="relative z-[1] h-full w-full cursor-grab select-none active:cursor-grabbing" {...handlers}>
        <g transform={`translate(${panX}, ${panY}) scale(${scale})`}>
          {/* Controlled space overlay */}
          {visibleNodes.map((node) => {
            if (!node.claimedBy) return null;
            const color = getPlayerColorHex(node.claimedBy);
            return (
              <g key={`territory-${node.id}`} pointerEvents="none">
                <circle cx={node.x} cy={node.y} r={96} fill={color} opacity="0.045" />
                <circle cx={node.x} cy={node.y} r={62} fill={color} opacity="0.028" />
              </g>
            );
          })}

          {/* Grid rings retained from original map style */}
          {Array.from({ length: ringsCount }).map((_, idx) => {
            const radius = ((idx + 1) / ringsCount) * maxRadius;
            return (
              <circle
                key={`grid-ring-${idx}`}
                cx={centerX}
                cy={centerY}
                r={radius}
                fill="none"
                stroke="#1e293b"
                strokeWidth="1"
                strokeDasharray="4 8"
                opacity="0.18"
                pointerEvents="none"
              />
            );
          })}

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
                <g key={`link-${node.id}-${linkId}`} pointerEvents="none">
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={isSelectedPath ? '#facc15' : '#1d4f91'}
                    strokeWidth={isSelectedPath ? 2.2 : 1.6}
                    opacity={isSelectedPath ? 0.76 : 0.5}
                  />
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={isSelectedPath ? '#fde68a' : '#67e8f9'}
                    strokeWidth={isSelectedPath ? 1.1 : 0.8}
                    strokeDasharray={isSelectedPath ? '4 12' : '3 18'}
                    opacity={isSelectedPath ? 0.9 : 0.55}
                  >
                    <animate attributeName="stroke-dashoffset" from="18" to="0" dur={isSelectedPath ? '1.4s' : '2.6s'} repeatCount="indefinite" />
                  </line>
                </g>
              );
            })
          )}

          {/* Star systems */}
          {gameState.nodes.map((node) => {
            const visible = isNodeVisible(node);
            const isSelected = selectedNode?.id === node.id;
            const isReachable = reachableNodes[node.id] !== undefined;
            const nodeColor = getPlayerColorHex(node.claimedBy);
            const planetR = node.isDysonSphere ? 20 : 17;

            if (!visible) {
              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <circle r="15" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
                  <text y="3" textAnchor="middle" fill="#334155" fontSize="8" fontFamily="monospace">?</text>
                </g>
              );
            }

            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`} className="group cursor-pointer" onClick={() => handleNodeClick(node)}>
                {isReachable && (
                  <circle r={planetR + 14} fill="none" stroke="#facc15" strokeWidth="1.8" strokeDasharray="5 5" opacity="0.78">
                    <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 0 0" to="360 0 0" dur="10s" repeatCount="indefinite" />
                  </circle>
                )}

                {isSelected && (
                  <g pointerEvents="none">
                    <circle r={planetR + 9} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="8 6" opacity="0.9">
                      <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 0 0" to="360 0 0" dur="7s" repeatCount="indefinite" />
                    </circle>
                    <circle r={planetR + 13} fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 9" opacity="0.4">
                      <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="360 0 0" to="0 0 0" dur="12s" repeatCount="indefinite" />
                    </circle>
                  </g>
                )}

                {node.hasGateway && (
                  <circle r={planetR + 8} fill="none" stroke="#8b5cf6" strokeWidth="1.2" strokeDasharray="7 5" opacity="0.85">
                    <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 0 0" to="360 0 0" dur="16s" repeatCount="indefinite" />
                  </circle>
                )}
                {node.hasShipyard && <circle r={planetR + 5} fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 3" opacity="0.85" />}
                {node.hasFtlInhibitor && <circle r={planetR + 6} fill="none" stroke="#ef4444" strokeWidth="1.2" opacity="0.75" />}

                <g className="transition-transform duration-200 ease-out group-hover:scale-105" style={{ transformOrigin: 'center', transformBox: 'fill-box' }}>
                  <PlanetBody node={node} radius={planetR} isSelected={isSelected} claimedColor={node.claimedBy ? nodeColor : null} />
                </g>

                <OrbitShips ships={node.ships} playerColors={PLAYER_COLORS} players={gameState.players} planetRadius={planetR} />

                {node.groundUnits.length > 0 && (() => {
                  const groups: { owner: string; count: number }[] = [];
                  node.groundUnits.forEach((unit) => {
                    const existing = groups.find((g) => g.owner === unit.owner);
                    if (existing) existing.count += 1;
                    else groups.push({ owner: unit.owner, count: 1 });
                  });
                  const shadeMap: Record<string, string> = {
                    green: '#34d399',
                    blue: '#60a5fa',
                    purple: '#a78bfa',
                    yellow: '#fbbf24',
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

                <text
                  y={planetR + 18}
                  textAnchor="middle"
                  fill={isSelected ? '#7dd3fc' : isReachable ? '#fde68a' : '#cbd5e1'}
                  fontSize="11"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  fontFamily="monospace"
                  className="pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-4 right-4 z-10 flex flex-col space-y-2">
        <button
          onClick={() => {
            audio.playBeep();
            reset();
          }}
          className="rounded border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white"
        >
          Recenter Map
        </button>
      </div>

      <div className="pointer-events-none absolute left-4 top-4 z-10 hidden space-y-1 rounded border border-slate-800/60 bg-slate-900/80 px-2.5 py-1.5 font-mono text-[9px] text-slate-400 md:block">
        <div className="flex items-center space-x-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-600" />
          <span>Neutral System</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_4px_#10b981]" />
          <span>Friendly Territory</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-cyan-500 border-dashed" />
          <span>Shipyard</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-purple-500 border-dashed" />
          <span>Gateway (Instant Jump)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-red-500" />
          <span>FTL Inhibitor</span>
        </div>
        <div className="mt-1 space-y-0.5 border-t border-slate-800 pt-1">
          <div className="flex items-center space-x-1.5">
            <svg width="10" height="10" viewBox="-5 -5 10 10"><path d="M0 -4 L2 2 L0 1 L-2 2 Z" fill="#94a3b8" /></svg>
            <span>Destroyer</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <svg width="10" height="10" viewBox="-6 -6 12 12"><path d="M0 -5 L3 3 L1 1 L-1 1 L-3 3 Z" fill="#94a3b8" /></svg>
            <span>BattleShip</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <svg width="10" height="10" viewBox="-6 -6 12 12"><path d="M-4 2 L-3 -1 L0 -5 L3 -1 L4 2 Z" fill="#94a3b8" /></svg>
            <span>Carrier</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <svg width="10" height="10" viewBox="-5 -5 10 10"><ellipse rx="3" ry="2.2" fill="#94a3b8" /></svg>
            <span>Colony Ship</span>
          </div>
        </div>
      </div>
    </div>
  );
};
