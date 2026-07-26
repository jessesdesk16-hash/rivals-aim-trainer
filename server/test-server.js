// End-to-end test: connects real WebSocket clients and exercises matchmaking,
// combat, server-side damage authority, anti-cheat guards, duels, and chat.
import { WebSocket } from 'ws';

const URL = process.env.TEST_URL || 'ws://localhost:8080';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      inbox.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].type === msg.t) { waiters[i].resolve(msg.d); waiters.splice(i, 1); }
      }
    });
    ws.on('error', reject);
    ws.on('open', () => {
      const api = {
        ws, inbox,
        send: (t, d) => ws.send(JSON.stringify({ t, d: d || {} })),
        wait: (type, ms = 3000) => new Promise((res, rej) => {
          const found = inbox.find(m => m.t === type);
          if (found) return res(found.d);
          const w = { type, resolve: res };
          waiters.push(w);
          setTimeout(() => rej(new Error('timeout waiting for ' + type)), ms);
        }),
        got: (type) => inbox.filter(m => m.t === type).map(m => m.d),
        close: () => ws.close()
      };
      api.send('hello', { name });
      resolve(api);
    });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Walk a client to a position in speed-legal steps (the server rejects teleports,
// so tests must move the way a real client does).
async function moveTo(cl, id, getSnap, x, z, extra = {}) {
  for (let i = 0; i < 60; i++) {
    const snap = getSnap();
    const me = snap && snap.players.find(p => p.id === id);
    const cx = me ? me.x : 0, cz = me ? me.z : 0;
    const dx = x - cx, dz = z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) break;
    const step = Math.min(dist, 2.0); // well under the 30 u/s cap at 100ms
    cl.send('state', { x: cx + (dx / dist) * step, y: 1.7, z: cz + (dz / dist) * step, ry: 0, ...extra });
    await sleep(100);
  }
}

