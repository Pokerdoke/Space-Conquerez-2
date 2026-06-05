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
    return Array.from({ length: 280 }, () => ({
      x: rand() * size.width,
      y: rand() * size.height,
      r: 0.5 + rand(),
      o: 0.3 + rand() * 0.6,
    }));
  }, [size.width, size.height]);

  const nearStars = useMemo(() => {
    if (!size.width || !size.height) return [] as { x: number; y: number; r: number; o: number }[];
    const rand = mulberry32(0x9a1ac7 + size.width * 23 + size.height * 31);
    return Array.from({ length: 80 }, () => ({
      x: rand() * (size.width + 600) - 300,
      y: rand() * (size.height + 600) - 300,
      r: 0.7 + rand() * 1.8,
      o: 0.18 + rand() * 0.42,
    }));
  }, [size.width, size.height]);

  useEffect(() => {
    const canvas = staticCanvas.current;
    if (!canvas || !size.width || !size.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const overdraw = 480;
    const drawWidth = size.width + overdraw * 2;
    const drawHeight = size.height + overdraw * 2;
    canvas.width = Math.floor(drawWidth * dpr);
    canvas.height = Math.floor(drawHeight * dpr);
    canvas.style.width = `${drawWidth}px`;
    canvas.style.height = `${drawHeight}px`;
    canvas.style.left = `${-overdraw}px`;
    canvas.style.top = `${-overdraw}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawWidth, drawHeight);

    // The parallax layer is drawn once and then moved with CSS transforms.
    // This avoids repainting nebulae/stars every mouse-move, which was the main FPS hit on desktop Chrome.
    const drawNebula = (x: number, y: number, radius: number, inner: string, outer: string) => {
      const cx = x + overdraw;
      const cy = y + overdraw;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, inner);
      grad.addColorStop(0.45, outer);
      grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, drawWidth, drawHeight);
    };

    ctx.globalCompositeOperation = 'screen';
    drawNebula(size.width * 0.25, size.height * 0.25, Math.max(size.width, size.height) * 0.7, 'rgba(99, 102, 241, 0.22)', 'rgba(37, 99, 235, 0.08)');
    drawNebula(size.width * 0.82, size.height * 0.62, Math.max(size.width, size.height) * 0.55, 'rgba(20, 184, 166, 0.18)', 'rgba(6, 182, 212, 0.06)');
    drawNebula(size.width * 0.48, size.height * 0.92, Math.max(size.width, size.height) * 0.5, 'rgba(168, 85, 247, 0.16)', 'rgba(76, 29, 149, 0.06)');

    ctx.globalCompositeOperation = 'source-over';
    nearStars.forEach(star => {
      const x = star.x + overdraw;
      const y = star.y + overdraw;
      ctx.beginPath();
      ctx.globalAlpha = star.o;
      ctx.fillStyle = '#dff7ff';
      ctx.arc(x, y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Low-opacity hex grid overlay, also cached in the parallax canvas.
    const hexR = 36;
    const hexH = Math.sqrt(3) * hexR;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.052)';
    ctx.lineWidth = 1;
    for (let y = -hexH; y < drawHeight + hexH; y += hexH) {
      for (let x = -hexR * 3; x < drawWidth + hexR * 3; x += hexR * 3) {
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
  }, [nearStars, size.width, size.height]);

  const parallaxShiftX = ((parallaxX * 0.18) % 480);
  const parallaxShiftY = ((parallaxY * 0.18) % 480);

  return (
    <div ref={wrapRef} className="galaxy-background" aria-hidden="true">
      <canvas ref={staticCanvas} className="galaxy-canvas galaxy-canvas-static" />
      <canvas
        ref={parallaxCanvas}
        className="galaxy-canvas galaxy-canvas-parallax"
        style={{ transform: `translate3d(${parallaxShiftX}px, ${parallaxShiftY}px, 0)` }}
      />
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
  const panel = '#dbeafe';
  const shadow = 'rgba(2, 6, 23, 0.65)';

  switch (type) {
    case 'Destroyer':
      return (
        <g opacity="0.98">
          <path d={`M0,${-s * 1.12} L${s * 0.42},${s * 0.16} L${s * 0.25},${s * 0.72} L0,${s * 0.42} L${-s * 0.25},${s * 0.72} L${-s * 0.42},${s * 0.16} Z`} fill={shadow} transform="translate(0 0.6)" />
          <path d={`M0,${-s * 1.12} L${s * 0.42},${s * 0.16} L${s * 0.25},${s * 0.72} L0,${s * 0.42} L${-s * 0.25},${s * 0.72} L${-s * 0.42},${s * 0.16} Z`} fill={color} stroke={panel} strokeWidth="0.32" />
          <path d={`M0,${-s * 0.78} L${s * 0.12},${s * 0.08} L0,${s * 0.22} L${-s * 0.12},${s * 0.08} Z`} fill={panel} opacity="0.42" />
          <line x1={-s * 0.24} y1={s * 0.18} x2={s * 0.24} y2={s * 0.18} stroke="#020617" strokeWidth="0.28" opacity="0.65" />
        </g>
      );
    case 'BattleShip':
      return (
        <g opacity="0.98">
          <path d={`M0,${-s * 1.18} L${s * 0.7},${s * 0.55} L${s * 0.24},${s * 0.28} L${s * 0.1},${s * 0.82} L${-s * 0.1},${s * 0.82} L${-s * 0.24},${s * 0.28} L${-s * 0.7},${s * 0.55} Z`} fill={shadow} transform="translate(0 0.8)" />
          <path d={`M0,${-s * 1.18} L${s * 0.7},${s * 0.55} L${s * 0.24},${s * 0.28} L${s * 0.1},${s * 0.82} L${-s * 0.1},${s * 0.82} L${-s * 0.24},${s * 0.28} L${-s * 0.7},${s * 0.55} Z`} fill={color} stroke={panel} strokeWidth="0.34" />
          <rect x={-s * 0.12} y={-s * 0.75} width={s * 0.24} height={s * 0.9} rx="0.8" fill={panel} opacity="0.34" />
          <line x1={-s * 0.42} y1={s * 0.28} x2={s * 0.42} y2={s * 0.28} stroke="#020617" strokeWidth="0.32" opacity="0.6" />
          <circle cx={0} cy={-s * 0.28} r={s * 0.08} fill="#ffffff" opacity="0.55" />
        </g>
      );
    case 'Carrier':
      return (
        <g opacity="0.98">
          <path d={`M${-s * 0.72},${-s * 0.36} L0,${-s * 0.82} L${s * 0.72},${-s * 0.36} L${s * 0.52},${s * 0.62} L${-s * 0.52},${s * 0.62} Z`} fill={shadow} transform="translate(0 0.7)" />
          <path d={`M${-s * 0.72},${-s * 0.36} L0,${-s * 0.82} L${s * 0.72},${-s * 0.36} L${s * 0.52},${s * 0.62} L${-s * 0.52},${s * 0.62} Z`} fill={color} stroke={panel} strokeWidth="0.32" />
          <rect x={-s * 0.36} y={-s * 0.24} width={s * 0.72} height={s * 0.18} rx="0.6" fill="#020617" opacity="0.42" />
          <line x1={-s * 0.46} y1={s * 0.18} x2={s * 0.46} y2={s * 0.18} stroke={panel} strokeWidth="0.42" opacity="0.45" />
          <circle cx={-s * 0.28} cy={s * 0.44} r={s * 0.07} fill="#fff" opacity="0.45" />
          <circle cx={s * 0.28} cy={s * 0.44} r={s * 0.07} fill="#fff" opacity="0.45" />
        </g>
      );
    case 'ColonyShip':
      return (
        <g opacity="0.94">
          <circle r={s * 0.5} fill={color} stroke={panel} strokeWidth="0.3" />
          <path d={`M${-s * 0.42},${s * 0.08} L0,${s * 0.86} L${s * 0.42},${s * 0.08}`} fill="none" stroke={color} strokeWidth={s * 0.22} strokeLinecap="round" />
          <circle r={s * 0.22} fill={panel} opacity="0.34" />
        </g>
      );
    case 'Fighter':
      return (
        <g opacity="0.96">
          <path d={`M0,${-s * 0.82} L${s * 0.34},${s * 0.56} L0,${s * 0.18} L${-s * 0.34},${s * 0.56} Z`} fill={color} stroke={panel} strokeWidth="0.24" />
          <line x1="0" y1={-s * 0.48} x2="0" y2={s * 0.16} stroke={panel} strokeWidth="0.28" opacity="0.5" />
        </g>
      );
    default:
      return <circle r={s * 0.5} fill={color} />;
  }
};

// ─── Development / Planet Surface Renderers ───────────────────────────────

const DevelopmentIcon: React.FC<{ development: string }> = ({ development }) => {
  const windowDots = (xs: number[], ys: number[]) => xs.flatMap((x) => ys.map((y) => (
    <rect key={`${x}-${y}`} x={x - 0.22} y={y - 0.22} width="0.44" height="0.44" rx="0.08" fill="#e0f2fe" opacity="0.68" />
  )));

  switch (development) {
    case 'colony':
      return (
        <g opacity="0.96">
          <ellipse cx="0" cy="5.2" rx="8" ry="1.7" fill="rgba(2,6,23,0.5)" />
          <path d="M-7,3.8 A7,6 0 0,1 7,3.8 Z" fill="rgba(14,165,233,0.28)" stroke="#a5f3fc" strokeWidth="0.75" />
          <path d="M-4.6,3.6 A4.6,4 0 0,1 4.6,3.6" fill="none" stroke="#ecfeff" strokeWidth="0.45" opacity="0.8" />
          <rect x="-1.2" y="-2.8" width="2.4" height="6.6" rx="0.45" fill="#94a3b8" stroke="#dbeafe" strokeWidth="0.35" />
          <line x1="0" y1="-2.8" x2="0" y2="-6" stroke="#a5f3fc" strokeWidth="0.45" />
          <circle cx="0" cy="-6.4" r="0.65" fill="#67e8f9" />
        </g>
      );
    case 'city':
      return (
        <g opacity="0.96">
          <ellipse cx="0" cy="6.5" rx="10.5" ry="2" fill="rgba(2,6,23,0.55)" />
          <path d="M-10,6.2 C-6,3.2 -2,4 0,2.7 C3,1 6.3,2.7 10,5.8" fill="rgba(15,23,42,0.42)" stroke="#7dd3fc" strokeWidth="0.45" />
          <rect x="-7.5" y="0.4" width="3.2" height="5.8" rx="0.35" fill="#1e3a8a" stroke="#93c5fd" strokeWidth="0.32" />
          <rect x="-3.4" y="-2.6" width="3.5" height="8.8" rx="0.38" fill="#164e63" stroke="#67e8f9" strokeWidth="0.32" />
          <rect x="1.1" y="-1" width="3.6" height="7.2" rx="0.35" fill="#312e81" stroke="#a5b4fc" strokeWidth="0.32" />
          <rect x="5.4" y="1.8" width="2.7" height="4.4" rx="0.3" fill="#1d4ed8" stroke="#93c5fd" strokeWidth="0.28" />
          {windowDots([-6.3, -5.2], [2, 3.4, 4.8])}
          {windowDots([-2.2, -1.1], [-0.8, 0.8, 2.4, 4])}
          {windowDots([2.4, 3.4], [0.9, 2.5, 4.1])}
        </g>
      );
    case 'metropolis':
      return (
        <g opacity="0.98">
          <ellipse cx="0" cy="7.5" rx="13" ry="2.3" fill="rgba(2,6,23,0.62)" />
          <path d="M-12,7 C-9,3.8 -4,2.9 0,1.2 C5.5,-1 9.7,2.9 12,6.8" fill="rgba(15,23,42,0.46)" stroke="#c4b5fd" strokeWidth="0.45" />
          <rect x="-10" y="1.2" width="2.6" height="6" rx="0.35" fill="#1e1b4b" stroke="#818cf8" strokeWidth="0.3" />
          <rect x="-6.8" y="-2.4" width="3.2" height="9.6" rx="0.38" fill="#312e81" stroke="#a78bfa" strokeWidth="0.35" />
          <rect x="-2.7" y="-6.7" width="4.8" height="13.9" rx="0.5" fill="#164e63" stroke="#67e8f9" strokeWidth="0.38" />
          <polygon points="-2.7,-6.7 -0.3,-9.7 2.1,-6.7" fill="#67e8f9" opacity="0.68" />
          <rect x="2.9" y="-3.8" width="3.8" height="11" rx="0.4" fill="#4c1d95" stroke="#d8b4fe" strokeWidth="0.35" />
          <rect x="7.3" y="0.2" width="2.7" height="7" rx="0.35" fill="#1e3a8a" stroke="#93c5fd" strokeWidth="0.3" />
          <path d="M-11,7.1 C-6,5.7 6,5.7 11,7.1" fill="none" stroke="#67e8f9" strokeWidth="0.55" opacity="0.55" />
          {windowDots([-5.8, -4.8], [-0.5, 1.2, 2.9, 4.6])}
          {windowDots([-1.3, 0.3], [-4, -2.3, -0.6, 1.1, 2.8, 4.5])}
          {windowDots([4, 5.2], [-1.6, 0.2, 2, 3.8, 5.6])}
        </g>
      );
    case 'arcology':
      return (
        <g opacity="0.98">
          <ellipse cx="0" cy="7.8" rx="13.5" ry="2.4" fill="rgba(2,6,23,0.6)" />
          <path d="M-11,5.5 A11,9 0 0,1 11,5.5" fill="rgba(8,47,73,0.5)" stroke="#67e8f9" strokeWidth="0.7" />
          <path d="M-7.5,5.5 A7.5,6 0 0,1 7.5,5.5" fill="none" stroke="#cffafe" strokeWidth="0.45" opacity="0.7" />
          <rect x="-4.8" y="-2.4" width="3.2" height="8.6" rx="0.45" fill="#155e75" stroke="#a5f3fc" strokeWidth="0.32" />
          <rect x="-0.9" y="-6.2" width="3.2" height="12.4" rx="0.48" fill="#0f766e" stroke="#99f6e4" strokeWidth="0.32" />
          <rect x="3" y="-1.4" width="3.1" height="7.6" rx="0.45" fill="#1d4ed8" stroke="#bfdbfe" strokeWidth="0.32" />
        </g>
      );
    case 'coreworld':
      return (
        <g opacity="0.99">
          <ellipse cx="0" cy="8" rx="14" ry="2.5" fill="rgba(2,6,23,0.64)" />
          <path d="M-12,6.8 C-7,1.5 -2,-2 2,-4.8 C6,-2 10,2.5 12,6.8" fill="rgba(113,63,18,0.45)" stroke="#fde68a" strokeWidth="0.55" />
          <rect x="-7" y="-1" width="3.3" height="8" fill="#92400e" stroke="#fbbf24" strokeWidth="0.32" rx="0.4" />
          <rect x="-2.6" y="-7.2" width="5.2" height="14.2" fill="#b45309" stroke="#fde68a" strokeWidth="0.38" rx="0.48" />
          <rect x="4" y="-2.5" width="3.6" height="9.5" fill="#78350f" stroke="#fcd34d" strokeWidth="0.32" rx="0.4" />
          <circle cx="0" cy="-3.6" r="1.2" fill="#fef3c7" opacity="0.82" />
          <path d="M-9,7 C-4,4.9 4,4.9 9,7" stroke="#fbbf24" strokeWidth="0.58" fill="none" opacity="0.75" />
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
                    className="animate-lane-flow"
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
                 
                  pointerEvents="none"
                />

                {node.claimedBy && (
                  <>
                    <circle r={planetR + 8} fill="none" stroke={nodeColor} strokeWidth="1.4" opacity="0.68" />
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
                   
                  />
                )}

                {isSelected && (
                  <g className="selected-system-ring" pointerEvents="none">
                    <circle
                      r={planetR + 15}
                      fill="none"
                      stroke={node.claimedBy ? nodeColor : '#67e8f9'}
                      strokeWidth="1.6"
                      strokeDasharray="8 6"
                      opacity="0.92"
                    />
                    <circle
                      r={planetR + 21}
                      fill="none"
                      stroke="#67e8f9"
                      strokeWidth="0.9"
                      strokeDasharray="2 8"
                      opacity="0.55"
                    />
                  </g>
                )}

                {node.hasGateway && (
                  <circle r={planetR + 17} fill="none" stroke="#a78bfa" strokeWidth="1.4" strokeDasharray="10 5" />
                )}
                {node.hasShipyard && (
                  <circle r={planetR + 12} fill="none" stroke="#22d3ee" strokeWidth="1.4" strokeDasharray="2 4" opacity="0.9" />
                )}
                {node.hasFtlInhibitor && (
                  <circle r={planetR + 15} fill="none" stroke="#ef4444" strokeWidth="1.4" opacity="0.92" />
                )}

                <g className="planet-sphere">
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
                            <rect x="-5.5" y="-5.5" width="11" height="11" fill={color} stroke="#020617" strokeWidth="1" rx="2" opacity="0.97" />
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
                  fill={isSelected ? '#67e8f9' : isReachable ? '#fde68a' : '#cbd5e1'}
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
