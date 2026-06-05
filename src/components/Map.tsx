import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, StarNode, Ship, PlanetDevelopment } from '../types';
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

type PlanetBiome = 'ice' | 'lava' | 'jungle' | 'ocean' | 'desert' | 'gas' | 'dead';

type PlanetVisual = {
  biome: PlanetBiome;
  gradient: [string, string, string];
  accent: string;
  shadow: string;
};

const PLANET_VISUALS: Record<PlanetBiome, PlanetVisual> = {
  ice: {
    biome: 'ice',
    gradient: ['#f8fafc', '#a5f3fc', '#1e3a8a'],
    accent: '#dff7ff',
    shadow: 'rgba(125, 211, 252, 0.35)',
  },
  lava: {
    biome: 'lava',
    gradient: ['#fed7aa', '#f97316', '#450a0a'],
    accent: '#ef4444',
    shadow: 'rgba(249, 115, 22, 0.35)',
  },
  jungle: {
    biome: 'jungle',
    gradient: ['#bbf7d0', '#15803d', '#052e16'],
    accent: '#86efac',
    shadow: 'rgba(34, 197, 94, 0.32)',
  },
  ocean: {
    biome: 'ocean',
    gradient: ['#e0f2fe', '#0284c7', '#0f172a'],
    accent: '#f8fafc',
    shadow: 'rgba(14, 165, 233, 0.32)',
  },
  desert: {
    biome: 'desert',
    gradient: ['#fde68a', '#d97706', '#78350f'],
    accent: '#fed7aa',
    shadow: 'rgba(217, 119, 6, 0.32)',
  },
  gas: {
    biome: 'gas',
    gradient: ['#fce7f3', '#93c5fd', '#4c1d95'],
    accent: '#f0abfc',
    shadow: 'rgba(192, 132, 252, 0.32)',
  },
  dead: {
    biome: 'dead',
    gradient: ['#cbd5e1', '#64748b', '#111827'],
    accent: '#94a3b8',
    shadow: 'rgba(148, 163, 184, 0.28)',
  },
};

const playerColors: Record<string, string> = {
  green: '#10b981',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  yellow: '#f59e0b',
};

const groundShadeMap: Record<string, string> = {
  green: '#34d399',
  blue: '#60a5fa',
  purple: '#a78bfa',
  yellow: '#fbbf24',
};

