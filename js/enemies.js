import * as THREE from 'three';
import { randomInRange, randomIntInRange, distance2D, angleBetween, clamp, lerp, rayAABBIntersect } from './utils.js';

// Shared bot geometries & static materials — created once, reused by every bot
const BOT_GEO = {
  body: new THREE.BoxGeometry(0.6, 1.2, 0.4),
  head: new THREE.BoxGeometry(0.35, 0.35, 0.35),
  visor: new THREE.BoxGeometry(0.3, 0.08, 0.05),
  leg: new THREE.BoxGeometry(0.18, 0.8, 0.25),
  arm: new THREE.BoxGeometry(0.14, 0.5, 0.14),
  gunBody: new THREE.BoxGeometry(0.08, 0.14, 0.5),
  gunBarrel: new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6),
  gunMag: new THREE.BoxGeometry(0.06, 0.2, 0.1),
  flash: new THREE.SphereGeometry(0.12, 5, 5)
};
const BOT_MATS = {
  head: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }),
  leg: new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
  arm: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 }),
  gunMetal: new THREE.MeshStandardMaterial({ color: 0x2f2f33, roughness: 0.5, metalness: 0.7 }),
  gunDark: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.4 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true }),
  visor: {
    1: new THREE.MeshBasicMaterial({ color: 0x00d0ff }),
    2: new THREE.MeshBasicMaterial({ color: 0xff3e3e })
  }
};

// Loadout the bots can carry — name shows up in the kill feed when they down you
const BOT_WEAPONS = [
  { name: 'AK-47',        barrel: 0.4,  reach: 45, fireRate: 0.42, burst: [4, 7] },
  { name: 'VIPER SMG',    barrel: 0.3,  reach: 38, fireRate: 0.28, burst: [6, 10] },
  { name: 'HEAVY LMG',    barrel: 0.5,  reach: 50, fireRate: 0.36, burst: [8, 14] },
  { name: 'THUNDER SNIPER', barrel: 0.6, reach: 70, fireRate: 1.1, burst: [1, 1] }
];

// Reusable temp objects — no per-frame allocation
const _rayDir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();

