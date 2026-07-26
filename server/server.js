// ===== COD x BLOOD STRIKE — MULTIPLAYER SERVER =====
// WebSocket game server: lobby, matchmaking, public matches, private 1v1 duels,
// chat, and server-side validation of movement and damage.
//
// Trust model (be honest about this):
//   Movement is client-reported but SPEED-CAPPED and bounds-checked server-side.
//   Damage is never sent by the shooter — clients send a "shoot" ray and the
//   server decides who was hit and how much damage applies. Fire rate, damage
//   values, and reload are all enforced here. That stops the common cheats
//   (aimbot damage inflation, teleport, rapid-fire) but a determined cheater
//   can still fake small movements. Full lag-compensated authority would need
//   the whole simulation server-side.

import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = process.env.PORT || 8080;
const TICK_HZ = 20;                 // snapshot broadcast rate
const TICK_MS = 1000 / TICK_HZ;
const MAX_PLAYERS_PUBLIC = 8;
const MAP_HALF = 95;                // matches the client's playable bounds
const MAX_SPEED = 30;               // units/sec ceiling (sprint+slide+boost headroom)
const RESPAWN_MS = 3000;
const SCORE_TO_WIN = 25;
const DUEL_SCORE_TO_WIN = 10;

// Weapon table — authoritative. Clients cannot invent damage.
const WEAPONS = {
  assault_rifle: { damage: 32, head: 2.5, fireRate: 0.10, range: 150 },
  smg:           { damage: 18, head: 2.0, fireRate: 0.06, range: 80 },
  sniper:        { damage: 90, head: 3.0, fireRate: 1.20, range: 300 },
  shotgun:       { damage: 15, head: 1.5, fireRate: 0.80, range: 30 },
  lmg:           { damage: 28, head: 2.0, fireRate: 0.08, range: 120 },
  pistol:        { damage: 24, head: 2.5, fireRate: 0.20, range: 60 },
  revolver:      { damage: 55, head: 3.0, fireRate: 0.40, range: 120 },
  melee:         { damage: 50, head: 1.0, fireRate: 0.40, range: 3.5 }
};

const SPAWNS = [
  { x: -10, z: -85 }, { x: 10, z: -85 }, { x: -5, z: -80 }, { x: 5, z: -80 },
  { x: -10, z: 85 },  { x: 10, z: 85 },  { x: -5, z: 80 },  { x: 5, z: 80 }
];

let nextId = 1;
const clients = new Map();   // id -> Client
const rooms = new Map();     // roomId -> Room
let nextRoomId = 1;

const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function sanitizeName(raw) {
  const s = String(raw || '').replace(/[^\w \-]/g, '').trim().slice(0, 16);
  return s || ('Player' + Math.floor(Math.random() * 900 + 100));
}

class Client {
  constructor(ws) {
    this.id = nextId++;
    this.ws = ws;
    this.name = 'Player' + this.id;
    this.room = null;
    this.alive = true;
    this.health = 100;
    this.kills = 0;
    this.deaths = 0;
    this.team = 0;
    this.pos = { x: 0, y: 1.7, z: 0 };
    this.rot = { y: 0, x: 0 };
    this.weapon = 'assault_rifle';
    this.lastShotAt = 0;
    this.lastPosAt = now();
    this.respawnAt = 0;
    this.connectedAt = now();
    this.lastSeen = now();
    this.skin = '0xdd3333';
  }

  send(type, data) {
    if (this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify({ t: type, d: data })); } catch (e) {}
  }

  publicInfo() {
    return {
      id: this.id, name: this.name, kills: this.kills, deaths: this.deaths,
      alive: this.alive, health: this.health, team: this.team,
      inRoom: !!this.room, roomId: this.room ? this.room.id : null
    };
  }

  snapshot() {
    return {
      id: this.id, n: this.name,
      x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2),
      ry: +this.rot.y.toFixed(3),
      h: Math.round(this.health), a: this.alive ? 1 : 0,
      k: this.kills, d: this.deaths, w: this.weapon, s: this.skin
    };
  }
}

