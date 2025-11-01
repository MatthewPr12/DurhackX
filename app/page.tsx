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
    session.currentUser.createIfNotExists({ name: "Frank" });
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

  // Memoize theme to avoid re-renders
  const theme = useMemo(() => ({ ChatHeader: MyChatHeader }), []);

  // Design viewport for consistent multiplayer view: fixed design pixels (16:9)
  const DESIGN_W = 1280;
  const DESIGN_H = 720;
  // Maximum rectangle speed in pixels per second inside the DESIGN coordinate space
  // Adjust this constant to tune how fast the rectangle moves when holding the control.
  const MAX_SPEED = 600; // px / s
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
  const [rectX, setRectX] = useState(() => Math.max(12, (DESIGN_W - RECT_W) / 2));

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
          setRectX((x) => {
            let nx = x + dirCur * MAX_SPEED * dt;
            // clamp inside design width
            nx = Math.max(0, Math.min(DESIGN_W - RECT_W, nx));
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

                {/* left/right on-screen buttons (press & hold) */}
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 72, display: "flex", gap: 12, pointerEvents: "auto" }}>
                  <button
                    onMouseDown={() => startMoving(-1)}
                    onMouseUp={stopMoving}
                    onMouseLeave={stopMoving}
                    onTouchStart={() => startMoving(-1)}
                    onTouchEnd={stopMoving}
                    aria-label="Move left"
                    style={{ padding: "12px 16px", borderRadius: 8, background: "#111827", color: "#e5e7eb", border: "none", cursor: "pointer", fontSize: 18 }}
                  >
                    ◀
                  </button>
                  <button
                    onMouseDown={() => startMoving(1)}
                    onMouseUp={stopMoving}
                    onMouseLeave={stopMoving}
                    onTouchStart={() => startMoving(1)}
                    onTouchEnd={stopMoving}
                    aria-label="Move right"
                    style={{ padding: "12px 16px", borderRadius: 8, background: "#111827", color: "#e5e7eb", border: "none", cursor: "pointer", fontSize: 18 }}
                  >
                    ▶
                  </button>
                </div>
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