// Turn a wrapped angle toward a target angle at a limited rate (radians/sec)
function approachAngle(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = []; // Stores all bots (both teams)
    this.collisionBoxes = [];
    this.spawnPoints = [];
    this.difficulty = 0; // grows as the player wins matches
  }

  setCollisionBoxes(boxes) { this.collisionBoxes = boxes; }
  setSpawnPoints(points) { this.spawnPoints = points; }
  setDifficulty(level) { this.difficulty = Math.max(0, level | 0); }

  // Per-bot base stats derived from the current difficulty level
  _statsForDifficulty() {
    const L = this.difficulty;
    return {
      accuracy: clamp(0.18 + L * 0.035, 0, 0.62),
      fireScale: clamp(1 - L * 0.05, 0.45, 1),        // multiplies each weapon's fireRate (lower = faster)
      speed: clamp(5.2 + L * 0.25, 5.2, 8.5),
      damage: clamp(9 + L * 1.2, 9, 24),
      reactionDelay: clamp(0.5 - L * 0.05, 0.12, 0.5), // seconds before a spotted target is engaged
      health: clamp(100 + L * 8, 100, 160)
    };
  }

  spawnBots(team1Count, team2Count) {
    this.clear();
    for (let i = 0; i < team1Count; i++) this.createBot(1);
    for (let i = 0; i < team2Count; i++) this.createBot(2);
  }

  _buildGun(barrelLen) {
    const gun = new THREE.Group();
    const body = new THREE.Mesh(BOT_GEO.gunBody, BOT_MATS.gunMetal);
    gun.add(body);
    const barrel = new THREE.Mesh(BOT_GEO.gunBarrel, BOT_MATS.gunDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.scale.y = barrelLen / 0.4; // gunBarrel geometry is 0.4 tall
    barrel.position.set(0, 0.02, 0.25 + barrelLen / 2);
    gun.add(barrel);
    const mag = new THREE.Mesh(BOT_GEO.gunMag, BOT_MATS.gunDark);
    mag.position.set(0, -0.14, 0.05);
    gun.add(mag);
    // Muzzle flash at the barrel tip — hidden until the bot fires
    const flash = new THREE.Mesh(BOT_GEO.flash, BOT_MATS.flash);
    flash.position.set(0, 0.02, 0.28 + barrelLen);
    flash.visible = false;
    gun.add(flash);
    return { gun, flash };
  }

  createBot(team) {
    const sp = this.spawnPoints[randomIntInRange(0, this.spawnPoints.length - 1)];
    const position = new THREE.Vector3(sp.x + randomInRange(-5, 5), 0, sp.z + randomInRange(-5, 5));

    const group = new THREE.Group();
    const bodyColor = team === 1 ? 0x00d0ff : 0xff3e3e;
    const stats = this._statsForDifficulty();
    const weapon = BOT_WEAPONS[randomIntInRange(0, BOT_WEAPONS.length - 1)];

    // Body — material is per-bot (it flashes on fire), geometry is shared
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5, emissive: bodyColor, emissiveIntensity: 0.5 });
    const body = new THREE.Mesh(BOT_GEO.body, bodyMat);
    body.position.y = 1.4;
    group.add(body);

    // Head
    const head = new THREE.Mesh(BOT_GEO.head, BOT_MATS.head);
    head.position.y = 2.2;
    group.add(head);

    // Visor
    const visor = new THREE.Mesh(BOT_GEO.visor, BOT_MATS.visor[team]);
    visor.position.set(0, 2.25, 0.18);
    group.add(visor);

    // Legs (animated while walking)
    const legs = [];
    for (const xOff of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(BOT_GEO.leg, BOT_MATS.leg);
      leg.position.set(xOff, 0.4, 0);
      group.add(leg);
      legs.push(leg);
    }

    // Arms holding the gun out front
    const armL = new THREE.Mesh(BOT_GEO.arm, BOT_MATS.arm);
    armL.position.set(-0.28, 1.45, 0.18);
    armL.rotation.x = Math.PI / 2.4;
    group.add(armL);
    const armR = new THREE.Mesh(BOT_GEO.arm, BOT_MATS.arm);
    armR.position.set(0.28, 1.45, 0.18);
    armR.rotation.x = Math.PI / 2.4;
    group.add(armR);

    // Visible gun in the bot's hands
    const { gun, flash } = this._buildGun(weapon.barrel);
    gun.position.set(0.24, 1.42, 0.2);
    group.add(gun);

    group.position.copy(position);
    this.scene.add(group);

    const bot = {
      team: team,
      mesh: group,
      bodyMat: bodyMat,
      baseColor: bodyColor,
      isFlashing: false,
      legs,
      muzzleFlash: flash,
      muzzleTimer: 0,
      walkPhase: Math.random() * Math.PI * 2,
      weaponName: weapon.name,
      health: stats.health,
      maxHealth: stats.health,
      damage: stats.damage,
      accuracy: stats.accuracy,
      fireRate: weapon.fireRate * stats.fireScale,
      fireTimer: Math.random(),
      burstRange: weapon.burst,
      burstLeft: randomIntInRange(weapon.burst[0], weapon.burst[1]),
      reactionDelay: stats.reactionDelay,
      visibleTime: 0,          // how long the current target has been in the open
      speed: stats.speed,
      state: 'patrol',
      patrolTarget: { x: position.x, z: position.z },
      detectionRange: 150,
      attackRange: weapon.reach,
      position: group.position,
      aimAngle: 0,
      headY: 2.0,
      alive: true,
      deathTimer: 0,
      highlightTimer: 0,
      spawnDelay: 2.0
    };
    this.enemies.push(bot);
  }

  // Line-of-sight: does a wall (a collision box tall enough to block) sit between two points?
  _hasLOS(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) return true;
    const steps = Math.min(40, Math.ceil(dist / 2)); // sample every ~2 units, capped
    const sx = dx / steps, sz = dz / steps;
    for (let s = 1; s < steps; s++) {
      const px = ax + sx * s, pz = az + sz * s;
      for (const box of this.collisionBoxes) {
        if (box.maxY > 1.2 && px > box.minX && px < box.maxX && pz > box.minZ && pz < box.maxZ) {
          return false;
        }
      }
    }
    return true;
  }

  update(delta, playerInfo, hardpointPos, gameMode = 'TDM') {
    const damages = []; // { damage, source, target }

    for (let i = 0; i < this.enemies.length; i++) {
      const b = this.enemies[i];

      // Muzzle flash fade
      if (b.muzzleTimer > 0) {
        b.muzzleTimer -= delta;
        if (b.muzzleTimer <= 0 && b.muzzleFlash.visible) b.muzzleFlash.visible = false;
      }

      if (!b.alive) {
        b.deathTimer += delta;
        if (b.mesh.rotation.x < Math.PI / 2) {
          b.mesh.rotation.x += delta * 5;
        }
        if (gameMode !== 'ELIMINATION' && b.deathTimer > 3) { // Respawn
          b.alive = true;
          b.health = b.maxHealth;
          b.deathTimer = 0;
          b.mesh.rotation.x = 0;
          const sp = this.spawnPoints[randomIntInRange(0, this.spawnPoints.length - 1)];
          b.position.set(sp.x + randomInRange(-5, 5), 0, sp.z + randomInRange(-5, 5));
          b.state = 'patrol';
          b.spawnDelay = 2.0;
          b.visibleTime = 0;
        }
        continue;
      }

      // Highlight flash logic — only touch the material when the state changes
      if (b.highlightTimer > 0) {
        b.highlightTimer -= delta;
        if (!b.isFlashing) {
          b.isFlashing = true;
          b.bodyMat.emissiveIntensity = 3.0;
          b.bodyMat.emissive.setHex(0xffffff);
        }
      } else if (b.isFlashing) {
        b.isFlashing = false;
        b.bodyMat.emissiveIntensity = 0.5;
        b.bodyMat.emissive.setHex(b.baseColor);
      }

      if (b.spawnDelay > 0) {
        b.spawnDelay -= delta;
        continue; // Wait a moment before moving
      }

      b.fireTimer -= delta;

      // Find closest enemy (player or other bot)
      let closestDist = Infinity;
      let closestTarget = null;
      let closestObj = null; // 'player' or bot reference

      if (playerInfo.alive && playerInfo.team !== b.team) {
        const d = distance2D(b.position.x, b.position.z, playerInfo.position.x, playerInfo.position.z);
        if (d < closestDist) { closestDist = d; closestTarget = playerInfo.position; closestObj = 'player'; }
      }
      for (const other of this.enemies) {
        if (other.alive && other.team !== b.team) {
          const d = distance2D(b.position.x, b.position.z, other.position.x, other.position.z);
          if (d < closestDist) { closestDist = d; closestTarget = other.position; closestObj = other; }
        }
      }

      // Does the bot actually have a clear shot?
      const hasLOS = closestTarget
        ? this._hasLOS(b.position.x, b.position.z, closestTarget.x, closestTarget.z)
        : false;

      // Movement + engagement decision
      let targetPos = null;
      let engaging = false;
      if (closestTarget && closestDist < b.attackRange && hasLOS) {
        b.state = 'attack';
        targetPos = closestTarget;
        engaging = true;
      } else if (closestTarget && closestDist < b.detectionRange) {
        b.state = 'chase'; // move toward them (and around cover) until there's a shot
        targetPos = closestTarget;
      } else {
        b.state = 'patrol';
        targetPos = b.patrolTarget;
        if (hardpointPos) {
          targetPos = hardpointPos;
        } else if (distance2D(b.position.x, b.position.z, b.patrolTarget.x, b.patrolTarget.z) < 3) {
          b.patrolTarget = {
            x: clamp(b.position.x + randomInRange(-25, 25), -90, 90),
            z: clamp(b.position.z + randomInRange(-25, 25), -90, 90)
          };
        }
      }

      // Track how long the current target has been shootable (reaction time)
      if (engaging) b.visibleTime += delta;
      else b.visibleTime = 0;

      // Smoothly turn to face the movement/aim target instead of snapping
      const desiredAngle = angleBetween(b.position.x, b.position.z, targetPos.x, targetPos.z);
      const turnSpeed = engaging ? 7 : 4; // rad/sec — quicker when locked on
      b.aimAngle = approachAngle(b.aimAngle, desiredAngle, turnSpeed * delta);
      b.mesh.rotation.y = b.aimAngle;

      if (engaging) {
        // Strafe side-to-side while shooting
        const strafeDir = Math.sin(performance.now() * 0.002 + i) * 2;
        this._move(b, b.aimAngle + Math.PI / 2, strafeDir * delta, true);

        // Only fire once reaction time has elapsed and roughly facing the target
        const facing = Math.abs(approachAngle(b.aimAngle, desiredAngle, Math.PI) - b.aimAngle) < 0.25;
        if (b.fireTimer <= 0 && b.visibleTime >= b.reactionDelay && facing) {
          // Accuracy drops off with range
          const rangeFactor = clamp(1 - (closestDist / b.attackRange) * 0.6, 0.3, 1);
          const effAccuracy = b.accuracy * rangeFactor;

          b.highlightTimer = 0.3;
          b.muzzleFlash.visible = true;
          b.muzzleTimer = 0.05;
          if (Math.random() < effAccuracy) {
            damages.push({ damage: b.damage, source: b, target: closestObj });
          }

          // Burst fire: several quick shots, then a longer reposition pause
          b.burstLeft--;
          if (b.burstLeft <= 0) {
            b.burstLeft = randomIntInRange(b.burstRange[0], b.burstRange[1]);
            b.fireTimer = b.fireRate + randomInRange(0.4, 1.1); // pause between bursts
          } else {
            b.fireTimer = b.fireRate;
          }
        }
      } else {
        this._move(b, b.aimAngle, b.speed * delta, true);
      }
    }

    return damages;
  }

  _move(bot, angle, distance, animate = false) {
    const moveX = Math.sin(angle) * distance;
    const moveZ = Math.cos(angle) * distance;

    const newX = bot.position.x + moveX;
    const newZ = bot.position.z + moveZ;

    let blocked = false;
    for (const b of this.collisionBoxes) {
      if (newX > b.minX - 0.5 && newX < b.maxX + 0.5 &&
          newZ > b.minZ - 0.5 && newZ < b.maxZ + 0.5 && b.maxY > 1) {
        blocked = true; break;
      }
    }
    if (!blocked) {
      bot.position.x = clamp(newX, -95, 95);
      bot.position.z = clamp(newZ, -95, 95);

      // Walking leg animation
      if (animate && bot.legs && Math.abs(distance) > 0.001) {
        bot.walkPhase += Math.abs(distance) * 4;
        const swing = Math.sin(bot.walkPhase) * 0.5;
        bot.legs[0].rotation.x = swing;
        bot.legs[1].rotation.x = -swing;
      }
    } else {
      // force new patrol target to avoid getting stuck
      bot.patrolTarget = {
        x: clamp(bot.position.x + randomInRange(-20, 20), -85, 85),
        z: clamp(bot.position.z + randomInRange(-20, 20), -85, 85)
      };
    }
  }

  checkHit(origin, direction, range, teamToIgnore = null) {
    let closest = null;
    let closestDist = range;

    for (const e of this.enemies) {
      if (!e.alive || e.team === teamToIgnore) continue;
      const p = e.position;
      const box = {
        minX: p.x - 0.5, maxX: p.x + 0.5,
        minY: 0, maxY: 2.5,
        minZ: p.z - 0.5, maxZ: p.z + 0.5
      };
      const t = rayAABBIntersect(origin, direction, box);
      if (t !== null && t < closestDist) {
        const hitPoint = new THREE.Vector3().copy(origin).add(direction.clone().multiplyScalar(t));
        const headshot = hitPoint.y > e.headY;
        closestDist = t;
        closest = { hit: true, enemy: e, headshot, point: hitPoint, distance: t };
      }
    }
    return closest || { hit: false };
  }

  damageEnemy(enemy, damage) {
    enemy.health -= damage;
    if (enemy.health <= 0) {
      enemy.health = 0;
      enemy.alive = false;
      enemy.state = 'dead';
    }
  }

  getEnemies() { return this.enemies; }

  clear() {
    this.enemies.forEach(e => this.scene.remove(e.mesh));
    this.enemies = [];
  }
}