const developmentRadius: Record<PlanetDevelopment, number> = {
  none: 16,
  colony: 17,
  city: 18,
  metropolis: 19,
  arcology: 20,
  coreworld: 21,
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const getPlanetVisual = (node: StarNode): PlanetVisual => {
  if (node.isDysonSphere) return PLANET_VISUALS.gas;
  const biomes: PlanetBiome[] = ['ice', 'lava', 'jungle', 'ocean', 'desert', 'gas', 'dead'];
  return PLANET_VISUALS[biomes[hashString(`${node.id}-${node.name}`) % biomes.length]];
};

const getPlanetRadius = (node: StarNode) => {
  if (node.isDysonSphere) return 23;
  return developmentRadius[node.development] ?? 18;
};

// ─── Layered Canvas Galaxy Background ─────────────────────────────────────

const GalaxyBackground: React.FC<{ parallaxX: number; parallaxY: number }> = ({ parallaxX, parallaxY }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const staticCanvas = useRef<HTMLCanvasElement | null>(null);
  const parallaxCanvas = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const syncSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    };
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const deepStars = useMemo(() => {
    if (!size.width || !size.height) return [] as { x: number; y: number; r: number; o: number }[];
    const rand = mulberry32(0x5eeded + size.width * 13 + size.height * 17);
    return Array.from({ length: 400 }, () => ({
      x: rand() * size.width,
      y: rand() * size.height,
      r: 0.5 + rand(),
      o: 0.3 + rand() * 0.6,
    }));
  }, [size.width, size.height]);

  const nearStars = useMemo(() => {
    if (!size.width || !size.height) return [] as { x: number; y: number; r: number; o: number }[];
    const rand = mulberry32(0x9a1ac7 + size.width * 23 + size.height * 31);
    return Array.from({ length: 130 }, () => ({
      x: rand() * (size.width + 600) - 300,
      y: rand() * (size.height + 600) - 300,
      r: 0.7 + rand() * 1.8,
      o: 0.18 + rand() * 0.42,
    }));
  }, [size.width, size.height]);

  useEffect(() => {
    const canvas = staticCanvas.current;
    if (!canvas || !size.width || !size.height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, size.width, size.height);
    deepStars.forEach(star => {
      ctx.beginPath();
      ctx.globalAlpha = star.o;
      ctx.fillStyle = '#ffffff';
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }, [deepStars, size.width, size.height]);

  useEffect(() => {
    const canvas = parallaxCanvas.current;
    if (!canvas || !size.width || !size.height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const px = parallaxX * 0.3;
    const py = parallaxY * 0.3;

    const drawNebula = (x: number, y: number, radius: number, inner: string, outer: string) => {
      const grad = ctx.createRadialGradient(x + px, y + py, 0, x + px, y + py, radius);
      grad.addColorStop(0, inner);
      grad.addColorStop(0.45, outer);
      grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size.width, size.height);
    };

    ctx.globalCompositeOperation = 'screen';
    drawNebula(size.width * 0.25, size.height * 0.25, Math.max(size.width, size.height) * 0.7, 'rgba(99, 102, 241, 0.22)', 'rgba(37, 99, 235, 0.08)');
    drawNebula(size.width * 0.82, size.height * 0.62, Math.max(size.width, size.height) * 0.55, 'rgba(20, 184, 166, 0.18)', 'rgba(6, 182, 212, 0.06)');
    drawNebula(size.width * 0.48, size.height * 0.92, Math.max(size.width, size.height) * 0.5, 'rgba(168, 85, 247, 0.16)', 'rgba(76, 29, 149, 0.06)');

    ctx.globalCompositeOperation = 'source-over';
    nearStars.forEach(star => {
      const x = ((star.x + px * 0.85) % (size.width + 600)) - 300;
      const y = ((star.y + py * 0.85) % (size.height + 600)) - 300;
      ctx.beginPath();
      ctx.globalAlpha = star.o;
      ctx.fillStyle = '#dff7ff';
      ctx.arc(x, y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Low-opacity hex grid overlay.
    const hexR = 36;
    const hexH = Math.sqrt(3) * hexR;
    const offsetX = ((px * 0.2) % (hexR * 1.5)) - hexR * 1.5;
    const offsetY = ((py * 0.2) % hexH) - hexH;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.055)';
    ctx.lineWidth = 1;
    for (let y = offsetY; y < size.height + hexH; y += hexH) {
      for (let x = offsetX; x < size.width + hexR * 2; x += hexR * 3) {
        [0, hexR * 1.5].forEach((dx, row) => {
          const cx = x + dx;
          const cy = y + row * hexH / 2;
          ctx.beginPath();
          for (let i = 0; i < 6; i += 1) {
            const angle = Math.PI / 6 + i * Math.PI / 3;
            const hx = cx + Math.cos(angle) * hexR;
            const hy = cy + Math.sin(angle) * hexR;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        });
      }
    }
  }, [nearStars, parallaxX, parallaxY, size.width, size.height]);

  return (
    <div ref={wrapRef} className="galaxy-background" aria-hidden="true">
      <canvas ref={staticCanvas} className="galaxy-canvas galaxy-canvas-static" />
      <canvas ref={parallaxCanvas} className="galaxy-canvas galaxy-canvas-parallax" />
      <div className="galaxy-vignette" />
    </div>
  );
};

// ─── Ship SVG Silhouettes ──────────────────────────────────────────────────

const ShipIcon: React.FC<{ type: Ship['type']; color: string; size?: number }> = ({
  type,
  color,
  size = 10,
}) => {
  const s = size;
  const line = '#dbeafe';
  const dark = '#020617';
  const engine = '#67e8f9';

  switch (type) {
    case 'Destroyer':
      return (
        <g filter="url(#ship-soft-glow)" opacity="0.98">
          <path
            d={`M0 ${-s * 1.05} L${s * 0.38} ${-s * 0.2} L${s * 0.72} ${s * 0.52} L${s * 0.18} ${s * 0.2} L0 ${s * 0.68} L${-s * 0.18} ${s * 0.2} L${-s * 0.72} ${s * 0.52} L${-s * 0.38} ${-s * 0.2} Z`}
            fill={color}
            stroke={line}
            strokeWidth="0.45"
          />
          <path d={`M0 ${-s * 0.86} L0 ${s * 0.48}`} stroke={dark} strokeWidth="0.45" opacity="0.55" />
          <path d={`M${-s * 0.34} ${-s * 0.12} L${s * 0.34} ${-s * 0.12}`} stroke={line} strokeWidth="0.35" opacity="0.65" />
          <circle cx={-s * 0.18} cy={s * 0.42} r={s * 0.09} fill={engine} />
          <circle cx={s * 0.18} cy={s * 0.42} r={s * 0.09} fill={engine} />
        </g>
      );
    case 'BattleShip':
      return (
        <g filter="url(#ship-soft-glow)" opacity="0.98">
          <path
            d={`M0 ${-s * 1.15} L${s * 0.92} ${s * 0.42} L${s * 0.28} ${s * 0.26} L${s * 0.18} ${s * 0.74} L${-s * 0.18} ${s * 0.74} L${-s * 0.28} ${s * 0.26} L${-s * 0.92} ${s * 0.42} Z`}
            fill={color}
            stroke={line}
            strokeWidth="0.42"
          />
          <path d={`M${-s * 0.26} ${-s * 0.46} H${s * 0.26} L${s * 0.16} ${s * 0.18} H${-s * 0.16} Z`} fill={dark} opacity="0.34" />
          <rect x={-s * 0.08} y={-s * 0.68} width={s * 0.16} height={s * 0.76} rx="0.6" fill={line} opacity="0.38" />
          <circle cx={-s * 0.38} cy={s * 0.08} r={s * 0.08} fill={line} opacity="0.7" />
          <circle cx={s * 0.38} cy={s * 0.08} r={s * 0.08} fill={line} opacity="0.7" />
          <circle cx={-s * 0.12} cy={s * 0.58} r={s * 0.08} fill={engine} />
          <circle cx={s * 0.12} cy={s * 0.58} r={s * 0.08} fill={engine} />
        </g>
      );
    case 'Carrier':
      return (
        <g filter="url(#ship-soft-glow)" opacity="0.98">
          <path
            d={`M${-s * 0.72} ${-s * 0.62} L${s * 0.72} ${-s * 0.62} L${s * 0.62} ${s * 0.55} L${s * 0.2} ${s * 0.86} L${-s * 0.2} ${s * 0.86} L${-s * 0.62} ${s * 0.55} Z`}
            fill={color}
            stroke={line}
            strokeWidth="0.42"
          />
          <path d={`M0 ${-s * 0.88} L${s * 0.5} ${-s * 0.62} H${-s * 0.5} Z`} fill={color} stroke={line} strokeWidth="0.35" />
          <rect x={-s * 0.42} y={-s * 0.28} width={s * 0.84} height={s * 0.16} rx="0.5" fill={dark} opacity="0.42" />
          <rect x={-s * 0.1} y={-s * 0.52} width={s * 0.2} height={s * 0.98} rx="0.6" fill={line} opacity="0.28" />
          <circle cx={-s * 0.34} cy={s * 0.62} r={s * 0.09} fill={engine} />
          <circle cx={s * 0.34} cy={s * 0.62} r={s * 0.09} fill={engine} />
        </g>
      );
    case 'ColonyShip':
      return (
        <g filter="url(#ship-soft-glow)" opacity="0.96">
          <path d={`M0 ${-s * 0.82} L${s * 0.25} ${-s * 0.08} L${s * 0.16} ${s * 0.66} H${-s * 0.16} L${-s * 0.25} ${-s * 0.08} Z`} fill={color} stroke={line} strokeWidth="0.38" />
          <circle r={s * 0.38} fill="none" stroke={line} strokeWidth="0.45" opacity="0.7" />
          <circle r={s * 0.18} fill={dark} opacity="0.45" />
          <rect x={-s * 0.52} y={-s * 0.05} width={s * 0.28} height={s * 0.1} rx="0.2" fill={color} stroke={line} strokeWidth="0.22" />
          <rect x={s * 0.24} y={-s * 0.05} width={s * 0.28} height={s * 0.1} rx="0.2" fill={color} stroke={line} strokeWidth="0.22" />
          <circle cx="0" cy={s * 0.58} r={s * 0.08} fill={engine} />
        </g>
      );
    case 'Fighter':
      return (
        <g filter="url(#ship-soft-glow)" opacity="0.97">
          <path
            d={`M0 ${-s * 0.95} L${s * 0.28} ${s * 0.42} L${s * 0.1} ${s * 0.2} H${-s * 0.1} L${-s * 0.28} ${s * 0.42} Z`}
            fill={color}
            stroke={line}
            strokeWidth="0.32"
          />
          <path d={`M0 ${-s * 0.62} L0 ${s * 0.22}`} stroke={dark} strokeWidth="0.36" opacity="0.55" />
          <circle cx="0" cy={s * 0.38} r={s * 0.07} fill={engine} />
        </g>
      );
    default:
      return <circle r={s * 0.5} fill={color} />;
  }
};

// ─── Development / Planet Surface Renderers ───────────────────────────────

const DevelopmentIcon: React.FC<{ development: string }> = ({ development }) => {
  switch (development) {
    case 'colony':
      return (
        <g fill="none" stroke="#a3e635" strokeWidth="1.2" opacity="0.9">
          <path d="M-5,2 A5,5 0 0,1 5,2 Z" />
          <line x1="-6" y1="2" x2="6" y2="2" strokeWidth="1" />
          <line x1="0" y1="2" x2="0" y2="-4" strokeWidth="0.8" />
          <circle cx="0" cy="-4.5" r="0.8" fill="#a3e635" stroke="none" />
        </g>
      );
    case 'city':
      return (
        <g fill="#60a5fa" stroke="#60a5fa" strokeWidth="0.5" opacity="0.9">
          <rect x="-7" y="-1" width="4" height="5" rx="0.5" />
          <rect x="-6" y="-3" width="2" height="2" rx="0.3" />
          <rect x="-1.5" y="-5" width="3" height="9" rx="0.5" />
          <rect x="3" y="-2" width="4" height="6" rx="0.5" />
          <rect x="4" y="-4" width="2" height="2" rx="0.3" />
          <line x1="-8" y1="4" x2="8" y2="4" strokeWidth="0.8" stroke="#94a3b8" />
        </g>
      );
    case 'metropolis':
      return (
        <g fill="#c084fc" stroke="#c084fc" strokeWidth="0.4" opacity="0.92">
          <rect x="-9" y="0" width="3" height="6" rx="0.4" />
          <rect x="-6" y="-3" width="3.5" height="9" rx="0.4" />
          <rect x="-2" y="-7" width="4" height="13" rx="0.5" />
          <polygon points="-2,-7 0,-10 2,-7" fill="#e879f9" />
          <rect x="2.5" y="-4" width="3.5" height="10" rx="0.4" />
          <rect x="6" y="-1" width="3" height="7" rx="0.4" />
          <circle cx="0" cy="-4" r="0.6" fill="#fff" opacity="0.55" />
          <circle cx="0" cy="-1" r="0.6" fill="#fff" opacity="0.55" />
          <circle cx="0" cy="2" r="0.6" fill="#fff" opacity="0.55" />
          <line x1="-10" y1="6" x2="10" y2="6" strokeWidth="0.8" stroke="#94a3b8" />
        </g>
      );
    case 'arcology':
      return (
        <g fill="#22d3ee" stroke="#67e8f9" strokeWidth="0.5" opacity="0.96">
          <circle r="8" fill="none" strokeWidth="1.2" />
          <rect x="-5" y="-4" width="3" height="9" rx="0.5" />
          <rect x="-1.5" y="-7" width="3" height="12" rx="0.5" />
          <rect x="2" y="-4" width="3" height="9" rx="0.5" />
          <circle cx="0" cy="-1" r="1" fill="#fff" opacity="0.55" />
        </g>
      );
    case 'coreworld':
      return (
        <g fill="#facc15" stroke="#fde68a" strokeWidth="0.5" opacity="0.98">
          <circle r="9" fill="none" strokeWidth="1.4" />
          <path d="M0,-9 L2,-2 L8,-2 L3,1 L5,8 L0,4 L-5,8 L-3,1 L-8,-2 L-2,-2 Z" />
          <circle r="2" fill="#fff" opacity="0.65" />
        </g>
      );
    default:
      return null;
  }
};

const PlanetSurface: React.FC<{ node: StarNode; radius: number; gradientId: string; clipId: string; visual: PlanetVisual }> = ({
  node,
  radius,
  gradientId,
  clipId,
  visual,
}) => {
  const seed = hashString(node.id);
  const offset = (seed % 17) - 8;

  if (node.isDysonSphere) {
    return (
      <g>
        <circle r={radius} fill="url(#dyson-gradient)" stroke="#fde68a" strokeWidth="2" filter="url(#dyson-glow)" />
        <circle r={radius * 0.44} fill="#fff7ed" opacity="0.95"  />
        <circle r={radius * 0.72} fill="none" stroke="#facc15" strokeWidth="1" strokeDasharray="7 4"  />
        <circle r={radius * 0.96} fill="none" stroke="#fb923c" strokeWidth="1" strokeDasharray="2 6"  />
      </g>
    );
  }

  const surface = (() => {
    switch (visual.biome) {
      case 'ice':
        return (
          <g clipPath={`url(#${clipId})`} opacity="0.72">
            <path d={`M${-radius},${-radius * 0.2 + offset / 3} C${-radius * 0.25},${-radius * 0.52} ${radius * 0.2},${radius * 0.15} ${radius},${-radius * 0.22}`} fill="none" stroke="#ecfeff" strokeWidth="2.2" />
            <path d={`M${-radius},${radius * 0.3} C${-radius * 0.2},${radius * 0.05} ${radius * 0.32},${radius * 0.55} ${radius},${radius * 0.15}`} fill="none" stroke="#bae6fd" strokeWidth="1.5" />
            <circle cx={-radius * 0.35} cy={-radius * 0.35} r={radius * 0.16} fill="#f8fafc" opacity="0.5" />
          </g>
        );
      case 'lava':
        return (
          <g clipPath={`url(#${clipId})`} opacity="0.86">
            <path d={`M${-radius * 0.8},${-radius * 0.2} L${-radius * 0.2},${radius * 0.05} L${radius * 0.05},${-radius * 0.28} L${radius * 0.55},${radius * 0.18}`} fill="none" stroke="#fef3c7" strokeWidth="1.4" />
            <path d={`M${-radius * 0.45},${radius * 0.55} L${-radius * 0.1},${radius * 0.16} L${radius * 0.35},${radius * 0.42}`} fill="none" stroke="#ef4444" strokeWidth="2" />
            <circle cx={radius * 0.36} cy={-radius * 0.42} r={radius * 0.12} fill="#f97316" opacity="0.65" />
          </g>
        );
      case 'jungle':
        return (
          <g clipPath={`url(#${clipId})`} opacity="0.78">
            <path d={`M${-radius},${-radius * 0.08} C${-radius * 0.4},${-radius * 0.3} ${radius * 0.3},${radius * 0.1} ${radius},${-radius * 0.18}`} fill="none" stroke="#dcfce7" strokeWidth="1.3" opacity="0.65" />
            <path d={`M${-radius * 0.75},${radius * 0.34} C${-radius * 0.2},${radius * 0.05} ${radius * 0.35},${radius * 0.7} ${radius},${radius * 0.2}`} fill="none" stroke="#16a34a" strokeWidth="3.2" opacity="0.7" />
            <ellipse cx={-radius * 0.2} cy={-radius * 0.34} rx={radius * 0.36} ry={radius * 0.14} fill="#22c55e" opacity="0.35" />
          </g>
        );
      case 'ocean':
        return (
          <g clipPath={`url(#${clipId})`} opacity="0.78">
            <path d={`M${-radius},${-radius * 0.28} C${-radius * 0.25},${-radius * 0.5} ${radius * 0.1},${radius * 0.05} ${radius},${-radius * 0.12}`} fill="none" stroke="#f8fafc" strokeWidth="1.7" />
            <path d={`M${-radius * 0.85},${radius * 0.22} C${-radius * 0.1},${-radius * 0.05} ${radius * 0.28},${radius * 0.5} ${radius},${radius * 0.25}`} fill="none" stroke="#bae6fd" strokeWidth="1.4" opacity="0.75" />
            <ellipse cx={radius * 0.1} cy={-radius * 0.26} rx={radius * 0.26} ry={radius * 0.09} fill="#ecfeff" opacity="0.45" />
          </g>
        );
      case 'desert':
        return (
          <g clipPath={`url(#${clipId})`} opacity="0.8">
            <path d={`M${-radius},${-radius * 0.1} C${-radius * 0.2},${-radius * 0.36} ${radius * 0.2},${radius * 0.16} ${radius},${-radius * 0.08}`} fill="none" stroke="#ffedd5" strokeWidth="1.4" />
            <path d={`M${-radius},${radius * 0.34} C${-radius * 0.3},${radius * 0.08} ${radius * 0.2},${radius * 0.56} ${radius},${radius * 0.26}`} fill="none" stroke="#fdba74" strokeWidth="2" opacity="0.75" />
            <circle cx={-radius * 0.45} cy={-radius * 0.38} r={radius * 0.14} fill="#fcd34d" opacity="0.45" />
          </g>
        );
      case 'gas':
        return (
          <g clipPath={`url(#${clipId})`} opacity="0.88">
            {[-0.45, -0.18, 0.1, 0.34].map((y, idx) => (
              <rect key={idx} x={-radius} y={radius * y} width={radius * 2} height={radius * 0.12} fill={idx % 2 === 0 ? '#f5d0fe' : '#bfdbfe'} opacity={0.4 + idx * 0.09} />
            ))}
            <ellipse cx={radius * 0.28} cy={radius * 0.18} rx={radius * 0.25} ry={radius * 0.09} fill="#fde68a" opacity="0.5" />
          </g>
        );
      case 'dead':
      default:
        return (
          <g clipPath={`url(#${clipId})`} opacity="0.7">
            <circle cx={-radius * 0.38} cy={-radius * 0.2} r={radius * 0.13} fill="#0f172a" opacity="0.35" />
            <circle cx={radius * 0.25} cy={radius * 0.12} r={radius * 0.18} fill="#0f172a" opacity="0.25" />
            <circle cx={-radius * 0.08} cy={radius * 0.45} r={radius * 0.1} fill="#e2e8f0" opacity="0.18" />
          </g>
        );
    }
  })();

  return (
    <g>
      <circle r={radius} fill={`url(#${gradientId})`} stroke="rgba(226, 232, 240, 0.28)" strokeWidth="1.1" />
      {surface}
      <circle r={radius} fill={`url(#${gradientId}-shade)`} opacity="0.85" pointerEvents="none" />
    </g>
  );
};

interface OrbitShipsProps {
  ships: Ship[];
  players: GameState['players'];
  planetRadius: number;
}

const OrbitShips: React.FC<OrbitShipsProps> = ({ ships, players, planetRadius }) => {
  if (ships.length === 0) return null;

  const groups: { type: Ship['type']; owner: string; count: number }[] = [];
  ships.forEach((ship) => {
    const existing = groups.find((g) => g.type === ship.type && g.owner === ship.owner);
    if (existing) existing.count += 1;
    else groups.push({ type: ship.type, owner: ship.owner, count: 1 });
  });

  const display = groups.slice(0, 8);
  const orbitRadius = planetRadius + 14;
  const angleStep = (2 * Math.PI) / Math.max(display.length, 1);

  return (
    <>
      <circle r={orbitRadius} fill="none" stroke="rgba(148, 163, 184, 0.14)" strokeDasharray="2 7" strokeWidth="1" pointerEvents="none" />
      <g pointerEvents="none">
        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="5s" repeatCount="indefinite" />
      {display.map((group, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const cx = Math.cos(angle) * orbitRadius;
        const cy = Math.sin(angle) * orbitRadius;
        const player = players.find((p) => p.id === group.owner);
        const color = player ? playerColors[player.color] : '#94a3b8';
        return (
          <g key={`${group.type}-${group.owner}-${i}`} transform={`translate(${cx}, ${cy})`} pointerEvents="none">
            <circle r="7.5" fill="rgba(2, 6, 23, 0.78)" stroke={color} strokeWidth="0.55" opacity="0.82" />
            <ShipIcon type={group.type} color={color} size={5.8} />
            {group.count > 1 && (
              <>
                <circle cx="5" cy="-5" r="3.4" fill="#020617" stroke={color} strokeWidth="0.8" />
                <text x="5" y="-2.7" textAnchor="middle" fill={color} fontSize="4.2" fontWeight="bold" fontFamily="Orbitron, monospace">
                  {group.count}
                </text>
              </>
            )}
          </g>
        );
      })}
      </g>
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
  const { panX, panY, scale, parallaxX, parallaxY, handlers, reset, svgRef } = usePanZoom(0.3, 2.5, 50, 50, 0.7, 500, 500);

  const getPlayerColorHex = (claimedBy: string | null) => {
    if (!claimedBy) return '#475569';
    const player = gameState.players.find((p) => p.id === claimedBy);
    return player ? playerColors[player.color] : '#475569';
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

  const gradientDefs = gameState.nodes.map((node) => {
    const visual = getPlanetVisual(node);
    const safeId = node.id.replace(/[^a-zA-Z0-9_-]/g, '');
    return (
      <React.Fragment key={`defs-${node.id}`}>
        <radialGradient id={`planet-${safeId}`} cx="34%" cy="27%" r="78%">
          <stop offset="0%" stopColor={visual.gradient[0]} />
          <stop offset="48%" stopColor={visual.gradient[1]} />
          <stop offset="100%" stopColor={visual.gradient[2]} />
        </radialGradient>
        <radialGradient id={`planet-${safeId}-shade`} cx="32%" cy="24%" r="76%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.24)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(2,6,23,0.72)" />
        </radialGradient>
        <clipPath id={`clip-${safeId}`}>
          <circle r={getPlanetRadius(node)} />
        </clipPath>
      </React.Fragment>
    );
  });

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden touch-none border border-cyan-950/60 bg-slate-950 map-shell">
      <GalaxyBackground parallaxX={parallaxX} parallaxY={parallaxY} />
      <svg ref={svgRef} className="relative z-[1] w-full h-full cursor-grab active:cursor-grabbing select-none map-svg" {...handlers}>
        <defs>
          <linearGradient id="lane-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0e7490" stopOpacity="0.18" />
            <stop offset="45%" stopColor="#22d3ee" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.32" />
          </linearGradient>
          <linearGradient id="lane-hot-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#facc15" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id="dyson-gradient" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#fff7ed" />
            <stop offset="42%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#7c2d12" />
          </radialGradient>
          <filter id="lane-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ship-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="planet-shadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#020617" floodOpacity="0.72" />
          </filter>
          <filter id="dyson-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="reticle-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {gradientDefs}
        </defs>

        <g transform={`translate(${panX}, ${panY}) scale(${scale})`}>
          {/* Tactical grid rings */}
          {Array.from({ length: ringsCount }).map((_, idx) => {
            const radius = ((idx + 1) / ringsCount) * maxRadius;
            return (
              <circle
                key={`grid-ring-${idx}`}
                cx={centerX}
                cy={centerY}
                r={radius}
                fill="none"
                stroke="#22d3ee"
                strokeWidth="0.8"
                strokeDasharray="3 10"
                opacity="0.1"
                pointerEvents="none"
              />
            );
          })}

          <line
            x1={centerX}
            y1={centerY}
            x2={centerX + maxRadius}
            y2={centerY}
            stroke="#22d3ee"
            strokeWidth="1.2"
            opacity="0.14"
            pointerEvents="none"
            className="origin-[500px_500px]"
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
              const gradient = isSelectedPath ? 'url(#lane-hot-gradient)' : 'url(#lane-gradient)';
              return (
                <g key={`link-${node.id}-${linkId}`} pointerEvents="none">
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={gradient}
                    strokeWidth={isSelectedPath ? 3 : 1.5}
                    opacity={isSelectedPath ? 0.9 : 0.72}
                    filter="url(#lane-glow)"
                    strokeLinecap="round"
                  />
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={isSelectedPath ? '#fde68a' : '#67e8f9'}
                    strokeWidth={isSelectedPath ? 1.25 : 0.8}
                    strokeDasharray="8 34"
                    opacity={isSelectedPath ? 0.92 : 0.5}
                    strokeLinecap="round"
                    
                  />
                </g>
              );
            })
          )}

          {/* Star System Nodes */}
          {gameState.nodes.map((node) => {
            const visible = isNodeVisible(node);
            const isSelected = selectedNode?.id === node.id;
            const isReachable = reachableNodes[node.id] !== undefined;
            const nodeColor = getPlayerColorHex(node.claimedBy);
            const planetR = getPlanetRadius(node);
            const visual = getPlanetVisual(node);
            const safeId = node.id.replace(/[^a-zA-Z0-9_-]/g, '');

            if (!visible) {
              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <circle r="17" fill="rgba(15,23,42,0.85)" stroke="rgba(34,211,238,0.12)" strokeWidth="1" />
                  <text y="3" textAnchor="middle" fill="#334155" fontSize="8" fontFamily="Orbitron, monospace">?</text>
                </g>
              );
            }

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer group star-system-node"
                onClick={() => handleNodeClick(node)}
              >
                <ellipse
                  cx="0"
                  cy={planetR * 0.72}
                  rx={planetR * 1.05}
                  ry={planetR * 0.26}
                  fill={visual.shadow}
                  opacity="0.58"
                  filter="url(#planet-shadow)"
                  pointerEvents="none"
                />

                {node.claimedBy && (
                  <>
                    <circle r={planetR + 8} fill="none" stroke={nodeColor} strokeWidth="1.4" opacity="0.68" filter="url(#reticle-glow)" />
                    <circle r={planetR + 13} fill="none" stroke={nodeColor} strokeWidth="0.9" strokeDasharray="5 8" opacity="0.35" />
                  </>
                )}

                {isReachable && (
                  <circle
                    r={planetR + 18}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="2"
                    strokeDasharray="4 6"
                    filter="url(#reticle-glow)"
                  />
                )}

                {isSelected && (
                  <g className="targeting-reticle" pointerEvents="none" filter="url(#reticle-glow)">
                    <circle r={planetR + 24} fill="none" stroke="#f43f5e" strokeWidth="1.7" strokeDasharray="10 7" />
                    <circle r={planetR + 9} fill="none" stroke="#fda4af" strokeWidth="0.9" opacity="0.72" />
                    <line x1={-(planetR + 31)} y1="0" x2={-(planetR + 12)} y2="0" stroke="#fb7185" strokeWidth="1.4" />
                    <line x1={planetR + 12} y1="0" x2={planetR + 31} y2="0" stroke="#fb7185" strokeWidth="1.4" />
                    <line x1="0" y1={-(planetR + 31)} x2="0" y2={-(planetR + 12)} stroke="#fb7185" strokeWidth="1.4" />
                    <line x1="0" y1={planetR + 12} x2="0" y2={planetR + 31} stroke="#fb7185" strokeWidth="1.4" />
                  </g>
                )}

                {node.hasGateway && (
                  <circle r={planetR + 17} fill="none" stroke="#a78bfa" strokeWidth="1.4" strokeDasharray="10 5" />
                )}
                {node.hasShipyard && (
                  <circle r={planetR + 12} fill="none" stroke="#22d3ee" strokeWidth="1.4" strokeDasharray="2 4" opacity="0.9" />
                )}
                {node.hasFtlInhibitor && (
                  <circle r={planetR + 15} fill="none" stroke="#ef4444" strokeWidth="1.4" opacity="0.92" filter="url(#reticle-glow)" />
                )}

                <g className="planet-sphere" filter="url(#planet-shadow)">
                  <PlanetSurface node={node} radius={planetR} gradientId={`planet-${safeId}`} clipId={`clip-${safeId}`} visual={visual} />
                </g>

                {!node.isDysonSphere && node.development !== 'none' && (
                  <g transform={`translate(0, ${Math.max(2, planetR * 0.08)}) scale(${Math.min(1.5, planetR / 24)})`} pointerEvents="none">
                    <DevelopmentIcon development={node.development} />
                  </g>
                )}

                <OrbitShips ships={node.ships} players={gameState.players} planetRadius={planetR} />

                {node.groundUnits.length > 0 && (() => {
                  const groups: { owner: string; count: number }[] = [];
                  node.groundUnits.forEach((unit) => {
                    const existing = groups.find((g) => g.owner === unit.owner);
                    if (existing) existing.count += 1;
                    else groups.push({ owner: unit.owner, count: 1 });
                  });
                  return (
                    <g transform={`translate(${-((groups.length - 1) * 8)}, ${planetR + 12})`} pointerEvents="none">
                      {groups.map((group, idx) => {
                        const player = gameState.players.find((p) => p.id === group.owner);
                        const color = group.owner === 'npc' ? '#94a3b8' : groundShadeMap[player?.color || 'green'];
                        return (
                          <g key={`${node.id}-ground-${group.owner}`} transform={`translate(${idx * 16}, 0)`}>
                            <rect x="-5.5" y="-5.5" width="11" height="11" fill={color} stroke="#020617" strokeWidth="1" rx="2" opacity="0.97" filter="url(#ship-soft-glow)" />
                            {group.count > 1 && (
                              <text x="0" y="3" textAnchor="middle" fill="#020617" fontSize="6.3" fontWeight="bold" fontFamily="Orbitron, monospace">
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
                  y={planetR + 31}
                  textAnchor="middle"
                  fill={isSelected ? '#fda4af' : isReachable ? '#fde68a' : '#cbd5e1'}
                  fontSize="11"
                  fontWeight={isSelected ? '800' : '600'}
                  fontFamily="Orbitron, monospace"
                  letterSpacing="0.08em"
                  className="pointer-events-none system-name-label"
                >
                  {node.name.toUpperCase()}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-4 bottom-4 flex flex-col space-y-2 z-10">
        <button
          onClick={() => { audio.playBeep(); reset(); }}
          className="holo-panel px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200 rounded hover:text-white"
        >
          Recenter Map
        </button>
      </div>

      <div className="absolute left-4 top-4 holo-panel rounded px-3 py-2 text-[9px] font-mono text-slate-300 space-y-1.5 z-10 pointer-events-none hidden md:block">
        <div className="text-[8px] uppercase tracking-[0.24em] text-cyan-300 border-b border-cyan-500/20 pb-1 mb-1">Tactical Overlay</div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-slate-600" />
          <span>Neutral System</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_4px_#10b981]" />
          <span>Empire Halo</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2.5 h-2.5 border border-cyan-500 border-dashed rounded-full" />
          <span>Shipyard</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2.5 h-2.5 border border-purple-500 border-dashed rounded-full" />
          <span>Gateway</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="inline-block w-2.5 h-2.5 border border-red-500 rounded-full" />
          <span>FTL Inhibitor</span>
        </div>
      </div>
    </div>
  );
};