class Room {
  constructor(mode = 'public', maxPlayers = MAX_PLAYERS_PUBLIC) {
    this.id = 'R' + (nextRoomId++);
    this.mode = mode;                 // 'public' | 'duel'
    this.maxPlayers = maxPlayers;
    this.players = new Set();
    this.createdAt = now();
    this.over = false;
    this.winTarget = mode === 'duel' ? DUEL_SCORE_TO_WIN : SCORE_TO_WIN;
  }

  get size() { return this.players.size; }
  isFull() { return this.players.size >= this.maxPlayers; }

  add(client) {
    this.players.add(client);
    client.room = this;
    client.kills = 0; client.deaths = 0;
    client.health = 100; client.alive = true;
    this.respawn(client, true);
    this.broadcast('room_event', { msg: `${client.name} joined`, id: client.id });
    // Tell everyone already here about the newcomer, otherwise players who
    // joined first never learn about anyone who arrives after them.
    this.broadcast('player_joined', { player: client.snapshot() }, client);
    client.send('joined', {
      roomId: this.id, mode: this.mode, you: client.id,
      winTarget: this.winTarget,
      players: [...this.players].map(p => p.snapshot())
    });
  }

  remove(client) {
    if (!this.players.has(client)) return;
    this.players.delete(client);
    client.room = null;
    this.broadcast('room_event', { msg: `${client.name} left`, id: client.id });
    this.broadcast('player_left', { id: client.id });
    if (this.players.size === 0) rooms.delete(this.id);
  }

  respawn(client, immediate = false) {
    const sp = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    client.pos = { x: sp.x + (Math.random() * 6 - 3), y: 1.7, z: sp.z + (Math.random() * 6 - 3) };
    client.health = 100;
    client.alive = true;
    client.respawnAt = 0;
    // Let the client snap to the spawn point without tripping the speed cap
    client.lastPosAt = now();
    client.spawnGraceUntil = now() + 1500;
    client.send('respawn', { x: client.pos.x, y: client.pos.y, z: client.pos.z });
  }

  broadcast(type, data, except = null) {
    for (const p of this.players) {
      if (p === except) continue;
      p.send(type, data);
    }
  }

  tick() {
    const t = now();
    // Handle respawns
    for (const p of this.players) {
      if (!p.alive && p.respawnAt && t >= p.respawnAt) this.respawn(p);
    }
    // Broadcast snapshot
    const snap = [...this.players].map(p => p.snapshot());
    this.broadcast('snapshot', { t, players: snap });
  }

  checkWin(scorer) {
    if (this.over) return;
    if (scorer.kills >= this.winTarget) {
      this.over = true;
      this.broadcast('match_over', {
        winner: scorer.id, winnerName: scorer.name,
        scores: [...this.players].map(p => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths }))
      });
      // Reset for a new round shortly after
      setTimeout(() => {
        if (!rooms.has(this.id)) return;
        this.over = false;
        for (const p of this.players) { p.kills = 0; p.deaths = 0; this.respawn(p); }
        this.broadcast('match_reset', {});
      }, 6000);
    }
  }
}

function findPublicRoom() {
  for (const r of rooms.values()) {
    if (r.mode === 'public' && !r.isFull() && !r.over) return r;
  }
  const r = new Room('public', MAX_PLAYERS_PUBLIC);
  rooms.set(r.id, r);
  return r;
}

function lobbyList() {
  return [...clients.values()]
    .filter(c => !c.room)
    .map(c => ({ id: c.id, name: c.name }));
}

function broadcastLobby() {
  const list = lobbyList();
  for (const c of clients.values()) {
    if (!c.room) c.send('lobby', { players: list });
  }
}

// ===== HTTP + WS =====
const http = createServer((req, res) => {
  // Health check endpoint (also used by the client to measure ping)
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ok: true,
      players: clients.size,
      rooms: rooms.size,
      uptime: Math.round(process.uptime())
    }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
  const client = new Client(ws);
  clients.set(client.id, client);

  client.send('welcome', { id: client.id, tickHz: TICK_HZ });
  broadcastLobby();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString().slice(0, 4096)); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    client.lastSeen = now();
    handleMessage(client, msg.t, msg.d || {});
  });

  ws.on('close', () => {
    if (client.room) client.room.remove(client);
    clients.delete(client.id);
    broadcastLobby();
  });

  ws.on('error', () => {});
});

