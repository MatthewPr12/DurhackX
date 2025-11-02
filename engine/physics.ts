import type React from "react";
import {useRef} from "react";

export type LetterRect = { x: number; y: number; w: number; h: number; idx: number; ch: string };

export function rectCircleCollides(r: { x: number; y: number; w: number; h: number }, cx: number, cy: number, radius: number) {
  const closestX = Math.max(r.x, Math.min(cx, r.x + r.w));
  const closestY = Math.max(r.y, Math.min(cy, r.y + r.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function startPhysics(opts: {
  ballXRef: React.MutableRefObject<number>;
  ballYRef: React.MutableRefObject<number>;
  velRef: React.MutableRefObject<{ x: number; y: number }>;
  rectXRef: React.MutableRefObject<number>;
  letterRectsRef: React.MutableRefObject<Array<LetterRect>>;
  respawningRef: React.MutableRefObject<boolean>;
  blinkTimerRef: React.MutableRefObject<number | null>;
  bottomCrossedRef: React.MutableRefObject<boolean>;
  respawnDeadlineRef: React.MutableRefObject<number | null>;
  respawnTimerRef: React.MutableRefObject<number | null>;
  ballDomRef: React.MutableRefObject<HTMLElement | null>;
  setSpawned: (v: boolean) => void;
  setBlinkVisible: (v: boolean) => void;
  // callback used when a letter box is hit by the local ball
  onLetterHit?: (ch: string) => void;
  DESIGN_W: number;
  DESIGN_H: number;
  RECT_W: number;
  RECT_H: number;
  BALL_RADIUS_REF: React.MutableRefObject<number>;
  SPEED: number;
  RESPAWN_DELAY: number;
  // other players' paddles (in design-space) — array of { x, w }
  otherPaddlesRef?: React.MutableRefObject<Array<{ x: number; w: number }>>;
  startRespawnBlink: () => void;
}) {
  const {
    ballXRef,
    ballYRef,
    velRef,
    rectXRef,
    letterRectsRef,
    respawningRef,
    blinkTimerRef,
    bottomCrossedRef,
    respawnDeadlineRef,
    respawnTimerRef,
  ballDomRef,
  setSpawned,
  setBlinkVisible,
  onLetterHit,
    DESIGN_W,
    DESIGN_H,
    RECT_W,
    RECT_H,
    BALL_RADIUS_REF,
    SPEED,
    RESPAWN_DELAY,
    startRespawnBlink,
  } = opts;

  let mounted = true;
  let lastPhysics: number | null = null;
  let physicsRaf: number | null = null;
  // Track previous local paddle position to estimate paddle velocity for
  // applying "english" (spin) to the ball on contact.
  let prevPaddleX: number | null = null;

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  // Set velocity vector by an upward-facing bounce angle (0 = straight up).
  function setVelocityFromAngle(angleRad: number) {
    const vx = SPEED * Math.sin(angleRad);
    const vy = -Math.abs(SPEED * Math.cos(angleRad)); // always bounce upward
    velRef.current = { x: vx, y: vy };
  }

  // Ensure the speed magnitude remains approximately SPEED.
  function normalizeSpeed() {
    const vx = velRef.current.x;
    const vy = velRef.current.y;
    const mag = Math.hypot(vx, vy) || 1;
    const scale = SPEED / mag;
    velRef.current = { x: vx * scale, y: vy * scale };
  }

  function step(ts: number) {
    if (!mounted) return;
    if (lastPhysics == null) lastPhysics = ts;
    const dt = (ts - (lastPhysics || ts)) / 1000;
    lastPhysics = ts;

  const vx = velRef.current.x;
  const vy = velRef.current.y;

    // integrate horizontal
    let nextX = ballXRef.current + vx * dt;
    const BALL_RADIUS = BALL_RADIUS_REF.current;
    if (nextX - BALL_RADIUS <= 0) {
      velRef.current.x = Math.abs(vx);
      nextX = BALL_RADIUS;
      // Safety: avoid perfectly horizontal wall ping-pong
      const MIN_VERT = SPEED * 0.12;
      if (Math.abs(velRef.current.y) < MIN_VERT) {
        velRef.current.y = (velRef.current.y >= 0 ? MIN_VERT : -MIN_VERT);
        normalizeSpeed();
      }
    } else if (nextX + BALL_RADIUS >= DESIGN_W) {
      velRef.current.x = -Math.abs(vx);
      nextX = DESIGN_W - BALL_RADIUS;
      const MIN_VERT = SPEED * 0.12;
      if (Math.abs(velRef.current.y) < MIN_VERT) {
        velRef.current.y = (velRef.current.y >= 0 ? MIN_VERT : -MIN_VERT);
        normalizeSpeed();
      }
    }
    ballXRef.current = nextX;

    const nextY = ballYRef.current + vy * dt;
    const paddleTop = DESIGN_H - 96 - RECT_H;
    const bx = ballXRef.current;
    // Estimate paddle velocity (px/s) based on last position sample
    const paddleXNow = rectXRef.current;
    const paddleVx = prevPaddleX == null ? 0 : (paddleXNow - prevPaddleX) / (dt || 1/60);
    prevPaddleX = paddleXNow;

    if (!respawningRef.current) {
      let handled = false;

      // letter collisions when moving up
      if (vy < 0 && letterRectsRef.current.length > 0) {
        for (const r of letterRectsRef.current) {
          if (rectCircleCollides(r, bx, nextY, BALL_RADIUS)) {
            velRef.current.y = Math.abs(vy);
            ballYRef.current = r.y + r.h + BALL_RADIUS;
            // append letter
            try {
              const letter = r.ch || String.fromCharCode(65 + r.idx);
              if (onLetterHit) onLetterHit(letter);
            } catch (e) {
              // ignore
            }
            handled = true;
            break;
          }
        }
      }

      // top boundary bounce
      if (!handled && nextY - BALL_RADIUS <= 0) {
        velRef.current.y = Math.abs(vy);
        ballYRef.current = BALL_RADIUS;
        handled = true;
      }

      // fully off bottom
      if (!handled && nextY - BALL_RADIUS > DESIGN_H) {
        respawningRef.current = true;
        velRef.current = { x: 0, y: 0 };
        if (blinkTimerRef.current != null) {
          clearInterval(blinkTimerRef.current);
          blinkTimerRef.current = null;
        }
        setSpawned(false);
        setBlinkVisible(false);
        // schedule respawn
  respawnDeadlineRef.current = ts + RESPAWN_DELAY * 1000;
        if (respawnTimerRef.current != null) {
          clearTimeout(respawnTimerRef.current);
          respawnTimerRef.current = null;
        }
        respawnTimerRef.current = window.setTimeout(() => {
          respawnTimerRef.current = null;
          startRespawnBlink();
        }, RESPAWN_DELAY * 1000);
        handled = true;
      }

      // paddle collision (downwards) — check local paddle and remote paddles
      if (!handled && vy > 0) {
        // local paddle
        const paddleX = rectXRef.current;
        const localRect = { x: paddleX, y: paddleTop, w: RECT_W, h: RECT_H };
        if (rectCircleCollides(localRect, bx, nextY, BALL_RADIUS)) {
          // Compute hit offset relative to paddle center (-1 left .. +1 right)
          const center = paddleX + RECT_W / 2;
          const offset = clamp((bx - center) / (RECT_W / 2), -1, 1);
          // Max deflection angle from vertical (e.g., 60deg)
          const MAX_ANGLE = Math.PI / 3;
          let angle = offset * MAX_ANGLE;
          // Add a bit of "english" from paddle movement
          const SPIN_FACTOR = 0.0015; // radians per (px/s)
          angle += clamp(paddleVx * SPIN_FACTOR, -MAX_ANGLE * 0.5, MAX_ANGLE * 0.5);
          // Final clamp to avoid near-horizontal rebounds
          angle = clamp(angle, -MAX_ANGLE + 0.05, MAX_ANGLE - 0.05);
          setVelocityFromAngle(angle);
          // Avoid near-vertical bounces: ensure a minimum horizontal component
          const MIN_HORIZ = SPEED * 0.15;
          const MIN_VERT = SPEED * 0.12;
          if (Math.abs(velRef.current.x) < MIN_HORIZ) {
            velRef.current.x = (velRef.current.x >= 0 ? 1 : -1) * MIN_HORIZ;
          }
          if (Math.abs(velRef.current.y) < MIN_VERT) {
            velRef.current.y = -MIN_VERT; // always bounce upward from paddle
          }
          normalizeSpeed();
          ballYRef.current = Math.max(0, paddleTop - BALL_RADIUS);
          handled = true;
        }

        // remote paddles
        if (!handled && opts.otherPaddlesRef && opts.otherPaddlesRef.current.length > 0) {
          for (const p of opts.otherPaddlesRef.current) {
            const r = { x: p.x, y: paddleTop, w: p.w || RECT_W, h: RECT_H };
            if (rectCircleCollides(r, bx, nextY, BALL_RADIUS)) {
              const center = r.x + (r.w || RECT_W) / 2;
              const offset = clamp((bx - center) / ((r.w || RECT_W) / 2), -1, 1);
              const MAX_ANGLE = Math.PI / 3;
              let angle = offset * MAX_ANGLE;
              // Clamp to avoid near-horizontal rebounds
              angle = clamp(angle, -MAX_ANGLE + 0.05, MAX_ANGLE - 0.05);
              setVelocityFromAngle(angle);
              const MIN_HORIZ = SPEED * 0.15;
              const MIN_VERT = SPEED * 0.12;
              if (Math.abs(velRef.current.x) < MIN_HORIZ) {
                velRef.current.x = (velRef.current.x >= 0 ? 1 : -1) * MIN_HORIZ;
              }
              if (Math.abs(velRef.current.y) < MIN_VERT) {
                velRef.current.y = -MIN_VERT;
              }
              normalizeSpeed();
              ballYRef.current = Math.max(0, paddleTop - BALL_RADIUS);
              handled = true;
              break;
            }
          }
        }
      }

      // crossing bottom edge
      if (!handled && nextY + BALL_RADIUS >= DESIGN_H) {
        ballYRef.current = nextY;
        if (!bottomCrossedRef.current) {
          bottomCrossedRef.current = true;
          // no-op logging here; page can add logs if desired
        }
        handled = true;
      }

      if (!handled) {
        ballYRef.current = nextY;
      }
    }

    // respawn by deadline
    if (respawnDeadlineRef.current != null && ts >= respawnDeadlineRef.current) {
      respawnDeadlineRef.current = null;
      bottomCrossedRef.current = false;
      ballXRef.current = DESIGN_W / 2;
      ballYRef.current = Math.round(DESIGN_H * 0.5); // fallback; page.startRespawnBlink handles correct Y
      if (ballDomRef.current) {
        const sx = Math.round(ballXRef.current - BALL_RADIUS);
        const sy = Math.round(ballYRef.current - BALL_RADIUS);
        ballDomRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      }
      setSpawned(true);
      setBlinkVisible(true);
      let flashes = 6;
      let visible = true;
      if (blinkTimerRef.current != null) {
        clearInterval(blinkTimerRef.current);
        blinkTimerRef.current = null;
      }
      blinkTimerRef.current = window.setInterval(() => {
        visible = !visible;
        setBlinkVisible(visible);
        flashes -= 1;
        if (flashes <= 0) {
          if (blinkTimerRef.current != null) {
            clearInterval(blinkTimerRef.current);
            blinkTimerRef.current = null;
          }
          setBlinkVisible(true);
          respawningRef.current = false;
          const R = (Math.random() * 0.5 + 0.25) * Math.PI * 2;
          velRef.current = { x: SPEED * Math.sin(R), y: SPEED * Math.abs(Math.cos(R)) };
        }
      }, 180);
    }

    // write DOM position
    if (ballDomRef.current && !respawningRef.current) {
      const sx = Math.round(ballXRef.current - BALL_RADIUS);
      const sy = Math.round(ballYRef.current - BALL_RADIUS);
      ballDomRef.current.style.left = "0";
      ballDomRef.current.style.top = "0";
      ballDomRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
    }

    // debug overlay removed

    physicsRaf = requestAnimationFrame(step);
  }

  physicsRaf = requestAnimationFrame(step);

  return () => {
    mounted = false;
    if (physicsRaf != null) cancelAnimationFrame(physicsRaf);
    physicsRaf = null;
    lastPhysics = null;
    if (blinkTimerRef.current != null) {
      clearInterval(blinkTimerRef.current);
      blinkTimerRef.current = null;
    }
    respawnDeadlineRef.current = null;
  };
}