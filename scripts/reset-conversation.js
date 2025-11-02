/* eslint-disable no-console */
// Reset the TalkJS conversation by creating the conversation and
// removing all participants. This script is intended to be run before
// the dev server starts. It will only run if RESET_CONVERSATION_ON_START
// env var is set to '1' or 'true'.

// Prefer the global fetch available in Node 18+. If not available, print
// a helpful error message asking the developer to upgrade Node or install
// `node-fetch`.
const fetch = globalThis.fetch;
if (typeof fetch === 'undefined') {
  console.error('reset-conversation: global fetch is not available in this Node.');
  console.error('Please run on Node 18+ or install node-fetch and adjust the script.');
  process.exit(0);
}
async function main() {
  const enabled = String(process.env.RESET_CONVERSATION_ON_START || '').toLowerCase();
  if (!(enabled === '1' || enabled === 'true')) {
    console.log('reset-conversation: disabled (set RESET_CONVERSATION_ON_START=1 to enable)');
    return;
  }

  const appId = process.env.TALKJS_APP_ID;
  const secret = process.env.TALKJS_SECRET;
  const conv = process.env.TALKJS_CONVERSATION_ID || 'durhack-game';
  if (!appId || !secret) {
    console.error('reset-conversation: TALKJS_APP_ID or TALKJS_SECRET not set; aborting');
    return;
  }

  const auth = 'Basic ' + Buffer.from(`${secret}:`).toString('base64');
  try {
    // Create or replace the conversation resource
    const convUrl = `https://api.talkjs.com/v1/${encodeURIComponent(appId)}/conversations/${encodeURIComponent(conv)}`;
    console.log('reset-conversation: PUT', convUrl);
    const putRes = await fetch(convUrl, { method: 'PUT', headers: { 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: conv }) });
    console.log('reset-conversation: conversation PUT status', putRes.status);

    // Fetch participants
    const partsUrl = `https://api.talkjs.com/v1/${encodeURIComponent(appId)}/conversations/${encodeURIComponent(conv)}/participants`;
    const partsRes = await fetch(partsUrl, { headers: { 'Authorization': auth } });
    const txt = await partsRes.text();
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = txt; }
    if (!partsRes.ok) {
      console.warn('reset-conversation: failed to list participants', partsRes.status, json);
    } else {
      const participants = Array.isArray(json) ? json : (json && json.participants) || [];
      console.log('reset-conversation: current participants', participants.map((p) => p.id || p.personId || p.userId || p.name));
      for (const p of participants) {
        const pid = p.id || p.personId || p.userId || p.name;
        if (!pid) continue;
        const delUrl = `https://api.talkjs.com/v1/${encodeURIComponent(appId)}/conversations/${encodeURIComponent(conv)}/participants/${encodeURIComponent(pid)}`;
        const dres = await fetch(delUrl, { method: 'DELETE', headers: { 'Authorization': auth } });
        console.log('reset-conversation: delete', pid, 'status', dres.status);
      }
    }

    console.log('reset-conversation: done');
  } catch (e) {
    console.error('reset-conversation: error', e && e.message ? e.message : e);
  }
}

main();
