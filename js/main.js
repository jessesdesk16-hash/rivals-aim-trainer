import * as THREE from 'three';
import { World } from './world.js';
import { Player, KeyBinds } from './player.js';
import { WeaponSystem } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { EffectsManager } from './effects.js';
import { Zone } from './zone.js';
import { HUD } from './hud.js';
import { AudioManager } from './audio.js';
import { distance2D, lerp } from './utils.js';

// ===== GAME STATE =====
const State = { MENU: 0, PLAYING: 1, PAUSED: 2, GAMEOVER: 3 };
let gameState = State.MENU;
let kills = 0, shots = 0, hits = 0, killStreak = 0;

let gameMode = 'TDM';
let teamBlueScore = 0;
let teamRedScore = 0;
const MAX_SCORE_TDM = 50;
const MAX_SCORE_HARDPOINT = 150;
let hardpointStatus = '';

let currentLoadout = [
  { id: 0, skin: '0xdd3333' },
  { id: 1, skin: '0x00d0ff' },
  { id: 2, skin: '0x44dd44' }
];

let punchCooldown = 0;
let punchTimer = 0;
let punchDuration = 0.15;
let isPunching = false;
let punchHand = 1; // 1 for right, -1 for left
let activeMeleeSkin = 'DEFAULT';
let respawnTimer = 0;
let roundActive = true;
let roundTimer = 0;
let roundNumber = 0;
let buyPhaseTimer = 0;
const BUY_PHASE_DURATION = 3.0;

// Grenade system
let grenadeCount = 2;
let grenadeCooldown = 0;
const GRENADE_COOLDOWN = 1.5;
const GRENADE_DAMAGE = 40;
const GRENADE_RADIUS = 8;
const GRENADE_BOOST_FORCE = 18;
let activeGrenades = [];

// ===== THREE.JS SETUP =====
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
scene.add(camera);
const clock = new THREE.Clock();

// ===== SYSTEMS =====
const world = new World(scene);
const player = new Player(camera, scene);
const weapons = new WeaponSystem(scene, camera);
const enemies = new EnemyManager(scene);
const effects = new EffectsManager(scene);
const zone = new Zone(scene);
const hud = new HUD();
const audio = new AudioManager();

const fistGroup = new THREE.Group();
fistGroup.position.set(0.4, -0.3, -0.2);
fistGroup.visible = false;
camera.add(fistGroup);

const armMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.07, 0.6, 12),
  new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 })
);
armMesh.rotation.x = Math.PI / 2;
armMesh.position.set(0, 0, 0.3);
fistGroup.add(armMesh);

const fistMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.6 })
);
fistMesh.position.set(0, 0, 0);
fistGroup.add(fistMesh);

// Melee skin assets — built once, swapped in per punch (no per-punch allocation)
const MELEE_ASSETS = {
  DEFAULT: {
    geo: new THREE.SphereGeometry(0.12, 16, 16),
    mat: new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.6 }),
    rot: [0, 0, 0], scale: [1, 0.8, 1.2] // slight fist shape
  },
  BOXING: {
    geo: new THREE.SphereGeometry(0.18, 16, 16),
    mat: new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.8 }),
    rot: [0, 0, 0], scale: [1, 1, 1]
  },
  SICKLE: {
    geo: new THREE.TorusGeometry(0.15, 0.04, 12, 24, Math.PI),
    mat: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 }),
    rot: [0, Math.PI / 2, 0], scale: [1, 1, 1]
  }
};

function applyMeleeSkin(skin) {
  const a = MELEE_ASSETS[skin] || MELEE_ASSETS.DEFAULT;
  fistMesh.geometry = a.geo;
  fistMesh.material = a.mat;
  fistMesh.rotation.set(a.rot[0], a.rot[1], a.rot[2]);
  fistMesh.scale.set(a.scale[0], a.scale[1], a.scale[2]);
}

// Grenade assets — shared, never disposed
const GRENADE_GEO = new THREE.SphereGeometry(0.15, 6, 6);
const GRENADE_MAT = new THREE.MeshBasicMaterial({ color: 0x44aa44 });

// ===== INITIALIZATION =====
world.init();
weapons.init();
zone.init(world.getMapSize());

