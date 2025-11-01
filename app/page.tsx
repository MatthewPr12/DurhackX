"use client";

import { useEffect, useRef, useMemo } from "react";
import { Chatbox, defaultTheme } from "@talkjs/react-components";
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <main className="flex flex-col items-center justify-center gap-6">
        <h1 className="text-4xl font-bold">Hello world</h1>
        <p className="mt-2 text-gray-600">Welcome to the landing page with TalkJS chat.</p>

        {!appId ? (
          <div className="mt-4 text-sm text-red-600">Set NEXT_PUBLIC_TALKJS_APP_ID in your environment to enable the chat.</div>
        ) : (
          <div className="mt-6">
            <Chatbox
              // @ts-ignore
              host="durhack.talkjs.com"
              style={{ width: "400px", height: "600px" }}
              appId={appId}
              userId={userId}
              conversationId={conversationId}
              // apply the basic custom theme
              theme={theme}
            />
          </div>
        )}
      </main>
    </div>
  );
}
