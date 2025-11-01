import React, { useState } from "react";
import { defaultTheme } from "@talkjs/react-components";

// Reusable Avatar component used both by the theme and by the game UI.
// It mirrors the defensive behavior used previously: prefer TalkJS theme's
// Avatar when given a photo URL, otherwise fall back to a simple initials
// circle. We keep this component independent so it can be used in the
// TalkJS theme or in other UI locations (game ball rendering).
export function Avatar({ name, src, size = 48 }: { name: string; src?: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [imgFailed, setImgFailed] = useState(false);

  try {
    const { Avatar: TalkAvatar } = defaultTheme as any;
    if (TalkAvatar && src && !imgFailed) {
      // TalkAvatar expects photoUrl prop in the TalkJS theme
      return <TalkAvatar photoUrl={src} /> as any;
    }
  } catch (e) {
    // ignore and fall back to local rendering
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

// Chat header theme component — uses the default ConversationImage where
// possible so visuals match the TalkJS UI. The theme can be passed into
// TalkJS React components (Chatbox) as the `theme` prop per the SDK docs.
export function MyChatHeader(props: any) {
  const { ConversationImage } = defaultTheme as any;
  return (
    <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      {/* Use the default conversation image for avatar when available */}
      {ConversationImage ? (
        <ConversationImage common={props.common} conversation={props.common.conversation} participants={props.common.participants} />
      ) : null}
      <div>
        <div style={{ fontWeight: 700 }}>Custom Chat</div>
        <div style={{ fontSize: 12, color: "#666" }}>Durhack demo theme</div>
      </div>
    </div>
  );
}

// Theme object that can be passed to TalkJS React components. You can add
// more overrides (MessageBubble, ConversationListItem, etc.) as needed.
export const durhackTheme = {
  ChatHeader: MyChatHeader,
  // keep other defaults by not overriding them — consumers can merge if desired
};

export default durhackTheme;