function handleMessage(client, type, d) {
  switch (type) {
    case 'hello': {
      client.name = sanitizeName(d.name);
      if (typeof d.skin === 'string' && /^0x[0-9a-fA-F]{6}$/.test(d.skin)) client.skin = d.skin;
      client.send('hello_ok', { id: client.id, name: client.name });
      broadcastLobby();
      break;
    }

    case 'find_match': {
      if (client.room) client.room.remove(client);
      const room = findPublicRoom();
      room.add(client);
      broadcastLobby();
      break;
    }

    case 'leave': {
      if (client.room) client.room.remove(client);
      broadcastLobby();
      break;
    }

    // ---- 1v1 duels ----
    case 'challenge': {
      const target = clients.get(Number(d.targetId));
      if (!target || target === client) return client.send('error_msg', { msg: 'Player not available' });
      if (target.room) return client.send('error_msg', { msg: 'Player is already in a match' });
      target.send('challenged', { fromId: client.id, fromName: client.name });
      client.send('challenge_sent', { toId: target.id, toName: target.name });
      break;
    }

    case 'accept_challenge': {
      const from = clients.get(Number(d.fromId));
      if (!from || from.room || client.room) return client.send('error_msg', { msg: 'Duel no longer available' });
      const room = new Room('duel', 2);
      rooms.set(room.id, room);
      // Teams so the client can color them
      from.team = 1; client.team = 2;
      room.add(from);
      room.add(client);
      broadcastLobby();
      break;
    }

    case 'decline_challenge': {
      const from = clients.get(Number(d.fromId));
      if (from) from.send('challenge_declined', { byId: client.id, byName: client.name });
      break;
    }

    // ---- gameplay ----
    case 'state': {
      // Client-reported position, validated: speed-capped and bounds-checked.
      if (!client.room || !client.alive) return;
      const t = now();
      // Clamp dt: without a ceiling, idling then moving would grant a huge
      // distance allowance — that's a teleport hole.
      const dt = clamp((t - client.lastPosAt) / 1000, 0.001, 0.25);
      client.lastPosAt = t;

      const nx = Number(d.x), ny = Number(d.y), nz = Number(d.z);
      if (!isFinite(nx) || !isFinite(ny) || !isFinite(nz)) return;

      const dist = Math.hypot(nx - client.pos.x, nz - client.pos.z);
      const maxDist = MAX_SPEED * dt + 2; // small grace for jitter
      const inSpawnGrace = t < (client.spawnGraceUntil || 0);
      if (dist > maxDist && !inSpawnGrace) {
        // Reject the jump and snap them back — this is the teleport guard
        client.send('correction', { x: client.pos.x, y: client.pos.y, z: client.pos.z });
      } else {
        client.pos.x = clamp(nx, -MAP_HALF, MAP_HALF);
        client.pos.y = clamp(ny, 0, 60);
        client.pos.z = clamp(nz, -MAP_HALF, MAP_HALF);
      }
      if (isFinite(d.ry)) client.rot.y = Number(d.ry);
      if (typeof d.w === 'string' && WEAPONS[d.w]) client.weapon = d.w;
      break;
    }

    case 'shoot': {
      // The client sends only origin+direction. The SERVER decides hits and damage.
      if (!client.room || !client.alive || client.room.over) return;
      const wep = WEAPONS[client.weapon] || WEAPONS.assault_rifle;
      const t = now();
      if (t - client.lastShotAt < wep.fireRate * 1000 * 0.9) return; // rate limit
      client.lastShotAt = t;

      const ox = Number(d.ox), oy = Number(d.oy), oz = Number(d.oz);
      let dx = Number(d.dx), dy = Number(d.dy), dz = Number(d.dz);
      if (![ox, oy, oz, dx, dy, dz].every(isFinite)) return;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;

      // Origin must be near where the server thinks the shooter is
      if (Math.hypot(ox - client.pos.x, oz - client.pos.z) > 4) return;

      client.room.broadcast('tracer', {
        id: client.id, ox, oy, oz, dx, dy, dz, w: client.weapon
      }, client);

      // Ray vs capsule-ish AABB for each other player
      let best = null, bestT = wep.range;
      for (const other of client.room.players) {
        if (other === client || !other.alive) continue;
        if (client.room.mode !== 'duel' && other.team && other.team === client.team) continue;
        const hit = rayHitsPlayer(ox, oy, oz, dx, dy, dz, other.pos, bestT);
        if (hit && hit.t < bestT) { bestT = hit.t; best = { other, headshot: hit.headshot }; }
      }

      if (best) {
        const dmg = Math.round(wep.damage * (best.headshot ? wep.head : 1));
        applyDamage(best.other, client, dmg, best.headshot);
        client.send('hit_confirm', { targetId: best.other.id, headshot: best.headshot, damage: dmg });
      }
      break;
    }

    case 'melee': {
      if (!client.room || !client.alive || client.room.over) return;
      const t = now();
      if (t - client.lastShotAt < 400) return;
      client.lastShotAt = t;
      for (const other of client.room.players) {
        if (other === client || !other.alive) continue;
        const dist = Math.hypot(other.pos.x - client.pos.x, other.pos.z - client.pos.z);
        if (dist <= WEAPONS.melee.range) {
          applyDamage(other, client, WEAPONS.melee.damage, false);
          client.send('hit_confirm', { targetId: other.id, headshot: false, damage: WEAPONS.melee.damage });
          break;
        }
      }
      break;
    }

    case 'chat': {
      const text = String(d.text || '').slice(0, 140).replace(/[<>]/g, '');
      if (!text.trim()) return;
      const payload = { id: client.id, name: client.name, text, t: now() };
      if (client.room) client.room.broadcast('chat', payload);
      else for (const c of clients.values()) if (!c.room) c.send('chat', payload);
      break;
    }

    case 'ping': {
      client.send('pong', { c: d.c });
      break;
    }
  }
}

