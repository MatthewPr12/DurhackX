"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { defaultTheme } from "@talkjs/react-components";
import { getTalkSession } from "@talkjs/core";

export default function Home() {
  // Provide your TalkJS app ID via an env var: NEXT_PUBLIC_TALKJS_APP_ID
  // If left blank the chat will not initialize until you set it.
  const appId = process.env.NEXT_PUBLIC_TALKJS_APP_ID || "";

  // demo user ids — change these for your app's user ids
  const userId = "frank";
  const otherUserId = "nina";
  const conversationId = "new_conversation";

  // Demo user display name and optional photo URL (can be provided via env for testing)
  const initialPhoto = process.env.NEXT_PUBLIC_USER_PHOTO || "";
  const [myPhoto, setMyPhoto] = useState<string | undefined>(initialPhoto || undefined);

  const sessionRef = useRef<any | null>(null);
  const conversationRef = useRef<any | null>(null);

  useEffect(() => {
    if (!appId) return;
    if (typeof window === "undefined") return;

    // create a TalkJS session (uses the durhack host from the docs)
    if (!sessionRef.current) {
      // @ts-ignore - host is accepted by getTalkSession
      sessionRef.current = getTalkSession({ host: "durhack.talkjs.com", appId, userId });
    }

    const session = sessionRef.current;

  // create demo users and a conversation if they don't exist
  // include a photoUrl if provided for a better avatar experience
  session.currentUser.createIfNotExists({ name: "Frank", photoUrl: initialPhoto || undefined });
    session.user(otherUserId).createIfNotExists({ name: "Nina" });

  const conversation = session.conversation(conversationId);
  conversation.createIfNotExists();
  conversation.participant(otherUserId).createIfNotExists();
  // keep a reference to the conversation so UI components can send messages
  conversationRef.current = conversation;

    return () => {
      // tidy up TalkJS session when component unmounts
      try {
        session.destroy && session.destroy();
      } catch (e) {
        // ignore cleanup errors
      }
      sessionRef.current = null;
    };
  }, [appId]);

  // Try to read the current user's photo from the TalkJS session where possible.
  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    async function probe() {
      const s: any = sessionRef.current;
      if (!s) return;
      try {
        const cur = s.currentUser;
        if (!cur) return;
        // Common quick-paths
        if (cur.photoUrl) {
          setMyPhoto(cur.photoUrl);
          return;
        }
        // Some SDK shapes expose a `get()` promise to read user fields
        if (typeof cur.get === "function") {
          const u = await cur.get();
          if (u && !cancelled && (u.photoUrl || u.photo || u.avatarUrl)) {
            setMyPhoto(u.photoUrl || u.photo || u.avatarUrl);
            return;
          }
        }
      } catch (e) {
        // ignore
      }
    }
    probe();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  // Create a simple custom ChatHeader component that uses the default ConversationImage
  function MyChatHeader(props: any) {
    const { ConversationImage } = defaultTheme as any;
    return (
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Use the default conversation image for avatar */}
        <ConversationImage common={props.common} conversation={props.common.conversation} participants={props.common.participants} />
        <div>
          <div style={{ fontWeight: 700 }}>Custom Chat</div>
          <div style={{ fontSize: 12, color: "#666" }}>Durhack demo theme</div>
        </div>
      </div>
    );
  }

  // Avatar component: render an avatar visually similar to TalkJS's avatar.
  // Note: TalkJS's `ConversationImage` component relies on internal TalkJS
  // context and props; calling it directly outside of the TalkJS render
  // tree can throw runtime errors (observed as "i is undefined"). To avoid
  // runtime failures we render a compatible avatar here (photo or initials)
  // which can be styled to match TalkJS. If you want the exact TalkJS
  // component, it must be mounted inside the TalkJS component tree.
  function Avatar({ name, src, size = 48 }: { name: string; src?: string; size?: number }) {
    const initials = name
      .split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    // track image load failure so we can fall back to initials when the
    // provided photo URL 404s or otherwise fails to load
    const [imgFailed, setImgFailed] = useState(false);

    // Prefer to use TalkJS's Avatar theme component if available — it
    // reproduces the same visuals the TalkJS UI uses (background-image etc.)
    try {
      const { Avatar: TalkAvatar } = defaultTheme as any;
      // Only render the TalkJS Avatar when we have a real photo URL to avoid
      // the theme rendering `url(undefined)` which causes GET /undefined requests.
      if (TalkAvatar && src && !imgFailed) {
        // TalkAvatar expects prop `photoUrl` per the library implementation
        return <TalkAvatar photoUrl={src} />;
      }
    } catch (e) {
      // fall back to local rendering
    }

    if (src && !imgFailed) {
      return (
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          onError={() => setImgFailed(true)}
          style={{ borderRadius: "9999px", objectFit: "cover", display: "block", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
        />
      );
    }

    const bg = "linear-gradient(135deg,#60a5fa,#7c3aed)";
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "9999px",
          background: bg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 700,
          fontFamily: "monospace",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
        aria-hidden
      >
        {initials}
      </div>
    );
  }
  const myUserName = "Frank";

  // Memoize theme to avoid re-renders
  const theme = useMemo(() => ({ ChatHeader: MyChatHeader }), []);

  // Design viewport for consistent multiplayer view: fixed design pixels (16:9)
  const DESIGN_W = 1280;
  const DESIGN_H = 720;
  // Time it should take the paddle to travel end-to-end (design-space seconds)
  // Using a time-based constant ensures the travel time is identical across
  // viewport sizes because the design surface is uniformly scaled.
  const TRAVEL_TIME = 2.0; // seconds to cross from left bound to right bound
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      // leave a little margin so the container isn't flush to the viewport
      const s = Math.min((sw * 0.96) / DESIGN_W, (sh * 0.92) / DESIGN_H);
      // don't upscale above 1 (keep design at native scale)
      setScale(Math.min(1, s));
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // A small letter-button composer placed above the chatbox. It renders each
  // alphabet letter as a separate coloured box (with space between) and leaves
  // the typed buffer in a fixed bottom bar like a normal chat input area.
  function LetterComposer({ onAppend }: { onAppend?: (ch: string) => void }) {
    const letters = Array.from(Array(26)).map((_, i) => String.fromCharCode(65 + i));
    const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

    function pushLetter(l: string) {
      if (onAppend) onAppend(l);
    }

    function renderButton(l: string, i: number) {
      // map index -> hue across 0..320 degrees (rainbow) for smooth color map
      const hue = Math.round((i / 25) * 320); // 0..320
      const bg = `hsl(${hue} 85% 50%)`;
      return (
        <button
          key={l}
          ref={(el) => { btnRefs.current[i] = el }}
          onClick={() => pushLetter(l)}
          aria-label={`Insert ${l}`}
          onKeyDown={(e) => {
            // allow arrow navigation and Enter on focused button
            if (e.key === "ArrowLeft") {
              const next = Math.max(0, i - 1);
              btnRefs.current[next]?.focus();
              e.preventDefault();
            } else if (e.key === "ArrowRight") {
              const next = Math.min(25, i + 1);
              btnRefs.current[next]?.focus();
              e.preventDefault();
            } else if (e.key === "Enter") {
              pushLetter(l);
              e.preventDefault();
            }
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            // make buttons square by using aspect-ratio and letting the grid cell width
            // determine height. Remove fixed height.
            aspectRatio: "1 / 1",
            background: bg,
            color: "#000",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            width: "100%",
            // ensure background-color uses modern color syntax if the browser
            // supports it; fallback is still the HSL string above.
            backgroundColor: bg,
          }}
        >
          {l}
        </button>
      );
    }

    return (
      <div style={{ padding: 8, display: "flex", gap: 8, alignItems: "center", background: "transparent", justifyContent: "center", width: "100%" }}>
        {/* inside the fixed aspect container the letter row should take full width */}
        <div style={{ width: "100%", overflowX: "auto", display: "block" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(26, minmax(0, 1fr))", gap: 8, paddingBottom: 4 }}>
            {letters.map((l, i) => (
              // render each button to occupy one grid column so all 26 fit a single row
              <div key={l} style={{ width: "100%" }}>{renderButton(l, i)}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Bottom buffer bar — fixed to bottom of viewport to look like a normal input.
  function BufferBar({ buffer, onEnter, onClear, inline }: { buffer: string; onEnter: () => void; onClear: () => void; inline?: boolean }) {
    // inline === true -> render as positioned element to sit inside the aspect container
    if (inline) {
      return (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0b0b0b", display: "flex", gap: 12, alignItems: "center", borderRadius: 8 }}>
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "#111111", color: "#e5e7eb", flex: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buffer || <span style={{ color: "#6b7280" }}>buffer</span>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClear} style={{ padding: "8px 12px", borderRadius: 8, background: "#1f2937", color: "#e5e7eb", border: "none" }}>Clear</button>
            <button onClick={onEnter} style={{ padding: "8px 12px", borderRadius: 8, background: "#2563EB", color: "white", border: "none" }}>Enter</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0b0b0b", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "#111111", color: "#e5e7eb", flex: 1, fontFamily: "monospace" }}>{buffer || <span style={{ color: "#6b7280" }}>buffer</span>}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClear} style={{ padding: "8px 12px", borderRadius: 8, background: "#1f2937", color: "#e5e7eb", border: "none" }}>Clear</button>
          <button onClick={onEnter} style={{ padding: "8px 12px", borderRadius: 8, background: "#2563EB", color: "white", border: "none" }}>Enter</button>
        </div>
      </div>
    );
  }

  // top-level buffer state and handlers
  const [buffer, setBuffer] = useState("");

  // global keyboard shortcuts: allow typing letters, Enter to send, Backspace to delete, Escape to clear
  useEffect(() => {
    if (!appId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // a single character A-Z -> append
      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        setBuffer((b) => b + e.key.toUpperCase());
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        // send message
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleEnter();
        e.preventDefault();
        return;
      }
      if (e.key === "Backspace") {
        setBuffer((b) => b.slice(0, -1));
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        setBuffer("");
        e.preventDefault();
        return;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [appId, handleEnter]);

  function handleAppend(ch: string) {
    setBuffer((b) => b + ch);
  }

  async function handleEnter() {
    const conv = conversationRef.current;
    if (!conv) return;
    const text = buffer.trim();
    if (!text) return setBuffer("");
    try {
      await conv.send(text);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("TalkJS send failed", e);
    }
    setBuffer("");
  }

  function handleClear() {
    setBuffer("");
  }

  // ---------- Movable rectangle (left/right press-and-hold) ----------
  // Rectangle dimensions in design-space
  const RECT_W = 240;
  const RECT_H = 36;

  // position x (left) in design-space coordinates
  const initialRectX = Math.max(12, (DESIGN_W - RECT_W) / 2);
  const [rectX, setRectX] = useState<number>(initialRectX);
  // mirror rectX in a ref so the physics loop can read it without causing
  // the physics effect to re-run on every paddle movement (which would
  // cancel/restart the physics RAF and make the ball appear to pause).
  const rectXRef = useRef<number>(initialRectX);

  const directionRef = useRef<number>(0); // -1 left, 0 idle, 1 right
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  function startMoving(dir: -1 | 1) {
    directionRef.current = dir;
    // start loop if not running
    if (rafRef.current == null) {
      lastTimeRef.current = null;
      rafRef.current = requestAnimationFrame(function step(ts) {
        if (lastTimeRef.current == null) lastTimeRef.current = ts;
        const dt = (ts - (lastTimeRef.current || ts)) / 1000;
        lastTimeRef.current = ts;
        const dirCur = directionRef.current;
        if (dirCur !== 0) {
          // compute speed so that full travel takes TRAVEL_TIME seconds
          const speed = (DESIGN_W - RECT_W) / TRAVEL_TIME; // px / s in design-space
          setRectX((x) => {
            let nx = x + dirCur * speed * dt;
            // clamp inside design width
            nx = Math.max(0, Math.min(DESIGN_W - RECT_W, nx));
            // keep ref in sync so physics can read paddle position without
            // becoming a dependency of the physics effect.
            rectXRef.current = nx;
            return nx;
          });
        }
        rafRef.current = requestAnimationFrame(step);
      });
    }
  }

  function stopMoving() {
    directionRef.current = 0;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    }
  }

  // keyboard support: hold ArrowLeft / ArrowRight
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        startMoving(-1);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        startMoving(1);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        stopMoving();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // cleanup on unmount: ensure any running RAF is cancelled
  useEffect(() => {
    return () => {
      stopMoving();
    };
  }, []);

  // ---------- Simple physics for avatar 'ball' ----------
  const BALL_RADIUS = 24; // design-space px (avatar radius)
  // constant-speed behaviour: the ball travels at a fixed speed vector
  const SPEED = 700; // px/s magnitude in design-space

  // Use refs for ball position to avoid React re-renders each frame.
  const ballXRef = useRef<number>(DESIGN_W / 2);
  const ballYRef = useRef<number>(64);
  const ballDomRef = useRef<HTMLDivElement | null>(null);
  // debug overlay DOM ref (updated from RAF) so we can display realtime values
  const debugDomRef = useRef<HTMLDivElement | null>(null);

  // velocity ref (vx, vy) in design-space px/s. Start moving downward.
  const velRef = useRef({ x: 0, y: SPEED });
  const physicsRaf = useRef<number | null>(null);
  const lastPhysics = useRef<number | null>(null);
  // respawn control: when ball falls off bottom we will respawn it in the center
  const respawningRef = useRef<boolean>(false);
  const blinkTimerRef = useRef<number | null>(null);
  const bottomCrossedRef = useRef<boolean>(false);
  // track blink visibility via React state so re-renders (from paddle moves)
  // don't inadvertently remove the runtime-applied opacity styles.
  const [blinkVisible, setBlinkVisible] = useState<boolean>(true);

  // whether a ball is currently spawned/visible (when false the ball is despawned)
  const [spawned, setSpawned] = useState<boolean>(true);
  // use a deadline driven by the RAF timestamp in addition to a timeout
  // fallback so respawn happens even if RAF is throttled/stalled.
  const respawnDeadlineRef = useRef<number | null>(null);
  const respawnTimerRef = useRef<number | null>(null);
  // respawn delay in seconds (adjustable)
  const RESPAWN_DELAY = 3.0; // default respawn time in seconds
  // vertical spawn position in design-space pixels (increase to spawn lower)
  const RESPAWN_Y_PX = 300; // design-space px

  // helper to start the blink + resume sequence (shared between RAF and timeout)
  function startRespawnBlink() {
  // set position to configured spawn point (design-space px)
  // reset bottom-crossed marker so future crossings will re-log
  bottomCrossedRef.current = false;
  ballXRef.current = DESIGN_W / 2;
  ballYRef.current = RESPAWN_Y_PX;
    if (ballDomRef.current) {
      // position using pixel coordinates so spawn can be placed lower than center
      const sx = Math.round(ballXRef.current - BALL_RADIUS);
      const sy = Math.round(ballYRef.current - BALL_RADIUS);
      ballDomRef.current.style.left = "0";
      ballDomRef.current.style.top = "0";
      ballDomRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
    }
    setSpawned(true);
    setBlinkVisible(true);
    // start blink interval
    if (blinkTimerRef.current != null) {
      clearInterval(blinkTimerRef.current);
      blinkTimerRef.current = null;
    }
    let flashes = 6;
    let visible = true;
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
          // ensure pixel positioning is restored so RAF-driven translate takes over
          if (ballDomRef.current) {
            ballDomRef.current.style.left = "0";
            ballDomRef.current.style.top = "0";
          }
          velRef.current = { x: 0, y: SPEED };
        }
    }, 180);
      console.log("[game] startRespawnBlink called", { time: Date.now() });
  }

  useEffect(() => {
    let mounted = true;
    console.log("[game] physics effect mounted: starting game loop");
    function step(ts: number) {
      if (!mounted) return;
      if (lastPhysics.current == null) lastPhysics.current = ts;
      const dt = (ts - (lastPhysics.current || ts)) / 1000;
      lastPhysics.current = ts;

      // integrate constant velocity
      const vx = velRef.current.x;
      const vy = velRef.current.y;
      // integrate into refs
      let nextX = ballXRef.current + vx * dt;
      if (nextX - BALL_RADIUS <= 0) {
        velRef.current.x = Math.abs(vx);
        nextX = BALL_RADIUS;
      } else if (nextX + BALL_RADIUS >= DESIGN_W) {
        velRef.current.x = -Math.abs(vx);
        nextX = DESIGN_W - BALL_RADIUS;
      }
      ballXRef.current = nextX;

      const nextY = ballYRef.current + vy * dt;
      // compute paddle top y in design-space (same layout as BufferBar position)
      const paddleTop = DESIGN_H - 96 - RECT_H;

      // collision with paddle: if moving downward and crossing paddle top
      const bx = ballXRef.current;
      if (respawningRef.current) {
        // while respawning, keep the ball at its set position and don't integrate
      } else if (vy > 0 && nextY + BALL_RADIUS >= paddleTop && nextY - BALL_RADIUS <= DESIGN_H) {
        const paddleX = rectXRef.current;
        if (bx >= paddleX - BALL_RADIUS && bx <= paddleX + RECT_W + BALL_RADIUS) {
          // position ball on top of paddle and invert vertical component
          velRef.current.y = -Math.abs(vy);
          ballYRef.current = Math.max(0, paddleTop - BALL_RADIUS);
        } else {
          // ball is crossing the paddle top but not over the paddle — it will pass through
          ballYRef.current = nextY;
        }
      } else if (nextY - BALL_RADIUS <= 0) {
        velRef.current.y = Math.abs(vy);
        ballYRef.current = BALL_RADIUS;
      } else if (nextY - BALL_RADIUS > DESIGN_H) {
        // ball has fallen entirely off the bottom -> despawn then respawn after a delay
        respawningRef.current = true;
        // stop motion
        velRef.current = { x: 0, y: 0 };
        // clear any existing blink timer
        if (blinkTimerRef.current != null) {
          clearInterval(blinkTimerRef.current);
          blinkTimerRef.current = null;
        }
        // hide the old ball immediately
        setSpawned(false);
        setBlinkVisible(false);
        console.log("[game] ball fell off bottom", { ts, nextY: nextY, ballX: ballXRef.current });
        // schedule respawn by setting a deadline (RAF timestamp in ms)
        respawnDeadlineRef.current = ts + RESPAWN_DELAY * 1000;
        console.log("[game] respawn scheduled", { deadline: respawnDeadlineRef.current, delay: RESPAWN_DELAY });
        // also set a real timeout fallback so respawn occurs even if RAF is paused
        if (respawnTimerRef.current != null) {
          clearTimeout(respawnTimerRef.current);
          respawnTimerRef.current = null;
        }
        respawnTimerRef.current = window.setTimeout(() => {
          respawnTimerRef.current = null;
          console.log("[game] respawn timeout fired (fallback)");
          // use the shared helper to start blink+resume
          startRespawnBlink();
        }, RESPAWN_DELAY * 1000);
      } else if (nextY + BALL_RADIUS >= DESIGN_H) {
        // ball is crossing the bottom edge; allow it to continue moving off-screen
        ballYRef.current = nextY;
        // Log the crossing event only once when the ball first moves past the bottom
        if (!bottomCrossedRef.current) {
          bottomCrossedRef.current = true;
          console.log("[game] crossed bottom boundary (entered off-screen)", { ts, nextY, ballY: ballYRef.current, vy, respawning: respawningRef.current });
        }
      } else {
        ballYRef.current = nextY;
      }

      // If a respawn deadline was set and we've reached it, perform the respawn
      if (respawnDeadlineRef.current != null && ts >= respawnDeadlineRef.current) {
        respawnDeadlineRef.current = null;
      // reset bottom-crossed marker and center spawn position (horizontal center,
      // vertical position controlled by RESPAWN_Y_PX if provided else fraction)
  bottomCrossedRef.current = false;
  ballXRef.current = DESIGN_W / 2;
  ballYRef.current = RESPAWN_Y_PX;
        if (ballDomRef.current) {
          const sx = Math.round(ballXRef.current - BALL_RADIUS);
          const sy = Math.round(ballYRef.current - BALL_RADIUS);
          ballDomRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
        }
        // show and blink
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
            velRef.current = { x: 0, y: SPEED };
          }
        }, 180);
      }

      // update DOM position directly for smooth animation
      if (ballDomRef.current && !respawningRef.current) {
        const sx = Math.round(ballXRef.current - BALL_RADIUS);
        const sy = Math.round(ballYRef.current - BALL_RADIUS);
        // ensure left/top are zeroed so translate3d positions correctly
        ballDomRef.current.style.left = "0";
        ballDomRef.current.style.top = "0";
        ballDomRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      }

      // Update a tiny debug overlay (text) so we can inspect values visually
      if (debugDomRef.current) {
        try {
          debugDomRef.current.textContent = `y=${Math.round(ballYRef.current)} nextY=${Math.round(nextY)} vy=${Math.round(vy)} respawning=${respawningRef.current}`;
        } catch (e) {
          // ignore DOM write errors
        }
      }
      physicsRaf.current = requestAnimationFrame(step);
    }

    physicsRaf.current = requestAnimationFrame(step);
    return () => {
      mounted = false;
      if (physicsRaf.current != null) cancelAnimationFrame(physicsRaf.current);
      physicsRaf.current = null;
      lastPhysics.current = null;
      // clear any pending blink timers when unmounting
      if (blinkTimerRef.current != null) {
        clearInterval(blinkTimerRef.current);
        blinkTimerRef.current = null;
      }
      // clear any pending respawn deadline
      respawnDeadlineRef.current = null;
    };
    // physics loop should run continuously; it reads `rectXRef.current`
    // directly so we don't need to depend on `rectX` and restart the
    // effect on every small paddle movement (which would interrupt RAF).
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--background)", color: "var(--foreground)", overflow: "hidden" }}>
    <main className="flex flex-col items-center justify-center gap-6" style={{ paddingBottom: 0 }}>
  {/* content intentionally removed per user request */}

        {!appId ? (
          <div className="mt-4 text-sm text-red-600">Set NEXT_PUBLIC_TALKJS_APP_ID in your environment to enable the chat.</div>
        ) : (
          <div className="mt-6" style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            {/* fixed design window scaled via CSS transform so all clients see the same layout */}
            <div style={{ width: DESIGN_W * scale, height: DESIGN_H * scale, overflow: "hidden", position: "relative" }}>
              <div style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0, display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box", borderRadius: 12, background: "transparent" }}>
              {/* composer at the top */}
              <div style={{ flex: "0 0 auto" }}>
                <LetterComposer onAppend={handleAppend} />
              </div>

              {/* render user avatar as a physics 'ball' (positioned absolutely in design-space) */}
              {
                /* Ball will be positioned using ballX/ballY (center coords). */
              }
              <div style={{ position: "absolute", left: 0, top: 0, width: DESIGN_W, height: DESIGN_H, pointerEvents: "none" }}>
                <div
                  ref={ballDomRef}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: BALL_RADIUS * 2,
                    height: BALL_RADIUS * 2,
                    transform: `translate3d(${Math.round(ballXRef.current - BALL_RADIUS)}px, ${Math.round(ballYRef.current - BALL_RADIUS)}px, 0)`,
                    pointerEvents: spawned ? "auto" : "none",
                    display: spawned ? "flex" : "none",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                    opacity: blinkVisible ? "1" : "0",
                    transition: "opacity 120ms linear",
                  }}
                >
                  <Avatar name={myUserName} src={myPhoto} size={BALL_RADIUS * 2} />
                </div>
                {/* small debug overlay text updated from RAF */}
                <div
                  ref={debugDomRef}
                  style={{ position: "absolute", right: 12, top: 12, pointerEvents: "none", color: "#fff", fontFamily: "monospace", fontSize: 12, background: "rgba(0,0,0,0.45)", padding: "6px 8px", borderRadius: 6 }}
                  aria-hidden
                />
              </div>

              {/* chat area fills remaining space */}
              <div style={{ flex: "1 1 auto", marginTop: 8, position: "relative", display: "flex", alignItems: "stretch", justifyContent: "stretch" }}>
                {/* Chatbox removed: we will render messages with a custom renderer / alternate theme.
                    Keep a placeholder container where a custom message view can be mounted. */}
                <div id="messages-root" style={{ width: "100%", height: "100%", borderRadius: 8, background: "transparent" }} aria-hidden="true" />
              </div>

              {/* Movable rectangle and on-screen controls (inside design surface) */}
              <div style={{ position: "absolute", left: 0, top: 0, width: DESIGN_W, height: DESIGN_H, pointerEvents: "none" }}>
                {/* the moving rectangle (pointerEvents auto so it can be interactive if desired) */}
                <div style={{ position: "absolute", left: rectX, bottom: 96, width: RECT_W, height: RECT_H, background: "#60a5fa", borderRadius: 8, pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 700, fontFamily: "monospace" }}>
                  Player
                </div>

                {/* on-screen arrow buttons removed — keyboard only (ArrowLeft / ArrowRight) */}
              </div>

              {/* inline buffer bar inside the fixed window so it scales */}
              <BufferBar buffer={buffer} onEnter={handleEnter} onClear={handleClear} inline />
              </div>
            </div>
          </div>
        )}
      </main>
  {/* previously we rendered a fixed buffer bar; it's now rendered inline inside the aspect container */}
    </div>
  );
}
