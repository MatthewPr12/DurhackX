/* Multiplayer shim (WebSocket removed)
   - This file preserves the same API surface used by the app but removes the
     WebSocket dependency in favor of the HTTP join/leave service and TalkJS.
   - connect() will POST /join to get an assigned colorIndex. Remote realtime
     updates are intentionally not implemented here because the app uses
     TalkJS conversations / webhooks for cross-client messaging.
*/

type PlayerUpdate = {
  playerId: string;
  name?: string;
  photo?: string;
  paddleX?: number;
  ball?: { x: number; y: number; vx?: number; vy?: number; r?: number; spawned?: boolean };
  buffer?: string;
  colorIndex?: number;
  left?: boolean;
};

export default function createMultiplayer() {
  let playerId: string | null = null;
  const callbacks: Array<(msg: PlayerUpdate) => void> = [];

  async function connect(id: string, name?: string, photo?: string) {
    // simplified local-only connect: preserve API surface but do not contact
    // any external join service. Notify callbacks that we've connected.
    playerId = id;
    const msg: PlayerUpdate = { playerId: id, name, photo };
    for (const cb of callbacks) cb(msg);
    return { ok: true };
  }

  // No-op: paddle/ball/buffer messages are local-only in the TalkJS model.
  function sendPaddle(_x: number) { /* local-only; do nothing */ }
  function sendBall(_b: { x: number; y: number; vx?: number; vy?: number; r?: number }) { /* no-op */ }
  function sendBuffer(_buffer: string) { /* no-op */ }

  function onUpdate(cb: (m: PlayerUpdate) => void) {
    callbacks.push(cb);
    return () => {
      const i = callbacks.indexOf(cb);
      if (i >= 0) callbacks.splice(i, 1);
    };
  }

  async function disconnect() {
    if (!playerId) return;
    // no external leave call when running client-only
    const msg: PlayerUpdate = { playerId, left: true };
    for (const cb of callbacks) cb(msg);
    playerId = null;
  }

  return { connect, sendPaddle, sendBall, sendBuffer, onUpdate, disconnect };
}

export type MultiplayerClient = ReturnType<typeof createMultiplayer> & { sendBuffer?: (b: string) => void };
