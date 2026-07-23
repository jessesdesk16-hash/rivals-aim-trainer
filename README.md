# COD × BLOOD STRIKE

A browser FPS built with [three.js](https://threejs.org/). No build step, no backend — just static files.

**▶ Play:** https://jessesdesk16-hash.github.io/rivals-aim-trainer/

## Features

- **3 maps** — Neon City, Desert Outpost, Abandoned Facility
- **3 modes** — Team Deathmatch, Hardpoint, Elimination (CS2-style rounds)
- **7 weapons** — AK-47, Viper SMG, Thunder Sniper, Pump Shotgun, Heavy LMG, Tactical Pistol, Sheriff revolver
- **Pre-match weapon select** with per-slot skins
- **Melee skins** — fist, boxing gloves, and a one-handed sickle that hooks
- Movement: sprint, slide, slide-jump, double jump, bunny-hop momentum, grenade jumps
- Rebindable controls and a crosshair editor

## Controls

| Key | Action |
| --- | --- |
| `WASD` | Move |
| `Mouse` | Aim |
| `Click` / `Right Click` | Shoot / ADS |
| `Shift` | Sprint |
| `Space` | Jump (double-jump) |
| `C` | Slide |
| `R` | Reload |
| `F` | Melee |
| `G` | Grenade |
| `1` `2` `3` | Switch weapons |
| `B` | Gun spin (Sheriff only) |
| `V` | Gun flip (Sheriff only) |
| `Esc` | Pause |

All keys are rebindable from the Controls menu.

## Running locally

The game uses ES modules, so it needs to be served over HTTP — opening `index.html` directly from disk won't work.

```bash
npx http-server -p 8123 -c-1
```

Then open http://localhost:8123.

## Deploying

Any static host works. The repo is set up for GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

Pointer lock requires HTTPS (or localhost), which GitHub Pages, Netlify, and Vercel all provide by default.