const collisionBoxes = world.getCollisionBoxes();
const spawnPoints = world.getSpawnPoints();
player.setCollisionBoxes(collisionBoxes);
enemies.setCollisionBoxes(collisionBoxes);
enemies.setSpawnPoints(spawnPoints);

// ===== UI HANDLERS =====
// DEPLOY opens the weapon-select (loadout) screen first — pick your guns, then start
document.getElementById('start-btn').addEventListener('click', () => {
  audio.init();
  audio.playMenuClick();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('loadout-menu').style.display = 'flex';
});

document.getElementById('loadout-deploy-btn').addEventListener('click', () => {
  audio.init();
  audio.playMenuClick();
  document.getElementById('loadout-menu').style.display = 'none';
  startGame();
});

document.getElementById('open-crosshair-btn').addEventListener('click', () => {
  audio.init();
  audio.playMenuClick();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('crosshair-editor').style.display = 'flex';
});

document.getElementById('close-crosshair-btn').addEventListener('click', () => {
  audio.playMenuClick();
  document.getElementById('crosshair-editor').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
});

// Crosshair Editor Inputs
const root = document.documentElement;
document.getElementById('ch-color').addEventListener('input', (e) => root.style.setProperty('--ch-color', e.target.value));
document.getElementById('ch-size').addEventListener('input', (e) => root.style.setProperty('--ch-size', `${e.target.value}px`));
document.getElementById('ch-thick').addEventListener('input', (e) => root.style.setProperty('--ch-thick', `${e.target.value}px`));
document.getElementById('ch-gap').addEventListener('input', (e) => root.style.setProperty('--ch-gap', `${e.target.value}px`));

document.getElementById('open-loadout-btn').addEventListener('click', () => {
  audio.init();
  audio.playMenuClick();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('loadout-menu').style.display = 'flex';
});

document.getElementById('close-loadout-btn').addEventListener('click', () => {
  audio.playMenuClick();
  document.getElementById('loadout-menu').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
});

// Controls Menu Logic
document.getElementById('open-controls-btn').addEventListener('click', () => {
  audio.init();
  audio.playMenuClick();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('controls-menu').style.display = 'flex';
});

document.getElementById('close-controls-btn').addEventListener('click', () => {
  audio.playMenuClick();
  document.getElementById('controls-menu').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
});

let listeningForRebind = null; // Stores action name if waiting for keypress

document.querySelectorAll('.control-row').forEach(row => {
  const btn = row.querySelector('.keybind-btn');
  const action = row.dataset.action;
  
  // Set initial text
  btn.textContent = KeyBinds[action].replace('Key', '').replace('Digit', '');

  btn.addEventListener('click', () => {
    if (listeningForRebind) return;
    audio.playMenuClick();
    listeningForRebind = action;
    btn.textContent = 'PRESS KEY...';
    btn.style.borderColor = '#00ff88';
    
    const onKeyRebind = (e) => {
      e.preventDefault();
      // Ignore escape as it might be used to cancel
      if (e.code === 'Escape') {
        btn.textContent = KeyBinds[action].replace('Key', '').replace('Digit', '');
      } else {
        KeyBinds[action] = e.code;
        btn.textContent = e.code.replace('Key', '').replace('Digit', '');
      }
      btn.style.borderColor = '#ff3e3e';
      listeningForRebind = null;
      document.removeEventListener('keydown', onKeyRebind);
    };
    
    document.addEventListener('keydown', onKeyRebind);
  });
});

document.querySelectorAll('.loadout-slot').forEach(slot => {
  const slotIndex = parseInt(slot.dataset.slot);
  const select = slot.querySelector('.weapon-select');
  select.addEventListener('change', (e) => {
    currentLoadout[slotIndex].id = parseInt(e.target.value);
  });
  const swatches = slot.querySelectorAll('.skin-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      currentLoadout[slotIndex].skin = swatch.dataset.skin;
    });
  });
  const defaultSwatch = Array.from(swatches).find(s => s.dataset.skin === currentLoadout[slotIndex].skin);
  if (defaultSwatch) defaultSwatch.classList.add('selected');
});

document.getElementById('resume-btn')?.addEventListener('click', () => {
  audio.playMenuClick();
  resumeGame();
});

document.getElementById('quit-btn')?.addEventListener('click', () => {
  audio.playMenuClick();
  quitToMenu();
});

