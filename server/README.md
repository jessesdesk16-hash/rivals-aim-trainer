# COD × Blood Strike — Multiplayer Server

WebSocket game server: lobby, public matchmaking, private 1v1 duels, chat, and
server-side validation of movement and damage.

## Run locally

```bash
cd server
npm install
npm start
```

Listens on `:8080`. Health check: http://localhost:8080/health

## Test

With the server running:

```bash
npm test
```

Connects real WebSocket clients and exercises matchmaking, position sync,
combat, anti-cheat guards, kills/respawns, chat, and the 1v1 duel flow.

## Deploying (Render)

This is a **Web Service**, not a Static Site — static hosting cannot run a
server process.

1. Render → New → **Web Service** → point at this repo
2. **Root Directory:** `server`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Deploy, then copy the resulting `wss://<your-app>.onrender.com` URL into the
   game's Settings → Server URL field.

**Cost note:** Render's free Web Service tier sleeps after ~15 minutes idle and
takes ~50s to wake, so the first player into an empty lobby waits. The paid
tier (~$7/mo) stays awake.

`PORT` is supplied by the host automatically; no other env vars are required.

## Trust model — what the anti-cheat actually covers

Enforced server-side:

- **Damage values.** Clients never send damage. They send a shot ray; the
  server does hit detection against its own copy of player positions and
  applies damage from its own weapon table. Faking a damage field does nothing.
- **Fire rate.** Shots faster than the weapon's cooldown are dropped, so
  rapid-fire macros gain nothing.
- **Movement speed and bounds.** Position updates exceeding a speed cap are
  rejected and the player is snapped back; coordinates are clamped to the map.
- **Shot origin.** A shot whose claimed origin is far from the server's idea of
  where the shooter stands is discarded.
- **Chat.** Length-capped and angle brackets stripped.

Not covered (be aware):

- Movement is still client-reported, so small-scale speed/fly cheating within
  the cap is possible. Closing that fully means simulating physics server-side.
- No lag compensation yet, so high-ping players are at a disadvantage on
  fast-moving targets.
- No accounts, so names are not reserved and stats are not authenticated.
