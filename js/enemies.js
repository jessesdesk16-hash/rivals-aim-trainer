import * as THREE from 'three';
import { randomInRange, randomIntInRange, distance2D, angleBetween, clamp, rayAABBIntersect } from './utils.js';

// Shared bot geometries & static materials — created once, reused by every bot
const BOT_GEO = {
  body: new THREE.BoxGeometry(0.6, 1.2, 0.4),
  head: new THREE.BoxGeometry(0.35, 0.35, 0.35),
  visor: new THREE.BoxGeometry(0.3, 0.08, 0.05),
  leg: new THREE.BoxGeometry(0.18, 0.8, 0.25)
};
const BOT_MATS = {
  head: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }),
  leg: new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
  visor: {
    1: new THREE.MeshBasicMaterial({ color: 0x00d0ff }),
    2: new THREE.MeshBasicMaterial({ color: 0xff3e3e })
  }
};

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = []; // Stores all bots (both teams)
    this.collisionBoxes = [];
    this.spawnPoints = [];
  }

  setCollisionBoxes(boxes) { this.collisionBoxes = boxes; }
  setSpawnPoints(points) { this.spawnPoints = points; }

  spawnBots(team1Count, team2Count) {
    this.clear();
    for (let i = 0; i < team1Count; i++) this.createBot(1);
    for (let i = 0; i < team2Count; i++) this.createBot(2);
  }

  createBot(team) {
    const sp = this.spawnPoints[randomIntInRange(0, this.spawnPoints.length - 1)];
    const position = new THREE.Vector3(sp.x + randomInRange(-5, 5), 0, sp.z + randomInRange(-5, 5));
    
    const group = new THREE.Group();
    const bodyColor = team === 1 ? 0x00d0ff : 0xff3e3e;

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

    // Legs
    for (const xOff of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(BOT_GEO.leg, BOT_MATS.leg);
      leg.position.set(xOff, 0.4, 0);
      group.add(leg);
    }

    group.position.copy(position);
    this.scene.add(group);

    const bot = {
      team: team,
      mesh: group,
      bodyMat: bodyMat,
      baseColor: bodyColor,
      isFlashing: false,
      health: 100,
      maxHealth: 100,
      damage: 10,
      accuracy: 0.2,
      fireRate: 0.4,
      fireTimer: Math.random(),
      speed: 5.5,
      state: 'patrol',
      patrolTarget: { x: position.x, z: position.z },
      detectionRange: 150,
      attackRange: 45,
      position: group.position,
      rotation: 0,
      headY: 2.0,
      alive: true,
      deathTimer: 0,
      highlightTimer: 0,
      spawnDelay: 2.0
    };
    this.enemies.push(bot);
  }

  update(delta, playerInfo, hardpointPos, gameMode = 'TDM') {
    const damages = []; // { damage, source, target }
    
    for (let i = 0; i < this.enemies.length; i++) {
      const b = this.enemies[i];

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

      // Find closest enemy
      let closestDist = Infinity;
      let closestTarget = null;
      let closestObj = null; // 'player' or bot reference

      // Check player
      if (playerInfo.alive && playerInfo.team !== b.team) {
        const d = distance2D(b.position.x, b.position.z, playerInfo.position.x, playerInfo.position.z);
        if (d < closestDist) {
          closestDist = d;
          closestTarget = playerInfo.position;
          closestObj = 'player';
        }
      }

      // Check other bots
      for (const other of this.enemies) {
        if (other.alive && other.team !== b.team) {
          const d = distance2D(b.position.x, b.position.z, other.position.x, other.position.z);
          if (d < closestDist) {
            closestDist = d;
            closestTarget = other.position;
            closestObj = other;
          }
        }
      }

      // Movement logic
      let targetPos = null;
      if (closestTarget && closestDist < b.attackRange) {
        b.state = 'attack';
        targetPos = closestTarget;
      } else if (closestTarget && closestDist < b.detectionRange) {
        b.state = 'chase';
        targetPos = closestTarget;
      } else {
        b.state = 'patrol';
        targetPos = b.patrolTarget;
        
        // If hardpoint is active, patrol towards it
        if (hardpointPos) {
           targetPos = hardpointPos;
        } else {
           if (distance2D(b.position.x, b.position.z, b.patrolTarget.x, b.patrolTarget.z) < 3) {
             b.patrolTarget = {
               x: clamp(b.position.x + randomInRange(-25, 25), -90, 90),
               z: clamp(b.position.z + randomInRange(-25, 25), -90, 90)
             };
           }
        }
      }

      // Execute movement
      if (b.state === 'attack') {
        const angle = angleBetween(b.position.x, b.position.z, targetPos.x, targetPos.z);
        b.mesh.rotation.y = angle;
        
        // Strafe
        const strafeDir = Math.sin(performance.now() * 0.002 + i) * 2;
        this._move(b, angle + Math.PI/2, strafeDir * delta);

        if (b.fireTimer <= 0) {
          b.fireTimer = b.fireRate;
          b.highlightTimer = 0.3;
          if (Math.random() < b.accuracy) {
            damages.push({ damage: b.damage, source: b, target: closestObj });
          }
        }
      } else {
        const angle = angleBetween(b.position.x, b.position.z, targetPos.x, targetPos.z);
        b.mesh.rotation.y = angle;
        this._move(b, angle, b.speed * delta);
      }
    }

    return damages;
  }

  _move(bot, angle, distance) {
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
