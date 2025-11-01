#!/usr/bin/env node
/*
  Simple simulated client for the WS relay.
  Usage: node server/sim-client.js --id bot1 --name Bot --ws ws://localhost:8080
*/
const WebSocket = require('ws');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = args[i+1] && !args[i+1].startsWith('--') ? args[++i] : true;
      out[k] = v;
    }
  }
  return out;
}

const argv = parseArgs();
const id = argv.id || argv.player || `bot_${Math.floor(Math.random()*10000)}`;
const name = argv.name || 'Bot';
const photo = argv.photo || '';
const url = argv.ws || process.env.WS_URL || 'ws://localhost:8080';

console.log('[sim-client] connecting', { id, name, url });
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('[sim-client] open');
  // announce join
  ws.send(JSON.stringify({ type: 'join', playerId: id, payload: { name, photo } }));
});

ws.on('message', (m) => {
  try {
    const data = JSON.parse(m.toString());
    // simple log
    // console.log('[sim-client] recv', data.type, data.playerId);
  } catch (e) {}
});

ws.on('close', () => console.log('[sim-client] closed'));
ws.on('error', (e) => console.error('[sim-client] error', e && e.message));

// Simulate paddle movement (back and forth) and a floating ball
let t0 = Date.now() / 1000;
const DESIGN_W = 1280;
const RECT_W = 240;
function paddleXAt(t) {
  const span = DESIGN_W - RECT_W;
  return (Math.sin(t*0.8) * 0.5 + 0.5) * span;
}

function ballAt(t) {
  // simple circular orbit-ish for demo
  const cx = DESIGN_W/2;
  const cy = 300;
  const r = Math.min(200, Math.abs(Math.sin(t*0.6))*180 + 20);
  return { x: cx + Math.cos(t*0.9)*(r), y: cy + Math.sin(t*0.9)*(r/3), r: 18 };
}

const paddleTicker = setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  const t = Date.now() / 1000 - t0;
  const x = Math.round(paddleXAt(t));
  ws.send(JSON.stringify({ type: 'paddle', playerId: id, payload: { paddleX: x } }));
}, 100);

const ballTicker = setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  const t = Date.now() / 1000 - t0;
  const b = ballAt(t);
  ws.send(JSON.stringify({ type: 'ball', playerId: id, payload: { ball: b } }));
}, 120);

process.on('SIGINT', () => {
  clearInterval(paddleTicker);
  clearInterval(ballTicker);
  try { ws.send(JSON.stringify({ type: 'leave', playerId: id, payload: {} })); } catch (e) {}
  ws.close();
  process.exit(0);
});
