"use client";

import React, { useEffect, useRef, useState } from "react";
import { getTalkSession } from "@talkjs/core";

export default function ChatPage() {
  const appId = process.env.NEXT_PUBLIC_TALKJS_APP_ID || "";
  const conversationId = "new_conversation"; // match the game page's conversation id

  const sessionRef = useRef<any | null>(null);
  const convRef = useRef<any | null>(null);

  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Array<any>>([]);
  const [buffer, setBuffer] = useState("");

  useEffect(() => {
    return () => {
      try {
        if (sessionRef.current && sessionRef.current.destroy) sessionRef.current.destroy();
      } catch (e) {}
      sessionRef.current = null;
      convRef.current = null;
    };
  }, []);

  async function start(existingId?: string, explicitName?: string) {
    // Allow starting without an explicit display name (viewer mode).
    // If no name is provided, generate a harmless viewer name so the user
    // can silently join just to view the conversation.
    let finalName = ((explicitName ?? name) || "").trim();
    if (!finalName) {
      finalName = `Viewer_${Math.floor(Math.random() * 10000)}`;
    }
    const id = existingId || finalName.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `user_${Math.floor(Math.random() * 10000)}`;
    setUserId(id);
    setName(finalName);

    try {
  // create TalkJS session
  // cast to any to avoid strict type mismatch for host option in local SDK
  const s = getTalkSession({ host: "durhack.talkjs.com", appId, userId: id } as any);
      sessionRef.current = s;
      try {
        s.currentUser.createIfNotExists({ name: finalName });
      } catch (e) {
        console.warn("createIfNotExists failed", e);
      }

      const conv = s.conversation(conversationId);
      conv.createIfNotExists();
      // ensure this user is a participant so realtime events are delivered
      try {
        // Some SDK shapes return a promise; await if possible and log result
        const partAny: any = conv.participant(id);
        if (partAny && typeof partAny.createIfNotExists === 'function') {
          try {
            const res = partAny.createIfNotExists();
            if (res && typeof res.then === 'function') {
              const r = await res;
              console.log('[talk] chat participant.createIfNotExists result', { id, result: r });
            } else {
              console.log('[talk] chat participant.createIfNotExists called (sync)', { id });
            }
          } catch (err) {
            console.warn('[talk] chat participant.createIfNotExists failed', err);
          }
        }
      } catch (e) {
        // some SDK shapes may not support this; ignore
      }
      // record current user info for debugging
      try {
        const s: any = sessionRef.current;
        // eslint-disable-next-line no-console
        console.log('[talk] chat session currentUser', { id: s && s.currentUser && (s.currentUser.id || (s.currentUser as any).userId), raw: s && s.currentUser });
      } catch (e) {}
      convRef.current = conv;
      try {
        // Log the conversation id used on the chat page so we can confirm it
        // matches the main page. Some SDK shapes expose .id or .conversationId.
        // eslint-disable-next-line no-console
  console.log('[talk] chat page conversation id', { conversationId, convId: (conv ? (conv as any).id : undefined) });
      } catch (e) {
        // ignore
      }

      // subscribe to messages
      try {
        const convAny: any = conv;
        if (typeof convAny.subscribe === "function") {
          convAny.subscribe((evt: any) => {
            // Always log raw event for debugging realtime delivery
            console.debug('[talk] chat subscribe raw evt', evt);
            const msg = evt && (evt.message || evt);
            const looksLikeConvMeta = msg && typeof msg === 'object' && ('createdAt' in msg || 'lastMessageAt' in msg) && !('text' in msg) && !('body' in msg) && !('content' in msg) && !('displayText' in msg);
            if (looksLikeConvMeta) {
              console.log('[talk] chat subscribe: conversation-level event', { raw: msg });
              return; // ignore conversation-level updates
            }

            const text = msg && (msg.text || msg.body || msg.content || msg.displayText) || msg;
            const sender = msg && (msg.sender && (msg.sender.id || msg.sender) || msg.from && (msg.from.id || msg.from) || msg.senderId) || 'unknown';
            const id_ = (msg && msg.id) || String(Math.random()).slice(2);
            setMessages((m) => [...m, { id: id_, text, from: sender, raw: msg }]);
          });
        } else if (typeof convAny.on === "function") {
          const cb = (m: any) => {
            const looksLikeConvMeta = m && typeof m === 'object' && ('createdAt' in m || 'lastMessageAt' in m) && !('text' in m) && !('body' in m) && !('content' in m);
            if (looksLikeConvMeta) return;
            const text = m && (m.text || m.body || m.content || m.displayText) || m;
            const sender = m && (m.sender && (m.sender.id || m.sender) || m.from && (m.from.id || m.from) || m.senderId) || 'unknown';
            const id_ = (m && m.id) || String(Math.random()).slice(2);
            setMessages((mm) => [...mm, { id: id_, text, from: sender, raw: m }]);
          };
          convAny.on('message', cb);
        }
      } catch (e) {
        console.warn('subscribe failed', e);
      }

      setStarted(true);
    } catch (e) {
      console.error('TalkJS start failed', e);
    }
  }

  // Auto-start from sessionStorage if a durhack_session is present. This will
  // join the chat as the same user stored by the main page.
  useEffect(() => {
    try {
      if (!appId) return;
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem("durhack_session") : null;
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.id && s.name) {
          // set local name and start using the stored id to ensure we match the
          // main page's identity (avoids creating a different id from the name).
          setName(s.name);
          // start with explicit id and name
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          start(s.id, s.name);
          return;
        }
      }
      // If no saved session exists, auto-join as a viewer (no click required).
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      start();
    } catch (e) {
      // ignore parse errors
    }
  }, []);

  async function send() {
    const conv = convRef.current;
    if (!conv) return;
    const text = (buffer || "").trim();
    if (!text) return setBuffer("");
    try {
      await conv.send(text);
      setMessages((m) => [...m, { id: `local_${Date.now()}`, text, from: userId }]);
    } catch (e) {
      console.error('send failed', e);
    }
    setBuffer("");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Durhack Chat</h1>
      {!appId ? (
        <div style={{ color: 'red' }}>Set NEXT_PUBLIC_TALKJS_APP_ID in your environment to enable the chat.</div>
      ) : !started ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ color: '#444' }}>Join the conversation as a viewer (no name required)</div>
          <button onClick={() => start()}>Join as viewer</button>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 12 }}><strong>Conversation:</strong> {conversationId}</div>
          <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, height: 400, overflow: 'auto', background: '#fff' }}>
            {messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#666' }}>{m.from}</div>
                <div style={{ padding: '6px 8px', background: '#f3f4f6', borderRadius: 6, display: 'inline-block' }}>{typeof m.text === 'object' ? JSON.stringify(m.text) : m.text}</div>
              </div>
            ))}
          </div>
              {/* viewer-only: no message input or send button */}
        </div>
      )}
    </div>
  );
}