document.getElementById('redeploy-btn')?.addEventListener('click', () => {
  audio.playMenuClick();
  hud.hideGameOver();
  startGame();
});

// Pointer lock on canvas click
renderer.domElement.addEventListener('click', () => {
  if (gameState === State.PLAYING && player.isAlive() && !document.pointerLockElement) {
    player.requestPointerLock();
  }
});

// Escape key for pause
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (gameState === State.PLAYING) pauseGame();
    else if (gameState === State.PAUSED) resumeGame();
  }
});

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== GAME FLOW =====
function startGame() {
  gameState = State.PLAYING;
  gameMode = document.getElementById('game-mode-select').value;
  teamBlueScore = 0;
  teamRedScore = 0;
  kills = 0; shots = 0; hits = 0; killStreak = 0;
  respawnTimer = 0;
  roundActive = true;
  roundTimer = 0;
  roundNumber = (gameMode === 'ELIMINATION') ? 1 : 0;
  buyPhaseTimer = (gameMode === 'ELIMINATION') ? BUY_PHASE_DURATION : 0;
  grenadeCount = 2;
  grenadeCooldown = 0;
  activeGrenades = [];

  document.getElementById('main-menu').style.display = 'none';
  hud.show();
  hud.hideGameOver();

  const mapTheme = document.getElementById('map-select').value;
  if (world.mapTheme !== mapTheme) {
    world.clear();
    world.init(mapTheme);
    const newCollisionBoxes = world.getCollisionBoxes();
    const newSpawnPoints = world.getSpawnPoints();
    player.setCollisionBoxes(newCollisionBoxes);
    enemies.setCollisionBoxes(newCollisionBoxes);
    enemies.setSpawnPoints(newSpawnPoints);
  }

  const sp = world.getSpawnPoints()[Math.floor(Math.random() * world.getSpawnPoints().length)];
  player.init(sp);
  player.requestPointerLock();

  enemies.clear();
  zone.start(gameMode);
  world.respawnPickups();

  // Build and reset weapons
  weapons.buildWeapons(currentLoadout);
  weapons.weapons.forEach(w => {
    w.ammo = w.maxAmmo;
    w.reserve = w.type === 'sniper' ? 25 : w.type === 'smg' ? 210 : w.type === 'lmg' ? 300 : w.type === 'shotgun' ? 40 : w.type === 'revolver' ? 36 : 150;
  });
  weapons.switchWeapon(0);

  // Update HUD slot labels to match the picked loadout
  const SHORT_NAMES = ['AK', 'SMG', 'SNP', 'SG', 'LMG', 'PST', 'SHF'];
  const slotEls = document.querySelectorAll('#weapon-slots .weapon-slot');
  slotEls.forEach((el, i) => {
    if (currentLoadout[i]) el.innerHTML = `<span class="slot-key">${i + 1}</span>${SHORT_NAMES[currentLoadout[i].id] || '?'}`;
  });

  // Scale bot difficulty by how many matches the player has won (persists across sessions)
  enemies.setDifficulty(getGamesWon());

  const teamSize = parseInt(document.getElementById('team-size-select').value);
  enemies.spawnBots(teamSize - 1, teamSize);
}

// ===== PROGRESSION =====
function getGamesWon() {
  const n = parseInt(localStorage.getItem('cbs_gamesWon') || '0', 10);
  return isNaN(n) ? 0 : n;
}
function addGameWon() {
  const n = getGamesWon() + 1;
  localStorage.setItem('cbs_gamesWon', String(n));
  return n;
}
function didPlayerWin() {
  if (gameMode === 'ELIMINATION') return teamBlueScore >= 5;
  if (gameMode === 'HARDPOINT') return teamBlueScore >= MAX_SCORE_HARDPOINT;
  return teamBlueScore >= MAX_SCORE_TDM;
}
function updateCombatLevel() {
  const el = document.getElementById('combat-level');
  if (!el) return;
  const wins = getGamesWon();
  el.textContent = wins > 0 ? `COMBAT LEVEL ${wins} · ${wins} WIN${wins === 1 ? '' : 'S'}` : 'COMBAT LEVEL 0 · ROOKIE';
}
updateCombatLevel();

