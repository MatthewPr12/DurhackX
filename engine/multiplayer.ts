/* Minimal multiplayer client wrapper using WebSocket.
   - Connects to NEXT_PUBLIC_WS_URL or ws://localhost:8080 by default
   - Sends/receives simple JSON messages:
     { type: 'join'|'paddle'|'ball'|'leave', playerId, payload }
   - Exposes connect(), sendPaddle(), sendBall(), onUpdate(callback), disconnect()
*/

type PlayerUpdate = {
  playerId: string;
  name?: string;
  photo?: string;
  paddleX?: number;
  ball?: { x: number; y: number; vx?: number; vy?: number; r?: number };
  buffer?: string;
  colorIndex?: number;
  left?: boolean;
};

export default function createMultiplayer() {
  let ws: WebSocket | null = null;
  let playerId: string | null = null;
  const callbacks: Array<(msg: PlayerUpdate) => void> = [];

  function url() {
    return (process?.env?.NEXT_PUBLIC_WS_URL as string) || (window && (window as any).__NEXT_PUBLIC_WS_URL) || `ws://localhost:8080`;
  }

  function connect(id: string, name?: string, photo?: string, colorIndex?: number) {
    playerId = id;
    if (ws) return;
    const u = url();
    ws = new WebSocket(u);
    ws.addEventListener('open', () => {
      // announce ourselves
      send({ type: 'join', playerId: id, payload: { name, photo, colorIndex } });
    });
    ws.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!data || !data.type) return;
        // normalize into PlayerUpdate and call callbacks
        const msg: PlayerUpdate = {
          playerId: data.playerId,
          name: data.payload?.name,
          photo: data.payload?.photo,
          paddleX: data.payload?.paddleX,
          ball: data.payload?.ball,
          buffer: data.payload?.buffer,
          colorIndex: data.payload?.colorIndex,
          left: data.type === 'leave',
        };
        for (const cb of callbacks) cb(msg);
      } catch (e) {
        // ignore
      }
    });
    ws.addEventListener('close', () => {
      ws = null;
    });
  }

  function send(obj: any) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      // ignore
    }
  }

  function sendPaddle(x: number) {
    if (!playerId) return;
    send({ type: 'paddle', playerId, payload: { paddleX: x, timestamp: Date.now() } });
  }

  function sendBall(ball: { x: number; y: number; vx?: number; vy?: number; r?: number }) {
    if (!playerId) return;
    send({ type: 'ball', playerId, payload: { ball, timestamp: Date.now() } });
  }

  function sendBuffer(buffer: string) {
    if (!playerId) return;
    send({ type: 'buffer', playerId, payload: { buffer } });
  }

  function onUpdate(cb: (m: PlayerUpdate) => void) {
    callbacks.push(cb);
    return () => {
      const i = callbacks.indexOf(cb);
      if (i >= 0) callbacks.splice(i, 1);
    };
  }

  function disconnect() {
    if (!ws) return;
    try {
      send({ type: 'leave', playerId, payload: {} });
    } catch (e) {}
    ws.close();
    ws = null;
  }

  return { connect, sendPaddle, sendBall, sendBuffer, onUpdate, disconnect };
}
export type MultiplayerClient = ReturnType<typeof createMultiplayer> & { sendBuffer?: (b: string) => void };