async function run() {
  // ---- connect two players ----
  const a = await connect('Alice');
  const b = await connect('Bob');
  await a.wait('hello_ok');
  await b.wait('hello_ok');
  ok('two clients connect and handshake', true);

  // ---- lobby shows waiting players ----
  await sleep(200);
  const lobby = a.got('lobby').pop();
  ok('lobby lists waiting players', lobby && lobby.players.length >= 2, `${lobby ? lobby.players.length : 0} players`);

  // ---- matchmaking puts both in the same room ----
  a.send('find_match');
  const aJoin = await a.wait('joined');
  b.send('find_match');
  const bJoin = await b.wait('joined');
  ok('matchmaking places both in one room', aJoin.roomId === bJoin.roomId, `room ${aJoin.roomId}`);

  const aId = aJoin.you, bId = bJoin.you;

  // ---- snapshots stream ----
  await sleep(300);
  ok('server streams snapshots', a.got('snapshot').length > 2, `${a.got('snapshot').length} received`);

  // ---- everyone in the room sees everyone (roster completeness) ----
  const aRoster = a.got('player_joined');
  ok('existing players are told when someone joins', aRoster.length >= 1,
    aRoster.length ? `Alice notified of ${aRoster[aRoster.length - 1].player.n}` : 'no player_joined');

  // ---- position sync: walk Alice, Bob should see it ----
  await moveTo(a, aId, () => a.got('snapshot').pop(), 5, 5);
  await sleep(200);
  const snap = b.got('snapshot').pop();
  const aliceInSnap = snap.players.find(p => p.id === aId);
  ok('position syncs to other players', aliceInSnap && Math.hypot(aliceInSnap.x - 5, aliceInSnap.z - 5) < 1.0,
    `at (${aliceInSnap && aliceInSnap.x}, ${aliceInSnap && aliceInSnap.z})`);

  // ---- ANTI-CHEAT: teleport is rejected ----
  a.send('state', { x: 90, y: 1.7, z: 90, ry: 0 });
  const correction = await a.wait('correction', 2000).catch(() => null);
  ok('anti-cheat: teleport rejected + corrected', !!correction, correction ? `snapped back to x=${correction.x.toFixed(1)}` : 'no correction');

  // ---- combat: server computes damage, client cannot dictate it ----
  // Walk them into a known firing line: Alice at origin, Bob 10 ahead on -Z.
  await moveTo(a, aId, () => a.got('snapshot').pop(), 0, 0, { w: 'assault_rifle' });
  await moveTo(b, bId, () => b.got('snapshot').pop(), 0, -10);
  await sleep(200);
  // Fire straight down -Z at Bob's torso. Also send a bogus huge damage field.
  a.send('shoot', { ox: 0, oy: 1.7, oz: 0, dx: 0, dy: 0, dz: -1, damage: 99999 });
  const dmg = await b.wait('damaged', 2000).catch(() => null);
  ok('server-authoritative hit detection', !!dmg, dmg ? `Bob took ${dmg.damage}` : 'no damage event');
  ok('anti-cheat: client damage value ignored', !!dmg && dmg.damage === 32, dmg ? `applied ${dmg.damage} (AR=32), not 99999` : '');

  // ---- ANTI-CHEAT: rapid fire is rate-limited ----
  const beforeHits = b.got('damaged').length;
  for (let i = 0; i < 10; i++) {
    a.send('shoot', { ox: 0, oy: 1.7, oz: 0, dx: 0, dy: 0, dz: -1 });
  }
  await sleep(300);
  const afterHits = b.got('damaged').length;
  ok('anti-cheat: fire rate enforced', afterHits - beforeHits <= 3, `${afterHits - beforeHits} of 10 spam shots landed`);

  // ---- headshot multiplier ----
  await moveTo(b, bId, () => b.got('snapshot').pop(), 0, -6);
  await sleep(600); // let fire-rate cooldown clear
  a.send('shoot', { ox: 0, oy: 2.4, oz: 0, dx: 0, dy: 0, dz: -1 });
  await sleep(250);
  const hits = b.got('damaged');
  const hs = hits[hits.length - 1];
  ok('headshot multiplier applied', hs && hs.damage === 80, hs ? `${hs.damage} damage (32 * 2.5 = 80)` : 'no hit');

  // ---- kill + respawn ----
  for (let i = 0; i < 8; i++) { a.send('shoot', { ox: 0, oy: 2.4, oz: 0, dx: 0, dy: 0, dz: -1 }); await sleep(130); }
  const kill = await a.wait('kill', 3000).catch(() => null);
  ok('kill is registered and broadcast', !!kill, kill ? `${kill.killerName} killed ${kill.victimName}` : 'no kill');
  const resp = await b.wait('respawn', 5000).catch(() => null);
  ok('dead player respawns', !!resp, resp ? `respawned at x=${resp.x.toFixed(1)}` : 'no respawn');

  // ---- chat ----
  a.send('chat', { text: 'gg <script>alert(1)</script>' });
  const chat = await b.wait('chat', 2000).catch(() => null);
  ok('chat delivers between players', !!chat, chat ? `"${chat.text}"` : 'no chat');
  ok('chat strips angle brackets', !!chat && !chat.text.includes('<'), chat ? chat.text : '');

  // ---- ping ----
  const t0 = Date.now();
  a.send('ping', { c: 1 });
  await a.wait('pong', 2000);
  ok('ping/pong round trip', true, `${Date.now() - t0}ms`);

  // ---- 1v1 duel flow ----
  a.send('leave'); b.send('leave');
  await sleep(300);
  const c = await connect('Carol');
  const d = await connect('Dave');
  await c.wait('hello_ok'); await d.wait('hello_ok');
  await sleep(200);
  c.send('challenge', { targetId: (await d.wait('hello_ok')).id });
  const challenged = await d.wait('challenged', 2000).catch(() => null);
  ok('1v1 challenge is delivered', !!challenged, challenged ? `from ${challenged.fromName}` : 'not received');

  if (challenged) {
    d.send('accept_challenge', { fromId: challenged.fromId });
    const cJoin = await c.wait('joined', 2000).catch(() => null);
    const dJoin = await d.wait('joined', 2000).catch(() => null);
    ok('1v1 duel room created for both', !!cJoin && !!dJoin && cJoin.roomId === dJoin.roomId,
      cJoin ? `${cJoin.mode} room ${cJoin.roomId}, target ${cJoin.winTarget}` : '');
    // The first player's join payload only lists themselves (the other hasn't
    // arrived yet) — they learn about the second via player_joined. The real
    // invariant is that the live room ends up holding exactly the two duellists.
    await sleep(300);
    const cSnap = c.got('snapshot').pop();
    ok('duel room holds exactly the 2 duellists', !!cSnap && cSnap.players.length === 2,
      cSnap ? `${cSnap.players.length} in room` : 'no snapshot');
    ok('duel is isolated from the public match', !!cSnap && !cSnap.players.some(p => p.n === 'Alice' || p.n === 'Bob'),
      cSnap ? cSnap.players.map(p => p.n).join(' vs ') : '');
  }

  [a, b, c, d].forEach(x => x.close());
  await sleep(200);

  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

run().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
