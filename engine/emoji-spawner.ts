import { useEffect, useRef, useState } from "react";

// Centralized emoji-spawner configuration (supports multiple variants)
export const DEFAULT_LIFETIME_MS = 5000;
export const DEFAULT_SIZE = 30; // px in design-space
// Per-emoji config: spawn lifetime and collected-effect cooldown
const EMOJI_VARIANTS: Array<{ emoji: string; size: number; lifetimeMs: number; cooldownMs: number }> = [
  { emoji: "🔥", size: DEFAULT_SIZE,     lifetimeMs: DEFAULT_LIFETIME_MS, cooldownMs: 5000 },
  // Disco ball power-up: slightly larger to feel special; lasts 20s when collected
  { emoji: "🪩", size: DEFAULT_SIZE + 6, lifetimeMs: DEFAULT_LIFETIME_MS, cooldownMs: 20000 },
  // Dinosaur: triggers a drifting dino overlay for the duration of its cooldown
  { emoji: "🦕", size: DEFAULT_SIZE + 4, lifetimeMs: DEFAULT_LIFETIME_MS, cooldownMs: 8000 },
];
const DEFAULT_RATE_PER_SEC = 0.5; // lambda for Poisson process
const DEFAULT_EXCLUDE_BUFFER = 30; // extra width added to ball diameter for no-spawn lane

export type Spawn = {
  id: number;
  x: number;
  y: number;
  size: number;
  emoji: string;
  expiresAt: number;
  cooldownMs: number; // how long the collected power-up effect lasts
};

export function useEmojiSpawner(opts: {
  started: boolean;
  designW: number;
  designH: number;
  rectH: number;
  respawnY: number;
  paddleBottomOffset: number; // bottom offset in design-space for the paddle
  letterRectsRef: React.MutableRefObject<Array<{ x: number; y: number; w: number; h: number }>>;
  ballRadiusRef: React.MutableRefObject<number>;
}): { spawns: Array<Spawn>; consumeSpawn: (id: number) => void } {
  const {
    started,
    designW,
    designH,
    rectH,
    respawnY,
    paddleBottomOffset,
    letterRectsRef,
    ballRadiusRef,
  } = opts;

  const [spawns, setSpawns] = useState<Array<Spawn>>([]);
  const spawnTimersRef = useRef<Record<number, number>>({});
  const nextSpawnTimerRef = useRef<number | null>(null);

  function clearAllSpawnTimers() {
    try {
      for (const k in spawnTimersRef.current) {
        clearTimeout(spawnTimersRef.current[k]);
      }
    } catch {
      // ignore
    }
    spawnTimersRef.current = {};
    if (nextSpawnTimerRef.current != null) {
      clearTimeout(nextSpawnTimerRef.current);
      nextSpawnTimerRef.current = null;
    }
  }

  function getPlayAreaBounds() {
    const rects = letterRectsRef.current;
    let topY = 0;
    if (rects && rects.length > 0) {
      let maxBottom = 0;
      for (const r of rects) maxBottom = Math.max(maxBottom, r.y + r.h);
      topY = Math.round(maxBottom + 8);
    }
    const paddleTop = designH - paddleBottomOffset - rectH;
    const bottomY = Math.max(0, Math.min(designH, paddleTop));
    return { left: 0, right: designW, top: topY, bottom: bottomY };
  }

  function scheduleNextSpawn() {
    const u = Math.random();
    const intervalMs = Math.max(250, Math.floor((-Math.log(1 - u) / Math.max(0.0001, DEFAULT_RATE_PER_SEC)) * 1000));
    nextSpawnTimerRef.current = window.setTimeout(() => {
      nextSpawnTimerRef.current = null;
      createSpawn();
      scheduleNextSpawn();
    }, intervalMs);
  }

  function createSpawn() {
    // pick an emoji variant (future: could be weighted or contextual)
    const variant = EMOJI_VARIANTS[Math.floor(Math.random() * EMOJI_VARIANTS.length)] || EMOJI_VARIANTS[0];
    const spawnSize = variant.size;
    const bounds = getPlayAreaBounds();
    const areaW = bounds.right - bounds.left;
    const areaH = bounds.bottom - bounds.top;
    if (areaW <= 0 || areaH <= 0) return;

    const centerX = designW / 2;
  const excludeHalfW = (ballRadiusRef.current * 2 + DEFAULT_EXCLUDE_BUFFER) / 2;
    const paddleTop = designH - paddleBottomOffset - rectH;

    const MAX_TRIES = 10;
    let sx = 0;
    let sy = 0;
    let ok = false;
    for (let i = 0; i < MAX_TRIES; i++) {
      sx = bounds.left + spawnSize / 2 + Math.random() * Math.max(0, areaW - spawnSize);
      sy = bounds.top + spawnSize / 2 + Math.random() * Math.max(0, areaH - spawnSize);
      const inLane = Math.abs(sx - centerX) < excludeHalfW && sy >= Math.min(respawnY, paddleTop) && sy <= Math.max(respawnY, paddleTop);
      if (!inLane) { ok = true; break; }
    }
    if (!ok) return;

    const id = Date.now() + Math.floor(Math.random() * 100000);
    const expiresAt = Date.now() + variant.lifetimeMs;
  const spawn: Spawn = { id, x: sx, y: sy, size: spawnSize, emoji: variant.emoji, expiresAt, cooldownMs: variant.cooldownMs };
    setSpawns((prev) => [...prev, spawn]);
    spawnTimersRef.current[id] = window.setTimeout(() => {
      setSpawns((prev) => prev.filter((s) => s.id !== id));
      delete spawnTimersRef.current[id];
    }, variant.lifetimeMs + 50);
  }

  function consumeSpawn(id: number) {
    try {
      if (spawnTimersRef.current[id] != null) {
        clearTimeout(spawnTimersRef.current[id]);
        delete spawnTimersRef.current[id];
      }
    } catch {}
    setSpawns((prev) => prev.filter((s) => s.id !== id));
  }

  useEffect(() => {
    if (!started) return;
    scheduleNextSpawn();
    return () => {
      clearAllSpawnTimers();
      setSpawns([]);
    };
  }, [started]);

  return { spawns, consumeSpawn };
}