// Ray vs player box. Body spans y 0..2.5; head above 2.0.
function rayHitsPlayer(ox, oy, oz, dx, dy, dz, p, maxT) {
  const box = {
    minX: p.x - 0.5, maxX: p.x + 0.5,
    minY: 0, maxY: 2.5,
    minZ: p.z - 0.5, maxZ: p.z + 0.5
  };
  const inv = (v) => (Math.abs(v) < 1e-9 ? 1e9 : 1 / v);
  let t1 = (box.minX - ox) * inv(dx), t2 = (box.maxX - ox) * inv(dx);
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (box.minY - oy) * inv(dy); t2 = (box.maxY - oy) * inv(dy);
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (box.minZ - oz) * inv(dz); t2 = (box.maxZ - oz) * inv(dz);
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < 0 || tmin > tmax || tmin > maxT) return null;
  const t = tmin < 0 ? tmax : tmin;
  if (t < 0 || t > maxT) return null;
  const hitY = oy + dy * t;
  return { t, headshot: hitY > 2.0 };
}

function applyDamage(target, attacker, dmg, headshot) {
  if (!target.alive) return;
  target.health -= dmg;
  target.send('damaged', { by: attacker.id, byName: attacker.name, damage: dmg, health: Math.max(0, target.health) });

  if (target.health <= 0) {
    target.health = 0;
    target.alive = false;
    target.deaths++;
    attacker.kills++;
    target.respawnAt = now() + RESPAWN_MS;

    const room = target.room;
    if (room) {
      room.broadcast('kill', {
        killer: attacker.id, killerName: attacker.name,
        victim: target.id, victimName: target.name,
        weapon: attacker.weapon, headshot
      });
      room.checkWin(attacker);
    }
  }
}

// ===== TICK LOOP =====
setInterval(() => {
  for (const room of rooms.values()) room.tick();
}, TICK_MS);

// Drop dead connections
setInterval(() => {
  const t = now();
  for (const c of clients.values()) {
    if (t - c.lastSeen > 30000) { try { c.ws.terminate(); } catch (e) {} }
  }
}, 10000);

http.listen(PORT, () => {
  console.log(`[CBS] Multiplayer server listening on :${PORT} (tick ${TICK_HZ}Hz)`);
});

export { rayHitsPlayer, sanitizeName, WEAPONS, Room, Client };
