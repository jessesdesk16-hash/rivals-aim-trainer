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
let isPunching = false;
let respawnTimer = 0;

// ===== THREE.JS SETUP =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
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

const fistMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.6 });
const fistMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), fistMat);
fistMesh.position.set(0.3, -0.2, -0.2);
fistMesh.visible = false;
camera.add(fistMesh);

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
document.getElementById('start-btn').addEventListener('click', () => {
  audio.init();
  audio.playMenuClick();
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

  document.getElementById('main-menu').style.display = 'none';
  hud.show();
  hud.hideGameOver();

  const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
  player.init(sp);
  player.requestPointerLock();

  enemies.clear();
  zone.start(gameMode);
  world.respawnPickups();

  // Build and reset weapons
  weapons.buildWeapons(currentLoadout);
  weapons.weapons.forEach(w => { 
    w.ammo = w.maxAmmo; 
    w.reserve = w.type === 'sniper' ? 25 : w.type === 'smg' ? 210 : w.type === 'lmg' ? 300 : w.type === 'shotgun' ? 40 : 150; 
  });
  weapons.switchWeapon(0);

  // Spawn 4 teammates (Blue), 5 enemies (Red)
  enemies.spawnBots(4, 5);
}

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
  // stats object needs to match hud.js expectations
  hud.showGameOver({ kills, wave: Math.floor(teamBlueScore), shots, hits });
}

// ===== GAME LOOP =====
function gameLoop() {
  requestAnimationFrame(gameLoop);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (gameState === State.PLAYING) {
    // Player Respawn Logic
    if (!player.isAlive()) {
       respawnTimer -= delta;
       if (respawnTimer <= 0) {
          const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
          player.reset(sp);
          player.requestPointerLock();
          weapons.weapons.forEach(w => { w.ammo = w.maxAmmo; });
       }
    } else {
       player.update(delta);
    }

    // Weapon input
    if (player.isAlive()) {
      if (player.getRightMouseDown()) weapons.startADS();
      else weapons.stopADS();

      // Weapon switching
      if (player.keys[KeyBinds.wep1]) weapons.switchWeapon(0);
      if (player.keys[KeyBinds.wep2]) weapons.switchWeapon(1);
      if (player.keys[KeyBinds.wep3]) weapons.switchWeapon(2);
      if (player.keys[KeyBinds.reload]) weapons.reload();

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
                hud.showKillFeed(`☠ Enemy eliminated with ${weaponName}${hs}`);

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
        punchTimer = 0.3;
        punchCooldown = 1.0;
        fistMesh.visible = true;
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
             hud.showKillFeed(`☠ Enemy eliminated with MELEE`);
          }
        }
      }

      if (isPunching) {
        punchTimer -= delta;
        if (punchTimer > 0.15) {
           fistMesh.position.z = lerp(-0.2, -0.7, (0.3 - punchTimer) / 0.15);
        } else {
           fistMesh.position.z = lerp(-0.7, -0.2, (0.15 - punchTimer) / 0.15);
        }
        if (punchTimer <= 0) {
          isPunching = false;
          fistMesh.visible = false;
          weapons.weaponGroup.visible = true;
        }
      }
    }

    // Reload key
    if (player.isAlive() && player.keys[KeyBinds.reload]) {
      weapons.reload();
      if (weapons.isReloading) audio.playReload();
    }
    if (player.isAlive()) {
      weapons.update(delta, player.isMoving(), player.getIsSprinting());
    }

    // Enemies
    const playerInfo = { position: player.getPosition(), alive: player.isAlive(), team: 1 };
    const hpPos = gameMode === 'HARDPOINT' ? zone.getCenter() : null;
    const enemyDamages = enemies.update(delta, playerInfo, hpPos);

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
          hud.showKillFeed(`☠ You were eliminated.`);
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
      enemies: enemies.getEnemies().map(e => ({ x: e.position.x, z: e.position.z, alive: e.alive, team: e.team })),
      hardpointPos: gameMode === 'HARDPOINT' ? zone.getCenter() : null,
      hardpointColor: zone.zoneMesh ? `#${zone.zoneMesh.material.color.getHexString()}` : null,
      mapSize: world.getMapSize(),
      delta
    });
  }

  // Render
  renderer.render(scene, camera);
}

// Start the loop
gameLoop();
