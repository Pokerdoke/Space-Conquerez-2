import { useState, useRef, useCallback, useEffect } from 'react';

interface PanZoomState {
  panX: number;
  panY: number;
  scale: number;
}

export function usePanZoom(
  minScale = 0.4,
  maxScale = 3.0,
  initialPanX = 0,
  initialPanY = 0,
  initialScale = 0.8
) {
  const initialState = { panX: initialPanX, panY: initialPanY, scale: initialScale };
  const [state, setState] = useState<PanZoomState>(initialState);

  const stateRef = useRef<PanZoomState>(initialState);
  const pendingStateRef = useRef<PanZoomState | null>(null);
  const rafRef = useRef<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);
  const lastTouchMid = useRef({ x: 0, y: 0 });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Mouse/touch move events can fire far faster than the browser can paint.
  // Queue pan/zoom updates to one React state update per animation frame.
  const scheduleState = useCallback((next: PanZoomState) => {
    stateRef.current = next;
    pendingStateRef.current = next;
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingStateRef.current;
      pendingStateRef.current = null;
      if (pending) setState(pending);
    });
  }, []);

  // Mouse wheel zoom toward cursor
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svgEl = e.currentTarget;
    const rect = svgEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const prev = stateRef.current;
    const newScale = Math.max(minScale, Math.min(maxScale, prev.scale * factor));
    const worldX = (cx - prev.panX) / prev.scale;
    const worldY = (cy - prev.panY) / prev.scale;
    scheduleState({
      panX: cx - worldX * newScale,
      panY: cy - worldY * newScale,
      scale: Number(newScale.toFixed(3))
    });
  }, [minScale, maxScale, scheduleState]);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    isDragging.current = true;
    dragStart.current = { x: clientX, y: clientY };
    panStart.current = { x: stateRef.current.panX, y: stateRef.current.panY };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    handleStart(e.clientX, e.clientY);
  }, [handleStart]);

  const handleTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
      lastTouchDist.current = null;
    } else if (e.touches.length === 2) {
      isDragging.current = false;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDist.current = dist;
      lastTouchMid.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  }, [handleStart]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    scheduleState({
      ...stateRef.current,
      panX: panStart.current.x + dx,
      panY: panStart.current.y + dy
    });
  }, [scheduleState]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    handleMove(e.clientX, e.clientY);
  }, [handleMove]);

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1 && isDragging.current) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const svgEl = e.currentTarget;
      const rect = svgEl.getBoundingClientRect();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
      const factor = dist / lastTouchDist.current;
      lastTouchDist.current = dist;
      lastTouchMid.current = mid;

      const prev = stateRef.current;
      const newScale = Math.max(minScale, Math.min(maxScale, prev.scale * factor));
      const worldX = (mid.x - prev.panX) / prev.scale;
      const worldY = (mid.y - prev.panY) / prev.scale;
      scheduleState({
        panX: mid.x - worldX * newScale,
        panY: mid.y - worldY * newScale,
        scale: Number(newScale.toFixed(3))
      });
    }
  }, [handleMove, minScale, maxScale, scheduleState]);

  const handleEnd = useCallback(() => {
    isDragging.current = false;
    lastTouchDist.current = null;
  }, []);

  const reset = useCallback(() => {
    const next = { panX: initialPanX, panY: initialPanY, scale: initialScale };
    stateRef.current = next;
    pendingStateRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setState(next);
  }, [initialPanX, initialPanY, initialScale]);

  return {
    ...state,
    svgRef,
    handlers: {
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleEnd,
      onMouseLeave: handleEnd,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleEnd
    },
    reset
  };
}