function pauseGame() {
  gameState = State.PAUSED;
  document.getElementById('pause-menu').style.display = 'flex';
  document.exitPointerLock();
}

function resumeGame() {
  gameState = State.PLAYING;
  document.getElementById('pause-menu').style.display = 'none';
  player.requestPointerLock();
}

function quitToMenu() {
  gameState = State.MENU;
  document.getElementById('pause-menu').style.display = 'none';
  hud.hide();
  document.getElementById('main-menu').style.display = 'flex';
  enemies.clear();
  document.exitPointerLock();
}

function gameOver() {
  gameState = State.GAMEOVER;
  document.exitPointerLock();

  const won = didPlayerWin();
  let winCount = getGamesWon();
  if (won) {
    winCount = addGameWon();
    audio.playKillStreak && audio.playKillStreak();
  }
  updateCombatLevel();

  hud.showGameOver({ kills, wave: Math.floor(teamBlueScore), shots, hits, won, winCount });
}

// ===== GAME LOOP =====
function gameLoop() {
  requestAnimationFrame(gameLoop);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (gameState === State.PLAYING) {
    // Player Respawn Logic
    if (!player.isAlive()) {
       if (gameMode !== 'ELIMINATION') {
          respawnTimer -= delta;
          if (respawnTimer <= 0) {
             const sp = world.getSpawnPoints()[Math.floor(Math.random() * world.getSpawnPoints().length)];
             player.reset(sp);
             player.requestPointerLock();
             weapons.weapons.forEach(w => { w.ammo = w.maxAmmo; });
          }
       }
    } else {
       player.update(delta);
    }

    // Elimination Round Logic
    if (gameMode === 'ELIMINATION') {
       // Buy phase freeze
       if (buyPhaseTimer > 0) {
          buyPhaseTimer -= delta;
          // Don't process combat during buy phase
       } else {
          let blueAlive = player.isAlive() ? 1 : 0;
          let redAlive = 0;
          for (const e of enemies.getEnemies()) {
            if (e.alive) {
              if (e.team === 1) blueAlive++;
              else redAlive++;
            }
          }

          if (roundActive && (blueAlive === 0 || redAlive === 0)) {
             roundActive = false;
             roundTimer = 3.0;
             if (blueAlive > 0) teamBlueScore++;
             else if (redAlive > 0) teamRedScore++;
             
             if (teamBlueScore >= 5 || teamRedScore >= 5) {
                hud.showKillFeed('MATCH OVER', null, null, false);
             } else {
                hud.showKillFeed(`ROUND ${roundNumber} - ${blueAlive > 0 ? 'BLUE' : 'RED'} WINS`, null, null, false);
             }
          }

          if (!roundActive) {
             roundTimer -= delta;
             if (roundTimer <= 0) {
                if (teamBlueScore >= 5 || teamRedScore >= 5) {
                   gameOver();
                } else {
                   roundActive = true;
                   roundNumber++;
                   buyPhaseTimer = BUY_PHASE_DURATION;
                   grenadeCount = 2;
                   activeGrenades = [];
                   const sp = world.getSpawnPoints()[Math.floor(Math.random() * world.getSpawnPoints().length)];
                   player.reset(sp);
                   player.requestPointerLock();
                   weapons.weapons.forEach(w => { w.ammo = w.maxAmmo; });
                   const teamSize = parseInt(document.getElementById('team-size-select').value);
                   enemies.clear();
                   enemies.spawnBots(teamSize - 1, teamSize);
                }
             }
          }
       }
    }

    // Weapon input
    if (player.isAlive()) {
      if (player.getRightMouseDown()) weapons.startADS();
      else weapons.stopADS();

      // Weapon switching — keys
      if (player.keys[KeyBinds.wep1]) weapons.switchWeapon(0);
      if (player.keys[KeyBinds.wep2]) weapons.switchWeapon(1);
      if (player.keys[KeyBinds.wep3]) weapons.switchWeapon(2);

      // Sheriff gun spin (hold to keep twirling)
      if (player.keys[KeyBinds.spin]) weapons.startSpin();

      // Sheriff toss-flip (hold to keep flipping)
      if (player.keys[KeyBinds.flip]) weapons.startFlip();

      // Weapon switching — scroll wheel
      if (player.getScrollDelta) {
        const scroll = player.getScrollDelta();
        if (scroll !== 0) {
          let newIndex = weapons.getCurrentIndex() + (scroll > 0 ? 1 : -1);
          if (newIndex < 0) newIndex = 2;
          if (newIndex > 2) newIndex = 0;
          weapons.switchWeapon(newIndex);
        }
      }

      // Grenade (G key)
      if (grenadeCooldown > 0) grenadeCooldown -= delta;
      if (player.keys['KeyG'] && grenadeCount > 0 && grenadeCooldown <= 0) {
        grenadeCount--;
        grenadeCooldown = GRENADE_COOLDOWN;
        const pos = player.getPosition();
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const grenadeVel = dir.clone().multiplyScalar(25);
        grenadeVel.y += 8; // arc upward
        
        const grenadeMesh = new THREE.Mesh(GRENADE_GEO, GRENADE_MAT);
        grenadeMesh.position.copy(pos);
        scene.add(grenadeMesh);
        
        activeGrenades.push({
          mesh: grenadeMesh,
          velocity: grenadeVel,
          timer: 1.5, // 1.5s fuse
          position: grenadeMesh.position
        });
        audio.playShoot('pistol');
      }

      // Shooting
      if (player.getMouseDown()) {
        const shot = weapons.shoot(true);
        if (shot) {
          shots++;
          const pos = player.getPosition();
          audio.playShoot(shot.type);
          effects.muzzleFlash(pos.clone().add(shot.direction.clone().multiplyScalar(1)), shot.direction);

          const pelletCount = shot.type === 'shotgun' ? 8 : 1;
          
          for (let i = 0; i < pelletCount; i++) {
            let dir = shot.direction.clone();
            if (pelletCount > 1) {
              dir.x += (Math.random() - 0.5) * shot.spread;
              dir.y += (Math.random() - 0.5) * shot.spread;
              dir.normalize();
            }

            // Raycast for hit detection, ignore team 1
            const hitResult = enemies.checkHit(pos, dir, shot.range, 1);
            if (hitResult.hit) {
              hits++;
              const dmg = hitResult.headshot ? shot.damage * shot.headMultiplier : shot.damage;
              enemies.damageEnemy(hitResult.enemy, dmg);
              effects.bloodEffect(hitResult.point);
              effects.bulletTracer(pos, hitResult.point);

              if (hitResult.headshot) {
                audio.playHeadshot();
                hud.showHitMarker(true);
              } else {
                audio.playHit();
                hud.showHitMarker(false);
              }

              if (!hitResult.enemy.alive) {
                kills++;
                killStreak++;
                audio.playKillHype();
                if (gameMode === 'TDM') {
                   teamBlueScore++;
                   if (teamBlueScore >= MAX_SCORE_TDM) gameOver();
                }

                const weaponName = weapons.getCurrentWeapon().name;
                const hs = hitResult.headshot ? ' [HEADSHOT]' : '';
                hud.showKillFeed('Me', 'Enemy', weaponName, hitResult.headshot);

                // Kill streaks
                if (killStreak === 5) { hud.showKillStreak('UAV ONLINE'); audio.playKillStreak(); }
                else if (killStreak === 10) { hud.showKillStreak('AIRSTRIKE READY'); audio.playKillStreak(); }
                else if (killStreak === 15) { hud.showKillStreak('UNSTOPPABLE'); audio.playKillStreak(); }
                else if (killStreak === 20) { hud.showKillStreak('NUCLEAR'); audio.playKillStreak(); }
              }
            } else {
              // Bullet impact on world
              const impactPos = pos.clone().add(dir.clone().multiplyScalar(shot.range * 0.5));
              effects.bulletTracer(pos, impactPos);
            }
          }
        }
      } else {
        weapons.resetShotFlag();
      }

      // Melee
      if (punchCooldown > 0) punchCooldown -= delta;
      
      if (player.keys[KeyBinds.melee] && punchCooldown <= 0 && !isPunching) {
        isPunching = true;
        activeMeleeSkin = document.getElementById('melee-select').value;
        const isSickle = activeMeleeSkin === 'SICKLE';
        punchDuration = isSickle ? 0.25 : 0.15; // sickle hook is a wider, slightly slower swing
        punchTimer = punchDuration;
        punchCooldown = isSickle ? 0.5 : 0.4;
        applyMeleeSkin(activeMeleeSkin);

        if (isSickle) {
          punchHand = 1; // sickle is one-handed — always the right hand
          fistGroup.position.set(0.5, -0.3, -0.25);
        } else {
          punchHand *= -1; // fists alternate hands
          fistGroup.position.set(0.4 * punchHand, -0.3, -0.2);
        }
        fistGroup.rotation.set(0, 0, 0);
        fistGroup.visible = true;
        weapons.weaponGroup.visible = false;
        audio.playHit();

        const pos = player.getPosition();
        const dir = new THREE.Vector3(0, 0, -1);
        dir.applyQuaternion(camera.quaternion);
        
        const hitResult = enemies.checkHit(pos, dir, 3.0, 1);
        if (hitResult.hit) {
          enemies.damageEnemy(hitResult.enemy, 50);
          effects.bloodEffect(hitResult.point);
          audio.playHit();
          hud.showHitMarker(false);
          if (!hitResult.enemy.alive) {
             kills++;
             killStreak++;
             audio.playKillHype();
             if (gameMode === 'TDM') {
                 teamBlueScore++;
                 if (teamBlueScore >= MAX_SCORE_TDM) gameOver();
             }
             hud.showKillFeed('Me', 'Enemy', 'MELEE', false);
          }
        }
      }

      if (isPunching) {
        punchTimer -= delta;
        const p = Math.max(0, 1.0 - (punchTimer / punchDuration)); // 0.0 to 1.0 progress

        if (activeMeleeSkin === 'SICKLE') {
          // One-handed hook: the blade sweeps in an arc from the right, across the body
          if (p < 0.45) { // Swing
            const t = p / 0.45;
            const arc = Math.sin(t * Math.PI); // bulges outward mid-swing
            fistGroup.position.x = lerp(0.6, -0.45, t);
            fistGroup.position.z = lerp(-0.25, -0.45, t) - arc * 0.35;
            fistGroup.position.y = -0.3 + arc * 0.06;
            fistGroup.rotation.y = lerp(-0.7, 1.9, t); // wrist whips through the hook
            fistGroup.rotation.z = lerp(0, -0.5, t);
          } else { // Recover
            const t = (p - 0.45) / 0.55;
            const easeOut = 1 - Math.pow(1 - t, 3);
            fistGroup.position.x = lerp(-0.45, 0.5, easeOut);
            fistGroup.position.z = lerp(-0.45, -0.25, easeOut);
            fistGroup.position.y = lerp(-0.3, -0.3, easeOut);
            fistGroup.rotation.y = lerp(1.9, 0, easeOut);
            fistGroup.rotation.z = lerp(-0.5, 0, easeOut);
          }
        } else {
          // Straight punch (fists / boxing gloves)
          const startX = 0.4 * punchHand;
          const endX = 0.1 * punchHand;
          const rotY = (Math.PI / 3) * punchHand;

          // Fast strike outward, slower pull back
          if (p < 0.35) { // Strike
             const t = p / 0.35;
             fistGroup.position.z = lerp(-0.2, -0.85, t);
             fistGroup.position.x = lerp(startX, endX, t); // cross center
             fistGroup.rotation.y = lerp(0, rotY, t); // twist wrist
             fistGroup.rotation.x = lerp(0, -Math.PI / 8, t);
          } else { // Retract
             const t = (p - 0.35) / 0.65;
             // Add easing out for retraction
             const easeOut = 1 - Math.pow(1 - t, 3);
             fistGroup.position.z = lerp(-0.85, -0.2, easeOut);
             fistGroup.position.x = lerp(endX, 0.4 * punchHand, easeOut); // retract back to rest
             fistGroup.rotation.y = lerp(rotY, 0, easeOut);
             fistGroup.rotation.x = lerp(-Math.PI / 8, 0, easeOut);
          }
        }

        if (punchTimer <= 0) {
          isPunching = false;
        }
      }

      // If F is held, keep the melee weapon out (even when resting between swings)
      if (!isPunching) {
         if (player.keys[KeyBinds.melee]) {
             fistGroup.visible = true;
             weapons.weaponGroup.visible = false;
             // Set to rest position
             if (activeMeleeSkin === 'SICKLE') {
               fistGroup.position.set(0.5, -0.3, -0.25); // held in the right hand
             } else {
               fistGroup.position.set(0.4 * punchHand, -0.3, -0.2);
             }
             fistGroup.rotation.set(0, 0, 0);
         } else {
             fistGroup.visible = false;
             weapons.weaponGroup.visible = true;
         }
      }
    }

    // Reload key — play the sound only when a reload actually starts
    if (player.isAlive() && player.keys[KeyBinds.reload]) {
      if (weapons.reload()) audio.playReload();
    }
    if (player.isAlive()) {
      weapons.update(delta, player.isMoving(), player.getIsSprinting());
    }

    // Enemies
    const playerInfo = { position: player.getPosition(), alive: player.isAlive(), team: 1 };
    const hpPos = gameMode === 'HARDPOINT' ? zone.getCenter() : null;
    const enemyDamages = enemies.update(delta, playerInfo, hpPos, gameMode);

    for (const d of enemyDamages) {
      if (d.target === 'player') {
        player.takeDamage(d.damage);
        hud.showDamageIndicator();

        if (d.source) {
          const playerPos = player.getPosition();
          const dx = d.source.position.x - playerPos.x;
          const dz = d.source.position.z - playerPos.z;
          const angleToEnemy = Math.atan2(dx, -dz);
          const relativeAngle = angleToEnemy - player.getEuler().y;
          hud.showDirectionalDamage(relativeAngle);
        }

        audio.playDamage();
        if (!player.isAlive()) {
          killStreak = 0;
          respawnTimer = 3.0; // Wait 3s before respawning
          if (gameMode === 'TDM') {
             teamRedScore++;
             if (teamRedScore >= MAX_SCORE_TDM) gameOver();
          }
          hud.showKillFeed('Enemy', 'Me', (d.source && d.source.weaponName) || 'UNKNOWN', false);
        }
      } else if (d.target) {
        // Bot hit another bot
        enemies.damageEnemy(d.target, d.damage);
        if (!d.target.alive && d.target.deathTimer === 0) {
           // Score for TDM
           if (gameMode === 'TDM') {
              if (d.source.team === 1) teamBlueScore++;
              else teamRedScore++;
              
              if (teamBlueScore >= MAX_SCORE_TDM || teamRedScore >= MAX_SCORE_TDM) gameOver();
           }
        }
      }
    }

    // Zone & Hardpoint logic
    zone.update(delta);
    if (gameMode === 'HARDPOINT') {
       let blueIn = 0, redIn = 0;
       const hc = zone.getCenter();
       
       if (player.isAlive() && distance2D(player.getPosition().x, player.getPosition().z, hc.x, hc.z) <= 15) {
          blueIn++;
       }
       for (const e of enemies.getEnemies()) {
          if (e.alive && distance2D(e.position.x, e.position.z, hc.x, hc.z) <= 15) {
             if (e.team === 1) blueIn++;
             else redIn++;
          }
       }

       if (blueIn > 0 && redIn === 0) {
          teamBlueScore += delta;
          hardpointStatus = 'BLUE CONTROL';
          zone.setHardpointColor(0x00d0ff);
       } else if (redIn > 0 && blueIn === 0) {
          teamRedScore += delta;
          hardpointStatus = 'RED CONTROL';
          zone.setHardpointColor(0xff3e3e);
       } else if (blueIn > 0 && redIn > 0) {
          hardpointStatus = 'CONTESTED';
          zone.setHardpointColor(0xffaa00);
       } else {
          hardpointStatus = 'EMPTY';
          zone.setHardpointColor(0xaaaaaa);
       }

       if (teamBlueScore >= MAX_SCORE_HARDPOINT || teamRedScore >= MAX_SCORE_HARDPOINT) {
          gameOver();
       }
    }

    // Pickup collection
    if (player.isAlive()) {
      const playerPos = player.getPosition();
      const pickups = world.getPickups();
      for (const p of pickups) {
        if (!p.active) continue;
        if (distance2D(playerPos.x, playerPos.z, p.position.x, p.position.z) < 2) {
          if (p.type === 'health' && player.getHealth() < 100) {
            player.heal(30);
            world.collectPickup(p);
            audio.playPickup();
            hud.showKillFeed('+ Health restored');
          } else if (p.type === 'armor' && player.getArmor() < 100) {
            player.addArmor(25);
            world.collectPickup(p);
            audio.playPickup();
            hud.showKillFeed('+ Armor acquired');
          } else if (p.type === 'ammo') {
            weapons.addAmmo(30);
            world.collectPickup(p);
            audio.playPickup();
            hud.showKillFeed('+ Ammo resupplied');
          }
        }
      }
    }

    // Effects
    effects.update(delta);
    world.update(delta);

    // Grenade physics
    for (let i = activeGrenades.length - 1; i >= 0; i--) {
      const g = activeGrenades[i];
      g.timer -= delta;
      g.velocity.y -= 20 * delta; // gravity
      g.position.x += g.velocity.x * delta;
      g.position.y += g.velocity.y * delta;
      g.position.z += g.velocity.z * delta;
      
      // Bounce off ground
      if (g.position.y <= 0.15) {
        g.position.y = 0.15;
        g.velocity.y *= -0.3;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
      }
      
      if (g.timer <= 0) {
        // EXPLODE
        effects.explosion(g.position.clone(), 1.2);
        audio.playExplosion ? audio.playExplosion() : audio.playShoot('shotgun');
        
        // Damage enemies
        for (const e of enemies.getEnemies()) {
          if (!e.alive) continue;
          const dist = distance2D(g.position.x, g.position.z, e.position.x, e.position.z);
          if (dist < GRENADE_RADIUS) {
            const falloff = 1 - (dist / GRENADE_RADIUS);
            enemies.damageEnemy(e, GRENADE_DAMAGE * falloff);
            if (!e.alive) {
              kills++; killStreak++;
              if (gameMode === 'TDM') { teamBlueScore++; if (teamBlueScore >= MAX_SCORE_TDM) gameOver(); }
              hud.showKillFeed('Me', 'Enemy', 'GRENADE', false);
            }
          }
        }
        
        // Grenade jump — boost player if close
        if (player.isAlive()) {
          const playerPos = player.getPosition();
          const dist = distance2D(g.position.x, g.position.z, playerPos.x, playerPos.z);
          if (dist < GRENADE_RADIUS) {
            const falloff = 1 - (dist / GRENADE_RADIUS);
            // Self-damage reduced to 30%
            player.takeDamage(GRENADE_DAMAGE * falloff * 0.3);
            // Apply boost force — this is the grenade jump!
            if (player.applyExplosionForce) {
              player.applyExplosionForce(g.position.clone(), GRENADE_BOOST_FORCE * falloff);
            }
          }
        }
        
        scene.remove(g.mesh);
        activeGrenades.splice(i, 1);
      }
    }

    // HUD update
    const w = weapons.getCurrentWeapon();
    const playerPos = player.getPosition();
    hud.update({
      health: player.getHealth(), maxHealth: 100,
      armor: player.getArmor(), maxArmor: 100,
      ammo: w.ammo, maxAmmo: w.maxAmmo, reserve: w.reserve,
      weaponName: w.name, weaponIndex: weapons.getCurrentIndex(),
      isReloading: weapons.isReloading, isADS: weapons.isADS(),
      spread: weapons.isADS() ? 4 : 12 + (player.getIsSprinting() ? 8 : 0),
      kills,
      blueScore: Math.floor(teamBlueScore),
      redScore: Math.floor(teamRedScore),
      hardpointStatus,
      gameMode,
      zoneActive: zone.active,
      zoneTimer: zone.getPhaseTimer(),
      zoneShrinking: zone.isShrinkingNow(),
      inZone: zone.isInZone(playerPos),
      playerPos: { x: playerPos.x, z: playerPos.z },
      playerRotation: player.getEuler().y,
      enemies: enemies.getEnemies(),
      hardpointPos: gameMode === 'HARDPOINT' ? zone.getCenter() : null,
      hardpointColor: zone.zoneMesh ? `#${zone.zoneMesh.material.color.getHexString()}` : null,
      mapSize: world.getMapSize(),
      delta,
      roundNumber,
      roundActive,
      buyPhaseTimer: Math.ceil(buyPhaseTimer),
      grenadeCount,
      isSliding: player.getIsSliding()
    });
  }

  // Render
  renderer.render(scene, camera);
}

// Start the loop
gameLoop();
