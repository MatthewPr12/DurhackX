"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { defaultTheme } from "@talkjs/react-components";
import { getTalkSession } from "@talkjs/core";
import durhackTheme, { Avatar } from "../engine/talkTheme";
import createMultiplayer from "../engine/multiplayer";

export default function Home() {
  // Provide your TalkJS app ID via an env var: NEXT_PUBLIC_TALKJS_APP_ID
  // If left blank the chat will not initialize until you set it.
  const appId = process.env.NEXT_PUBLIC_TALKJS_APP_ID || "";
  // demo user id. Use a stable server-safe default and hydrate a query-param
  // override on the client to avoid hydration mismatches between server and
  // client renders (don't call window or Math.random during render).
  const [userId, setUserId] = useState<string>(() => process.env.NEXT_PUBLIC_USER_ID || "player_local");
  const otherUserId = "opponent";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const pid = qs.get("player");
    if (pid) setUserId(pid);
  }, []);
  const conversationId = "new_conversation";

  

  // Demo user display name and optional photo URL (can be provided via env for testing)
  const initialPhoto = process.env.NEXT_PUBLIC_USER_PHOTO || "";
  const [myPhoto, setMyPhoto] = useState<string | undefined>(initialPhoto || undefined);

  // Whether the server has confirmed the user/participant was created.
  const [joinConfirmed, setJoinConfirmed] = useState<boolean>(false);

  

  const sessionRef = useRef<any | null>(null);
  const conversationRef = useRef<any | null>(null);

  useEffect(() => {
    if (!appId) return;
    if (typeof window === "undefined") return;
    // don't initialize until the user explicitly started (or a saved session restored)
    if (!started) return;

    // create a TalkJS session (uses the durhack host from the docs)
    if (!sessionRef.current) {
      // @ts-ignore - host is accepted by getTalkSession
      sessionRef.current = getTalkSession({ host: "durhack.talkjs.com", appId, userId });
    }

    const session = sessionRef.current;

    // Create user/participant server-side first (avoid USER_NOT_FOUND race).
    // After the server confirms, perform local SDK createIfNotExists and
    // conversation setup.
    let cancelled = false;
    (async function init() {
      try {
        // Use the userId as a safe fallback for name here to avoid
        // referencing state that may be declared later in the file.
        const payload = { playerId: userId, name: userId || "Player", photo: initialPhoto || undefined, conversationId };
        const resp = await fetch("/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!cancelled && resp.ok) {
          setJoinConfirmed(true);
        } else {
          // eslint-disable-next-line no-console
          console.error("/api/join failed", resp.status, await resp.text());
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("/api/join error", e);
      }

      // Only touch the TalkJS SDK after the server join attempt above.
      try {
  // Best-effort: if joinConfirmed was set we proceed; in case the
  // server responded slowly we still try the safe SDK calls here.
  session.currentUser.createIfNotExists({ name: userId || "Player", photoUrl: initialPhoto || undefined });
        session.user(otherUserId).createIfNotExists({ name: "Nina" });

        const conversation = session.conversation(conversationId);
        conversation.createIfNotExists();
        conversation.participant(otherUserId).createIfNotExists();
        // keep a reference to the conversation so UI components can send messages
        conversationRef.current = conversation;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("TalkJS SDK init error", e);
      }
    })();

    return () => {
      // tidy up TalkJS session when component unmounts
      try {
        session.destroy && session.destroy();
      } catch (e) {
        // ignore cleanup errors
      }
      sessionRef.current = null;
    };
  }, [appId, userId, initialPhoto]);

  // Subscribe to TalkJS conversation messages and log them to the console.
  useEffect(() => {
    if (!joinConfirmed) return;
    const conv: any = conversationRef.current;
    if (!conv) return;
    let unsub: any = null;
    try {
        if (typeof conv.subscribe === 'function') {
        unsub = conv.subscribe((evt: any) => {
          // evt shape may vary depending on SDK version. Try common shapes.
          const message = evt && (evt.message || evt);

          // Defensive: sometimes the subscription emits conversation-level
          // metadata (conversation object) instead of a message. Those objects
          // commonly include id/createdAt/lastMessageAt and do not have
          // text/body/content fields. Detect and label them so we don't
          // mis-log them as an incoming chat message.
          const looksLikeConvMeta = message && typeof message === 'object' &&
            ('createdAt' in message || 'lastMessageAt' in message) &&
            !('text' in message) && !('body' in message) && !('content' in message) && !('displayText' in message) && !('message' in message);

          if (looksLikeConvMeta) {
            console.log('[talk] conversation update (not a chat message)', { raw: message });
            return;
          }

          // message may contain .text or .body or .content
          const text = message && (message.text || message.body || message.content || message.message || message.displayText) || message;
          const sender = message && (message.sender && (message.sender.id || message.sender) || message.from && (message.from.id || message.from) || message.senderId) || 'unknown';
          console.log('[talk] message received', { text, from: sender, raw: message });
        });
      } else if (typeof conv.on === 'function') {
        const cb = (m: any) => {
          // guard against conversation-level events that some SDKs may emit
          const looksLikeConvMeta = m && typeof m === 'object' && ('createdAt' in m || 'lastMessageAt' in m) && !('text' in m) && !('body' in m) && !('content' in m) && !('displayText' in m) && !('message' in m);
          if (looksLikeConvMeta) {
            console.log('[talk] conversation update (not a chat message)', { raw: m });
            return;
          }

          const text = m && (m.text || m.body || m.content || m.displayText) || m;
          const sender = m && (m.sender && (m.sender.id || m.sender) || m.from && (m.from.id || m.from) || m.senderId) || 'unknown';
          console.log('[talk] message received', { text, from: sender, raw: m });
        };
        conv.on('message', cb);
        unsub = () => conv.off && conv.off('message', cb);
      }
    } catch (e) {
      // ignore subscription errors
    }

    return () => {
      try {
        if (typeof unsub === 'function') unsub();
        if (conv && typeof conv.unsubscribe === 'function') conv.unsubscribe();
      } catch (e) {}
    };
  }, [joinConfirmed, userId]);

  

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

  // user name and session state (start modal). Persist in sessionStorage so
  // opening another tab or reloading keeps the same identity during testing.
  const [myUserName, setMyUserName] = useState<string>(() => process.env.NEXT_PUBLIC_USER_NAME || "");
  const [started, setStarted] = useState<boolean>(false);
  

  // When the user starts a session (enters their name), ensure the TalkJS
  // currentUser reflects the chosen name and photo.
  useEffect(() => {
    if (!appId) return;
    if (!started) return;
    const s: any = sessionRef.current;
    if (!s) return;
    try {
      s.currentUser.createIfNotExists({ name: myUserName || "Player", photoUrl: myPhoto || undefined });
    } catch (e) {
      // ignore
    }
  }, [appId, started, myUserName, myPhoto]);

  // Restore session from sessionStorage if present
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem("durhack_session") : null;
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.id) setUserId(s.id);
        if (s && s.name) setMyUserName(s.name);
        if (s && s.photo) setMyPhoto(s.photo);
        if (s && s.id && s.name) setStarted(true);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  function startWithName(name: string, photo?: string) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    // generate a stable id from name
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `player_${Math.floor(Math.random()*10000)}`;
    setUserId(id);
    setMyUserName(trimmed);
    if (photo) setMyPhoto(photo);
    try {
      window.sessionStorage.setItem("durhack_session", JSON.stringify({ id, name: trimmed, photo: photo || "" }));
    } catch (e) {}
    setStarted(true);
  }

  // Allow the user to change their display name during a session. This
  // disconnects the multiplayer client, clears the saved session, and
  // re-opens the Start modal so the user can re-enter their name.
  function handleChangeName() {
    try {
      mp.disconnect();
    } catch (e) {
      // ignore
    }
    try {
      if (typeof window !== 'undefined') window.sessionStorage.removeItem('durhack_session');
    } catch (e) {
      // ignore
    }
    setStarted(false);
    setMyUserName("");
    setUserId("");
    setMyPhoto(undefined);
  }

  // Memoize theme to avoid unnecessary re-allocations. We export a theme
  // object from `lib/talkTheme.tsx` — pass that into TalkJS components when
  // rendering a Chatbox. Keeping it memoized avoids React churn.
  const theme = useMemo(() => durhackTheme, []);

  // Design viewport for consistent multiplayer view: fixed design pixels (16:9)
  const DESIGN_W = 1280;
  const DESIGN_H = 720;
  const TRAVEL_TIME = 2.0; // seconds to cross from left bound to right bound
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      const s = Math.min((sw * 0.96) / DESIGN_W, (sh * 0.92) / DESIGN_H);
      setScale(Math.min(1, s));
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);
  // alphabet letter as a separate coloured box (with space between) and leaves
  // the typed buffer in a fixed bottom bar like a normal chat input area.
  // accept external btnRefs so parent can compute collisions in design-space
  function LetterComposer({ onAppend, btnRefs }: { onAppend?: (ch: string) => void; btnRefs?: React.MutableRefObject<Array<HTMLButtonElement | null>> }) {
    const letters = Array.from(Array(26)).map((_, i) => String.fromCharCode(65 + i));
    // use provided refs if available otherwise fall back to internal
    const localBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const btnRefsInternal = btnRefs || localBtnRefs;

    function pushLetter(l: string) {
      if (onAppend) onAppend(l);
    }

  function renderButton(l: string, i: number, btnRefsRef: React.MutableRefObject<Array<HTMLButtonElement | null>>) {
      // map index -> hue across 0..320 degrees (rainbow) for smooth color map
      const hue = Math.round((i / 25) * 320); // 0..320
      const bg = `hsl(${hue} 85% 50%)`;
      return (
        <button
          key={l}
          ref={(el) => { btnRefsRef.current[i] = el }}
          aria-label={`Insert ${l}`}
          tabIndex={-1}
          aria-disabled={true}
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
            cursor: "default",
            pointerEvents: "none",
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
              <div key={l} style={{ width: "100%" }}>{renderButton(l, i, btnRefsInternal)}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Bottom buffer bar — fixed to bottom of viewport to look like a normal input.
  function BufferBar({ buffer, onEnter, onClear, inline, disabled }: { buffer: string; onEnter: () => void; onClear: () => void; inline?: boolean; disabled?: boolean }) {
    // inline === true -> render as positioned element to sit inside the aspect container
    if (inline) {
      return (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0b0b0b", display: "flex", gap: 12, alignItems: "center", borderRadius: 8, pointerEvents: 'auto', zIndex: 120 }}>
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "#111111", color: "#e5e7eb", flex: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buffer || <span style={{ color: "#6b7280" }}>buffer</span>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => { console.log('[talk] BufferBar Clear clicked'); onClear(); }}
              onPointerDown={() => { console.debug('[talk] BufferBar Clear pointerdown'); }}
              style={{ padding: "8px 12px", borderRadius: 8, background: "#1f2937", color: "#e5e7eb", border: "none", cursor: 'pointer', pointerEvents: 'auto' }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { console.log('[talk] BufferBar Enter clicked'); if (!disabled) onEnter(); }}
              onPointerDown={(e) => { console.debug('[talk] BufferBar Enter pointerdown', { disabled }); }}
              onPointerUp={(e) => { console.debug('[talk] BufferBar Enter pointerup', { disabled }); if (!disabled && e.button === 0) onEnter(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) { console.debug('[talk] BufferBar Enter keydown'); onEnter(); } }}
              disabled={disabled}
              style={{ padding: "8px 12px", borderRadius: 8, background: disabled ? "#1e40af" : "#2563EB", color: "white", border: "none", cursor: disabled ? 'not-allowed' : 'pointer', pointerEvents: 'auto', opacity: disabled ? 0.6 : 1 }}
            >
              Enter
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0b0b0b", display: "flex", gap: 12, alignItems: "center", zIndex: 120 }}>
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "#111111", color: "#e5e7eb", flex: 1, fontFamily: "monospace" }}>{buffer || <span style={{ color: "#6b7280" }}>buffer</span>}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => { console.log('[talk] BufferBar Clear clicked'); onClear(); }}
            onPointerDown={() => { console.debug('[talk] BufferBar Clear pointerdown'); }}
            style={{ padding: "8px 12px", borderRadius: 8, background: "#1f2937", color: "#e5e7eb", border: "none", cursor: 'pointer' }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => { console.log('[talk] BufferBar Enter clicked'); if (!disabled) onEnter(); }}
            onPointerDown={(e) => { console.debug('[talk] BufferBar Enter pointerdown', { disabled }); }}
            onPointerUp={(e) => { console.debug('[talk] BufferBar Enter pointerup', { disabled }); if (!disabled && e.button === 0) onEnter(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) { console.debug('[talk] BufferBar Enter keydown'); onEnter(); } }}
            disabled={disabled}
            style={{ padding: "8px 12px", borderRadius: 8, background: disabled ? "#1e40af" : "#2563EB", color: "white", border: "none", cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
          >
            {disabled ? 'Joining...' : 'Enter'}
          </button>
        </div>
      </div>
    );
  }

  // top-level buffer state and handlers
  const [buffer, setBuffer] = useState("");

  // Multiplayer: track other players
  type PlayerInfo = { playerId: string; name?: string; photo?: string; paddleX?: number; ball?: { x: number; y: number; r?: number }; buffer?: string; colorIndex?: number };
  const playersRef = useRef<Record<string, PlayerInfo>>({});
  const [playersSnapshot, setPlayersSnapshot] = useState<Array<PlayerInfo>>([]);
  const otherPaddlesRef = useRef<Array<{ x: number; w: number }>>([]);
  // local assigned color index for this client
  const assignedColorRef = useRef<number | null>(null);
  // Display state for smoothing remote players (not used for physics)
  // display state for smoothing remote players. We also store an estimated
  // velocity (ballV) for dead-reckoning between network samples.
  // display state for smoothing remote players. We also store an estimated
  // velocity (ballV) for dead-reckoning and a small samples buffer for
  // interpolation.
  const playersDisplayRef = useRef<Record<string, { paddleX: number; ball: { x: number; y: number; r: number }; ballV?: { x: number; y: number }; samples?: Array<{ x: number; y: number; r: number; t: number }> }>>({});
  const displayRafRef = useRef<number | null>(null);
  const mp = useMemo(() => createMultiplayer(), []);

  // derive a consistent color per player id so each client shows a unique
  // paddle colour. Keep it deterministic so the same id maps to same colour.
  // palette helper: map index 0..25 -> rainbow hue
  function colorForIndex(i: number) {
    const hue = Math.round((i / 25) * 320);
    return `hsl(${hue} 85% 55%)`;
  }

  function colorForId(id?: string, colorIndex?: number) {
    if (typeof colorIndex === 'number') return colorForIndex(colorIndex);
    const seed = String(id || "").split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
    const hue = seed % 360;
    return `hsl(${hue} 85% 55%)`;
  }

  function labelForPlayer(p?: PlayerInfo) {
    if (!p) return "Player";
    return p.name || p.playerId || "Player";
  }


  // global keyboard shortcuts: allow typing letters, Enter to send, Backspace to delete, Escape to clear
  // Only active after the user has started the session (so typing into the
  // start modal input is not intercepted). Also ignore key events when a
  // text input is focused.
  useEffect(() => {
    if (!appId || !started) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
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
  }, [appId, handleEnter, started]);

  function handleAppend(ch: string) {
    setBuffer((b) => b + ch);
  }

  async function handleEnter() {
    const conv = conversationRef.current;
    // Instrumentation: log call and conversation readiness to help debug click-no-op
    // eslint-disable-next-line no-console
    console.log('[talk] handleEnter invoked', { buffer, convExists: !!conv, sendType: conv ? typeof conv.send : 'undefined', joinConfirmed });
    if (!conv) {
      // If there's no active conversation, clear the buffer to avoid
      // leaving stale text in the UI and surface a console warning.
      // This prevents the Enter button from appearing to do nothing.
      // eslint-disable-next-line no-console
      console.warn('[talk] handleEnter: no conversation available');
      setBuffer("");
      return;
    }
    const text = buffer.trim();
    if (!text) return setBuffer("");
    try {
      await conv.send(text);
      // Log that we sent a message (sender is current user)
      // Use a short console tag so devs can easily grep messages.
      console.log('[talk] message sent', { text, from: userId });
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
  // We'll compute the avatar radius based on button width so the ball can
  // only hit one button at a time. Keep a state value for rendering and a
  // ref for the physics loop to read without re-rendering each frame.
  const [ballRadius, setBallRadius] = useState<number>(24);
  const ballRadiusRef = useRef<number>(24);
  // constant-speed behaviour: the ball travels at a fixed speed vector
  const SPEED = 700; // px/s magnitude in design-space

  // respawn delay in seconds (adjustable)
  const RESPAWN_DELAY = 3.0; // default respawn time in seconds
  // vertical spawn position in design-space pixels (increase to spawn lower)
  const RESPAWN_Y_PX = 300; // design-space px

  // Use refs for ball position to avoid React re-renders each frame.
  const ballXRef = useRef<number>(DESIGN_W / 2);
  const ballYRef = useRef<number>(RESPAWN_Y_PX);
  const ballDomRef = useRef<HTMLDivElement | null>(null);
  // debug overlay DOM ref (updated from RAF) so we can display realtime values
  const debugDomRef = useRef<HTMLDivElement | null>(null);

  // design inner container ref (the scaled design surface) so we can compute
  // element positions in design-space by converting client rects -> design coords
  const designInnerRef = useRef<HTMLDivElement | null>(null);
  // parent-held refs for letter button DOM nodes (populated by LetterComposer)
  const composerBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // precomputed letter button rects in design-space (x,y,width,height)
  // includes index and character so collisions can append the correct letter
  const letterRectsRef = useRef<Array<{ x: number; y: number; w: number; h: number; idx: number; ch: string }>>([]);

  // velocity ref (vx, vy) in design-space px/s. Start moving downward.
  const velRef = useRef({ x: 0, y: -SPEED });
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

  // helper to start the blink + resume sequence (shared between RAF and timeout)
  function startRespawnBlink() {
  // set position to configured spawn point (design-space px)
  // reset bottom-crossed marker so future crossings will re-log
  bottomCrossedRef.current = false;
  ballXRef.current = DESIGN_W / 2;
  ballYRef.current = RESPAWN_Y_PX;
    if (ballDomRef.current) {
      // position using pixel coordinates so spawn can be placed lower than center
      const r = ballRadiusRef.current;
      const sx = Math.round(ballXRef.current - r);
      const sy = Math.round(ballYRef.current - r);
      ballDomRef.current.style.left = "0";
      ballDomRef.current.style.top = "0";
      ballDomRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      ballDomRef.current.style.width = `${r * 2}px`;
      ballDomRef.current.style.height = `${r * 2}px`;
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
          
          let Theta = Math.PI + (Math.random() * Math.PI);
          velRef.current = { x: SPEED * Math.cos(Theta), y: SPEED * -Math.sin(Theta) };
        }
    }, 180);
      console.log("[game] startRespawnBlink called", { time: Date.now() });
  }

  // compute letter button rects in design-space (reads actual DOM positions)
  function computeLetterRects() {
    const inner = designInnerRef.current;
    if (!inner) return;
    const innerRect = inner.getBoundingClientRect();
    const scaleCur = scale || 1;
    const rects: Array<{ x: number; y: number; w: number; h: number; idx: number; ch: string }> = [];
    for (let i = 0; i < composerBtnRefs.current.length; i++) {
      const el = composerBtnRefs.current[i];
      if (!el) continue;
      const b = el.getBoundingClientRect();
      // convert from client pixels -> design-space by subtracting the inner
      // container origin and dividing by current scale.
      const x = (b.left - innerRect.left) / scaleCur;
      const y = (b.top - innerRect.top) / scaleCur;
      const w = b.width / scaleCur;
      const h = b.height / scaleCur;
      // determine the letter character from index (A..Z)
      const ch = String.fromCharCode(65 + i);
      rects.push({ x, y, w, h, idx: i, ch });
    }
    letterRectsRef.current = rects;
    // auto-compute a ball radius so diameter is smaller than the narrowest
    // button box. Use 80% of the min width to leave a margin so the ball
    // cannot physically touch two boxes at once.
    if (rects.length > 0) {
      let minW = Infinity;
      for (const r of rects) minW = Math.min(minW, r.w);
      if (isFinite(minW)) {
        const diameter = Math.max(12, Math.floor(minW * 0.8));
        const r = Math.max(6, Math.floor(diameter / 2));
        ballRadiusRef.current = r;
        setBallRadius(r);
        // also ensure the ball DOM matches the size immediately
        if (ballDomRef.current) {
          ballDomRef.current.style.width = `${r * 2}px`;
          ballDomRef.current.style.height = `${r * 2}px`;
        }
      }
    }
  }

  // recalc letter rects when scale changes or window resizes
  useEffect(() => {
    computeLetterRects();
    // buttons may not be measured on the first frame; recompute shortly after
    const t = window.setTimeout(() => computeLetterRects(), 120);
    const onResize = () => computeLetterRects();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [scale]);

  // collision helper: rectangle vs circle (design-space coords)
  function rectCircleCollides(r: { x: number; y: number; w: number; h: number }, cx: number, cy: number, radius: number) {
    const closestX = Math.max(r.x, Math.min(cx, r.x + r.w));
    const closestY = Math.max(r.y, Math.min(cy, r.y + r.h));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  useEffect(() => {
    // start the physics loop implemented in a shared module
    // this keeps the heavy per-frame logic out of the component file
    // and returns a cleanup function to stop the loop on unmount.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startPhysics } = require("../engine/physics");
    const stop = startPhysics({
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
      debugDomRef,
      setSpawned,
      setBlinkVisible,
      // when physics detects a local letter hit, append locally and broadcast
      onLetterHit: (ch: string) => {
        setBuffer((b) => {
          const nb = b + ch;
          try {
            mp.sendBuffer?.(nb);
            // Create a message

            // Send the message
            conversationRef.current.send(ch).then(function() {
              console.log("Message sent!");
            }).catch(function(error) {
              console.error("Error sending message: ", error);
            });

          } catch (e) { /* ignore */
            console.log(e)
          }
          return nb;
        });
      },
      DESIGN_W,
      DESIGN_H,
      RECT_W,
      RECT_H,
      BALL_RADIUS_REF: ballRadiusRef,
      SPEED,
      RESPAWN_DELAY,
      otherPaddlesRef,
      startRespawnBlink,
    });
    return () => stop();
  }, [mp]);

  // connect multiplayer when the user has started and identity is available
  useEffect(() => {
    if (!started || !userId || !myUserName) return;
    // use provided userId/name to connect
    const pid = userId;
    // pick lowest unused color index from 0..25 based on currently known players
    function pickColorIndex() {
      const used = new Set<number>();
      for (const k in playersRef.current) {
        const p = playersRef.current[k];
        if (p && typeof p.colorIndex === 'number') used.add(p.colorIndex);
      }
      for (let i = 0; i < 26; i++) if (!used.has(i)) return i;
      return Math.floor(Math.random() * 26);
    }
    const myColor = pickColorIndex();
    assignedColorRef.current = myColor;
  // createMultiplayer.connect expects (id, name?, photo?) — pass only those
  mp.connect(pid, myUserName, myPhoto);
    // receive updates
    const off = mp.onUpdate((u) => {
      if (!u || !u.playerId) return;
      // handle leave messages
      if ((u as any).left) {
        delete playersRef.current[u.playerId];
        setPlayersSnapshot(Object.values(playersRef.current));
        return;
      }
      const cur = playersRef.current[u.playerId] || ({ playerId: u.playerId } as PlayerInfo);
      // merge only the defined fields from the incoming update so we don't
      // accidentally wipe name/photo when receiving a frequent ball update.
      if (typeof u.name === 'string') cur.name = u.name;
      if (typeof u.photo === 'string') cur.photo = u.photo;
      if (typeof u.paddleX === 'number') cur.paddleX = u.paddleX;
      if (typeof (u as any).colorIndex === 'number') cur.colorIndex = (u as any).colorIndex;

      // Preserve the raw network data on the player record for latency-aware
      // interpolation. We'll keep a small metadata object to help estimate
      // velocity and perform dead-reckoning.
      const nowMs = Date.now();
      if (u.ball) {
        // push network sample into a small buffer for this player so we can
        // interpolate between samples with a fixed render delay (jitter buffer)
        const sample = { x: u.ball.x, y: u.ball.y, r: u.ball.r ?? ballRadius, t: (u as any).timestamp ?? nowMs };
        const disp = playersDisplayRef.current[u.playerId] || ({ paddleX: typeof cur.paddleX === 'number' ? cur.paddleX : initialRectX, ball: { x: sample.x, y: sample.y, r: sample.r }, samples: [] } as any);
        disp.samples = disp.samples || [];
        disp.samples.push(sample);
        // keep only recent samples (last 10)
        if (disp.samples.length > 10) disp.samples.splice(0, disp.samples.length - 10);
        playersDisplayRef.current[u.playerId] = disp;
        cur.ball = { x: u.ball.x, y: u.ball.y, r: u.ball.r };
      }

      if ((u as any).buffer !== undefined) cur.buffer = (u as any).buffer;
      playersRef.current[u.playerId] = cur;
      // keep a snapshot for rendering
      setPlayersSnapshot(Object.values(playersRef.current));
    });

    // periodically send paddle position for this client (throttle)
    // increase frequency to improve smoothness (tradeoff: more network traffic)
    const paddleTicker = window.setInterval(() => {
      mp.sendPaddle(rectXRef.current);
    }, 60);

    // periodically send own ball state at a similar cadence
    const ballTicker = window.setInterval(() => {
      if (spawned) mp.sendBall({ x: ballXRef.current, y: ballYRef.current, r: ballRadiusRef.current });
    }, 60);

    return () => {
      off();
      clearInterval(paddleTicker);
      clearInterval(ballTicker);
      mp.disconnect();
    };
  }, [mp, myPhoto, started, userId, myUserName]);

  // update otherPaddlesRef when playersSnapshot changes
  useEffect(() => {
    // derive physics collision paddles from the most recent networked values
    const arr: Array<{ x: number; w: number }> = [];
    for (const id in playersRef.current) {
      const p = playersRef.current[id];
      if (!p || p.playerId === userId) continue; // skip own
      arr.push({ x: typeof p.paddleX === 'number' ? p.paddleX : initialRectX, w: RECT_W });
    }
    otherPaddlesRef.current = arr;
  }, [playersSnapshot]);

  // Smoothly interpolate display positions for remote players and update
  // playersSnapshot used for rendering. This keeps visuals smooth despite
  // discrete network updates. We do not use the smoothed positions for
  // physics collisions (otherPaddlesRef uses raw network positions above).
  useEffect(() => {
    let last = performance.now();
  function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

    function step(now: number) {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;

      // Update display positions using velocity-based dead-reckoning and
      // a light correction towards the latest networked target to prevent drift.
      for (const id in playersRef.current) {
        const p = playersRef.current[id];
        if (!p) continue;
        const disp = playersDisplayRef.current[id] || { paddleX: typeof p.paddleX === 'number' ? p.paddleX : initialRectX, ball: { x: p.ball?.x ?? DESIGN_W/2, y: p.ball?.y ?? RESPAWN_Y_PX, r: p.ball?.r ?? ballRadius }, ballV: { x: 0, y: 0 } } as any;

        // Interpolation buffer rendering: render slightly behind real-time so
        // we can interpolate between received samples and hide jitter.
        const RENDER_DELAY_MS = 100; // fixed render delay (tweakable)
        const renderTime = Date.now() - RENDER_DELAY_MS;
        const samples = disp.samples || [];
        if (samples.length >= 2) {
          // find the pair of samples that bracket renderTime
          let i = 0;
          while (i < samples.length - 1 && samples[i + 1].t <= renderTime) i++;
          const s1 = samples[i];
          const s2 = samples[Math.min(i + 1, samples.length - 1)];
          if (s1 && s2 && s1.t <= renderTime && s2.t >= renderTime) {
            const tt = (renderTime - s1.t) / Math.max(1, (s2.t - s1.t));
            disp.ball.x = lerp(s1.x, s2.x, tt);
            disp.ball.y = lerp(s1.y, s2.y, tt);
            disp.ball.r = s2.r ?? s1.r ?? disp.ball.r;
          } else {
            // use last sample as a fallback
            const last = samples[samples.length - 1];
            disp.ball.x = last.x;
            disp.ball.y = last.y;
            disp.ball.r = last.r;
          }
        } else if (samples.length === 1) {
          // single sample: extrapolate using estimated velocity if available
          const last = samples[0];
          const vx = disp.ballV?.x ?? 0;
          const vy = disp.ballV?.y ?? 0;
          const age = Math.max(0, (Date.now() - last.t) / 1000);
          disp.ball.x = last.x + vx * age;
          disp.ball.y = last.y + vy * age;
          disp.ball.r = last.r ?? disp.ball.r;
        }

        // Smooth paddle position similarly
        if (typeof p.paddleX === 'number') {
          const paddleFactor = Math.min(1, 12 * dt);
          disp.paddleX = lerp(disp.paddleX, p.paddleX, paddleFactor);
        }

        playersDisplayRef.current[id] = disp;
      }

      // Build a render snapshot that contains display positions
      const snap: Array<PlayerInfo> = Object.values(playersRef.current).map((p) => {
        const disp = playersDisplayRef.current[p.playerId] || { paddleX: p.paddleX ?? initialRectX, ball: { x: p.ball?.x ?? DESIGN_W/2, y: p.ball?.y ?? RESPAWN_Y_PX, r: p.ball?.r ?? ballRadius } } as any;
        return { ...p, paddleX: disp.paddleX, ball: { ...(p.ball || {}), x: disp.ball.x, y: disp.ball.y, r: disp.ball.r } };
      });
      setPlayersSnapshot(snap);

      displayRafRef.current = requestAnimationFrame(step);
    }

    displayRafRef.current = requestAnimationFrame(step);
    return () => {
      if (displayRafRef.current != null) cancelAnimationFrame(displayRafRef.current);
      displayRafRef.current = null;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--background)", color: "var(--foreground)", overflow: "hidden" }}>
    <main className="flex flex-col items-center justify-center gap-6" style={{ paddingBottom: 0 }}>
      {/* Start modal: ask for user name before initializing the game */}
      {!started && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div style={{ width: 480, padding: 24, borderRadius: 12, background: '#0b0b0b', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', color: '#fff' }}>
            <h2 style={{ margin: 0, marginBottom: 12, fontSize: 20 }}>Enter your display name</h2>
            <p style={{ marginTop: 0, marginBottom: 12, color: '#9CA3AF' }}>This name will be shown to other players.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input aria-label="Display name" value={myUserName} onChange={(e) => setMyUserName(e.target.value)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: '#0f1724', color: '#fff' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => startWithName(myUserName, myPhoto)} style={{ padding: '8px 12px', borderRadius: 8, background: '#2563EB', color: 'white', border: 'none' }}>Start</button>
            </div>
          </div>
        </div>
      )}
  {/* content intentionally removed per user request */}

        {!appId ? (
          <div className="mt-4 text-sm text-red-600">Set NEXT_PUBLIC_TALKJS_APP_ID in your environment to enable the chat.</div>
        ) : (
          <div className="mt-6" style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            {/* wrapper: single centered container that holds the play area and an absolutely positioned control */}
            <div style={{ width: DESIGN_W * scale, height: DESIGN_H * scale, overflow: "visible", position: "relative" }}>
              <div style={{ position: 'absolute', right: 12, top: -44, zIndex: 90 }}>
                <button onClick={handleChangeName} style={{ padding: '6px 10px', borderRadius: 8, background: '#111827', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} title="Change display name">Change name</button>
              </div>
              {/* fixed design window scaled via CSS transform so all clients see the same layout */}
              <div style={{ width: DESIGN_W * scale, height: DESIGN_H * scale, overflow: "hidden", position: "relative" }}>
                <div ref={designInnerRef} style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0, display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box", borderRadius: 12, background: "transparent" }}>
              {/* composer at the top */}
              <div style={{ flex: "0 0 auto" }}>
                <LetterComposer onAppend={handleAppend} btnRefs={composerBtnRefs} />
              </div>

              {/* render user avatar as a physics 'ball' (positioned absolutely in design-space) */}
              {
                /* Ball will be positioned using ballX/ballY (center coords). */
              }
              <div style={{ position: "absolute", left: 0, top: 0, width: DESIGN_W, height: DESIGN_H, pointerEvents: "none" }}>
                {/* remote players' balls and paddles (updated from network) */}
                {playersSnapshot.map((p) => {
                  if (!p || p.playerId === userId) return null;
                  const br = p.ball?.r || ballRadius;
                  const bx = p.ball?.x ?? DESIGN_W / 2;
                  const by = p.ball?.y ?? RESPAWN_Y_PX;
                  const px = typeof p.paddleX === 'number' ? p.paddleX : initialRectX;
                  const pColor = colorForId(p.playerId, p.colorIndex);
                  const pLabel = labelForPlayer(p);
                  return (
                    <div key={p.playerId} style={{ pointerEvents: 'none' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, width: DESIGN_W, height: DESIGN_H }}>
                        <div style={{ position: 'absolute', left: Math.round(bx - br), top: Math.round(by - br), width: br * 2, height: br * 2, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9 }}>
                          <Avatar name={p.name || p.playerId} src={p.photo} size={br * 2} />
                        </div>
                        <div style={{ position: 'absolute', left: px, bottom: 96, width: RECT_W, height: RECT_H, background: pColor, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 700, fontFamily: 'monospace' }}>
                          {pLabel}
                        </div>
                        {/* remote player's typed buffer (read-only view) */}
                        <div style={{ position: 'absolute', left: px, bottom: 56, width: RECT_W, minHeight: 28, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, color: '#e5e7eb', fontFamily: 'monospace', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.buffer || ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div
                  ref={ballDomRef}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: ballRadius * 2,
                    height: ballRadius * 2,
                    transform: `translate3d(${Math.round(ballXRef.current - ballRadius)}px, ${Math.round(ballYRef.current - ballRadius)}px, 0)`,
                    pointerEvents: spawned ? "auto" : "none",
                    display: spawned ? "flex" : "none",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                    opacity: blinkVisible ? "1" : "0",
                    transition: "opacity 120ms linear",
                  }}
                >
                  <Avatar name={myUserName} src={myPhoto} size={ballRadius * 2} />
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
                <div style={{ position: "absolute", left: rectX, bottom: 96, width: RECT_W, height: RECT_H, background: (assignedColorRef.current != null ? colorForId(userId, assignedColorRef.current) : colorForId(userId)), borderRadius: 8, pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 700, fontFamily: "monospace" }}>
                  {myUserName}
                </div>

                {/* on-screen arrow buttons removed — keyboard only (ArrowLeft / ArrowRight) */}
              </div>

              {/* inline buffer bar inside the fixed window so it scales */}
              <BufferBar buffer={buffer} onEnter={handleEnter} onClear={handleClear} inline disabled={!joinConfirmed} />
              </div>
            </div>
          </div>
        </div>
        )}
      </main>
  {/* previously we rendered a fixed buffer bar; it's now rendered inline inside the aspect container */}
    </div>
  );
}
