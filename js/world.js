import * as THREE from 'three';
import { randomInRange, randomIntInRange } from './utils.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.collisionBoxes = [];
    this.pickups = [];
    this.spawnPoints = [];
    this.neonLights = [];
    this.mapSize = 200;
  }

  init() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(this.mapSize, this.mapSize);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.9, metalness: 0.1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // Grid lines on ground
    const gridHelper = new THREE.GridHelper(this.mapSize, 40, 0x1a1a2e, 0x0d0d1a);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    // Fog
    this.scene.fog = new THREE.FogExp2(0xddeeff, 0.003);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambient);
    const moon = new THREE.DirectionalLight(0xfff5e6, 2.0); // Now it's the sun
    moon.position.set(100, 150, 50);
    this.scene.add(moon);

    // Sky
    this.scene.background = new THREE.Color(0x87ceeb);

    // Build city
    const buildingColors = [0x888899, 0xaabbcc, 0x99aa99, 0xccbbaa, 0x778899];
    this._generateBuildings();
    this._generateCover();
    this._generateNeonSigns();
    this._generateStreetLights();
    this._generatePickups();
    this._generateBoundary();
    this._findSpawnPoints();
  }

  _generateBuildings() {
    const buildingColors = [0x1a1a2e, 0x16213e, 0x0f3460, 0x141428, 0x1c1c3a];
    const neonColors = [0x00f0ff, 0xff00ff, 0x00ff88, 0xff3e3e, 0xffaa00, 0x8800ff];
    const half = this.mapSize / 2 - 15;

    for (let i = 0; i < 16; i++) {
      const w = randomInRange(6, 18);
      const h = randomInRange(8, 32);
      const d = randomInRange(6, 18);
      let x, z, attempts = 0, valid = false;

      while (!valid && attempts < 50) {
        x = randomInRange(-half, half);
        z = randomInRange(-half, half);
        valid = true;
        for (const b of this.collisionBoxes) {
          const padX = (b.maxX - b.minX) / 2 + w / 2 + 8;
          const padZ = (b.maxZ - b.minZ) / 2 + d / 2 + 8;
          const cX = (b.minX + b.maxX) / 2;
          const cZ = (b.minZ + b.maxZ) / 2;
          if (Math.abs(x - cX) < padX && Math.abs(z - cZ) < padZ) { valid = false; break; }
        }
        attempts++;
      }
      if (!valid) continue;

      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: buildingColors[i % buildingColors.length],
        roughness: 0.8, metalness: 0.2
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, h / 2, z);
      this.scene.add(mesh);

      this.collisionBoxes.push({
        minX: x - w / 2, maxX: x + w / 2,
        minY: 0, maxY: h,
        minZ: z - d / 2, maxZ: z + d / 2
      });

      // Windows (emissive planes)
      const windowColor = neonColors[randomIntInRange(0, neonColors.length - 1)];
      const sides = [
        { axis: 'x', sign: 1, rot: [0, Math.PI / 2, 0], sW: d, sH: h },
        { axis: 'x', sign: -1, rot: [0, -Math.PI / 2, 0], sW: d, sH: h },
        { axis: 'z', sign: 1, rot: [0, 0, 0], sW: w, sH: h },
        { axis: 'z', sign: -1, rot: [0, Math.PI, 0], sW: w, sH: h },
      ];
      for (const side of sides) {
        const numWin = randomIntInRange(1, 3);
        for (let j = 0; j < numWin; j++) {
          const ww = randomInRange(0.8, 2);
          const wh = randomInRange(0.8, 2);
          const winGeo = new THREE.PlaneGeometry(ww, wh);
          const winMat = new THREE.MeshBasicMaterial({
            color: windowColor, transparent: true, opacity: randomInRange(0.3, 0.8)
          });
          const win = new THREE.Mesh(winGeo, winMat);
          const offX = side.axis === 'x' ? side.sign * (w / 2 + 0.05) : randomInRange(-side.sW / 2 + 1.5, side.sW / 2 - 1.5);
          const offY = randomInRange(2, h - 2);
          const offZ = side.axis === 'z' ? side.sign * (d / 2 + 0.05) : randomInRange(-side.sW / 2 + 1.5, side.sW / 2 - 1.5);
          win.position.set(x + offX, offY, z + offZ);
          win.rotation.set(...side.rot);
          this.scene.add(win);
        }
      }
    }
  }

  _generateCover() {
    const coverColors = [0x3d4f2f, 0x555555, 0x444433, 0x2d3a1f, 0x665544];
    const half = this.mapSize / 2 - 10;
    for (let i = 0; i < 20; i++) {
      const w = randomInRange(1, 3);
      const h = randomInRange(0.8, 2.5);
      const d = randomInRange(1, 3);
      const x = randomInRange(-half, half);
      const z = randomInRange(-half, half);

      let blocked = false;
      for (const b of this.collisionBoxes) {
        if (Math.abs(x - (b.minX + b.maxX) / 2) < (b.maxX - b.minX) / 2 + w &&
            Math.abs(z - (b.minZ + b.maxZ) / 2) < (b.maxZ - b.minZ) / 2 + d) {
          blocked = true; break;
        }
      }
      if (blocked) continue;

      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: coverColors[i % coverColors.length], roughness: 0.9
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, h / 2, z);
      this.scene.add(mesh);

      this.collisionBoxes.push({
        minX: x - w / 2, maxX: x + w / 2,
        minY: 0, maxY: h,
        minZ: z - d / 2, maxZ: z + d / 2
      });
    }
  }

  _generateNeonSigns() {
    const colors = [0x00f0ff, 0xff00ff, 0xff3e3e, 0xffaa00, 0x00ff88, 0x8800ff];
    for (let i = 0; i < 10; i++) {
      const color = colors[i % colors.length];
      const w = randomInRange(2, 6);
      const h = randomInRange(0.3, 1);
      const geo = new THREE.BoxGeometry(w, h, 0.15);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      const x = randomInRange(-80, 80);
      const y = randomInRange(4, 15);
      const z = randomInRange(-80, 80);
      mesh.position.set(x, y, z);
      mesh.rotation.y = randomInRange(0, Math.PI);
      this.scene.add(mesh);

      if (i < 3) {
        const light = new THREE.PointLight(color, 1.2, 12);
        light.position.copy(mesh.position);
        this.scene.add(light);
        this.neonLights.push({ mesh, light, baseIntensity: 1.2, flickerSpeed: randomInRange(2, 8) });
      } else {
        this.neonLights.push({ mesh, light: null, baseIntensity: 0, flickerSpeed: randomInRange(2, 8) });
      }
    }
  }

  _generateStreetLights() {
    // Poles only — no PointLights for performance
    for (let x = -80; x <= 80; x += 40) {
      for (let z = -80; z <= 80; z += 40) {
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 6, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 3, z);
        this.scene.add(pole);
        // Lamp head (emissive glow, no PointLight)
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xffcc66 })
        );
        lamp.position.set(x, 6.2, z);
        this.scene.add(lamp);
      }
    }
  }

  _generatePickups() {
    const types = [
      { type: 'health', color: 0x00ff88, lightColor: 0x00ff88 },
      { type: 'armor', color: 0x00aaff, lightColor: 0x00aaff },
      { type: 'ammo', color: 0xffaa00, lightColor: 0xffaa00 },
    ];
    for (let i = 0; i < 15; i++) {
      const t = types[i % 3];
      const x = randomInRange(-80, 80);
      const z = randomInRange(-80, 80);

      let blocked = false;
      for (const b of this.collisionBoxes) {
        if (x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1) {
          blocked = true; break;
        }
      }
      if (blocked) continue;

      const geo = new THREE.OctahedronGeometry(0.5);
      const mat = new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 1.2, z);
      this.scene.add(mesh);

      // No PointLight — just glowing mesh for performance
      this.pickups.push({ mesh, light: null, type: t.type, position: { x, z }, active: true, baseY: 1.2 });
    }
  }

  _generateBoundary() {
    const half = this.mapSize / 2;
    const wallH = 30;
    this.collisionBoxes.push(
      { minX: -half - 1, maxX: -half, minY: 0, maxY: wallH, minZ: -half, maxZ: half },
      { minX: half, maxX: half + 1, minY: 0, maxY: wallH, minZ: -half, maxZ: half },
      { minX: -half, maxX: half, minY: 0, maxY: wallH, minZ: -half - 1, maxZ: -half },
      { minX: -half, maxX: half, minY: 0, maxY: wallH, minZ: half, maxZ: half + 1 },
    );
  }

  _findSpawnPoints() {
    const candidates = [];
    for (let x = -70; x <= 70; x += 20) {
      for (let z = -70; z <= 70; z += 20) {
        let valid = true;
        for (const b of this.collisionBoxes) {
          if (x > b.minX - 3 && x < b.maxX + 3 && z > b.minZ - 3 && z < b.maxZ + 3) {
            valid = false; break;
          }
        }
        if (valid) candidates.push({ x, z });
      }
    }
    this.spawnPoints = candidates.length > 0 ? candidates : [{ x: 0, z: 0 }];
  }

  getCollisionBoxes() { return this.collisionBoxes; }
  getSpawnPoints() { return this.spawnPoints; }
  getPickups() { return this.pickups; }
  getMapSize() { return this.mapSize; }

  collectPickup(pickup) {
    pickup.active = false;
    pickup.mesh.visible = false;
    if (pickup.light) pickup.light.visible = false;
  }

  respawnPickups() {
    this.pickups.forEach(p => {
      p.active = true;
      p.mesh.visible = true;
      if (p.light) p.light.visible = true;
    });
  }

  update(delta) {
    const time = performance.now() * 0.001;
    // Rotate & bob pickups
    for (const p of this.pickups) {
      if (!p.active) continue;
      p.mesh.rotation.y += delta * 1.5;
      p.mesh.position.y = p.baseY + Math.sin(time * 2 + p.position.x) * 0.3;
      if (p.light) p.light.position.y = p.mesh.position.y;
    }
    // Flicker neon
    for (const n of this.neonLights) {
      if (n.light) {
        const flicker = Math.sin(time * n.flickerSpeed) > 0.9 ? 0.3 : 1;
        n.light.intensity = n.baseIntensity * flicker;
        n.mesh.material.opacity = flicker * 0.8 + 0.2;
      }
    }
  }
}
