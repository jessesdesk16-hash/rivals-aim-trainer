import * as THREE from 'three';
import { randomInRange } from './utils.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.collisionBoxes = [];
    this.pickups = [];
    this.spawnPoints = [];
    this.neonLights = [];
    this.mapSize = 200;
  }

  clear() {
    this.collisionBoxes = [];
    this.pickups = [];
    this.spawnPoints = [];
    this.neonLights = [];
    
    const toRemove = [];
    this.scene.traverse(child => {
      if (child.isMesh || child.isLight || child.isGridHelper) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(child => {
      if (child.parent === this.scene) {
        this.scene.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      }
    });
  }

  init(mapTheme = 'NEON') {
    this.mapTheme = mapTheme;

    if (mapTheme === 'DESERT') {
      this._buildDesert();
    } else if (mapTheme === 'FACILITY') {
      this._buildFacility();
    } else {
      this._buildNeon();
    }

    this._generateBoundary();
  }

  _setupEnvironment(groundColor, skyColor, grid1, grid2, fogColor, sunColor, ambientInt, sunInt) {
    const groundGeo = new THREE.PlaneGeometry(this.mapSize, this.mapSize);
    const groundMat = new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.9, metalness: 0.1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(this.mapSize, 20, grid1, grid2);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    this.scene.fog = new THREE.FogExp2(fogColor, 0.004);

    const ambient = new THREE.AmbientLight(0xffffff, ambientInt);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(sunColor, sunInt); 
    sun.position.set(100, 150, 50);
    this.scene.add(sun);

    this.scene.background = new THREE.Color(skyColor);
  }

  _addBoxShared(x, y, z, w, h, d, mat, sharedGeo, isElevated = false) {
    const mesh = new THREE.Mesh(sharedGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    this.collisionBoxes.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: isElevated ? y - h / 2 : 0, 
      maxY: y + h / 2,
      minZ: z - d / 2, maxZ: z + d / 2
    });
    return mesh;
  }

  _addNeonSign(x, y, z, w, h, d, color, sharedGeo) {
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true });
    const mesh = new THREE.Mesh(sharedGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.neonLights.push({ mesh, light: null, baseIntensity: 0, flickerSpeed: randomInRange(2, 8) });
  }

  _hardcodePickups(data) {
    const sharedOctaGeo = new THREE.OctahedronGeometry(0.5);
    const mats = {
      health: new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.8 }),
      armor: new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.8 }),
      ammo: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 }),
    };

    data.forEach(p => {
      const mesh = new THREE.Mesh(sharedOctaGeo, mats[p.type]);
      const baseY = p.baseY || 1.2;
      mesh.position.set(p.x, baseY, p.z);
      this.scene.add(mesh);
      this.pickups.push({ mesh, light: null, type: p.type, position: { x: p.x, z: p.z }, active: true, baseY });
    });
  }

  _buildNeon() {
    this._setupEnvironment(0x222233, 0x0a0a2e, 0x1a1a2e, 0x0d0d1a, 0x0a0a2e, 0x8899aa, 0.6, 0.4);
    
    const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8, metalness: 0.2 });
    const matAccent1 = new THREE.MeshStandardMaterial({ color: 0x222244, roughness: 0.7 });

    // Center building
    this._addBoxShared(-15, 5, 0, 2, 10, 30, matDark, sharedBoxGeo);
    this._addBoxShared(15, 5, 0, 2, 10, 30, matDark, sharedBoxGeo);
    this._addBoxShared(-10, 5, 15, 10, 10, 2, matDark, sharedBoxGeo);
    this._addBoxShared(10, 5, 15, 10, 10, 2, matDark, sharedBoxGeo);
    this._addBoxShared(0, 8, 15, 10, 4, 2, matDark, sharedBoxGeo);
    this._addBoxShared(-10, 5, -15, 10, 10, 2, matDark, sharedBoxGeo);
    this._addBoxShared(10, 5, -15, 10, 10, 2, matDark, sharedBoxGeo);
    this._addBoxShared(0, 8, -15, 10, 4, 2, matDark, sharedBoxGeo);
    // Roof
    this._addBoxShared(0, 10.5, 0, 32, 1, 32, matAccent1, sharedBoxGeo, true);
    this._addBoxShared(-10, 12, 0, 4, 2, 4, matDark, sharedBoxGeo, true);
    this._addBoxShared(10, 12, 0, 4, 2, 4, matDark, sharedBoxGeo, true);
    
    // Left alley buildings
    this._addBoxShared(-50, 15, 0, 30, 30, 120, matDark, sharedBoxGeo);
    this._addBoxShared(-25, 15, 0, 10, 30, 80, matDark, sharedBoxGeo);
    
    // Right street buildings
    this._addBoxShared(60, 20, 0, 30, 40, 140, matDark, sharedBoxGeo);
    
    // Cars/cover on right street
    this._addBoxShared(35, 1, 20, 3, 2, 6, matAccent1, sharedBoxGeo);
    this._addBoxShared(45, 1, -10, 3, 2, 6, matAccent1, sharedBoxGeo);
    this._addBoxShared(40, 1, -40, 3, 2, 6, matAccent1, sharedBoxGeo);
    this._addBoxShared(30, 1, 40, 3, 2, 6, matAccent1, sharedBoxGeo);
    
    // Spawn enclosures
    this._addBoxShared(0, 5, -95, 40, 10, 2, matDark, sharedBoxGeo);
    this._addBoxShared(-20, 5, -85, 2, 10, 20, matDark, sharedBoxGeo);
    this._addBoxShared(20, 5, -85, 2, 10, 20, matDark, sharedBoxGeo);
    this._addBoxShared(-15, 5, -75, 10, 10, 2, matDark, sharedBoxGeo);
    this._addBoxShared(15, 5, -75, 10, 10, 2, matDark, sharedBoxGeo);
    
    this._addBoxShared(0, 5, 95, 40, 10, 2, matDark, sharedBoxGeo);
    this._addBoxShared(-20, 5, 85, 2, 10, 20, matDark, sharedBoxGeo);
    this._addBoxShared(20, 5, 85, 2, 10, 20, matDark, sharedBoxGeo);
    this._addBoxShared(-15, 5, 75, 10, 10, 2, matDark, sharedBoxGeo);
    this._addBoxShared(15, 5, 75, 10, 10, 2, matDark, sharedBoxGeo);

    // Neon signs
    this._addNeonSign(-14.9, 15, 0, 0.2, 20, 1, 0x00f0ff, sharedBoxGeo);
    this._addNeonSign(14.9, 15, 0, 0.2, 20, 1, 0xff00ff, sharedBoxGeo);
    this._addNeonSign(-34, 10, 10, 1, 1, 10, 0x00f0ff, sharedBoxGeo);
    this._addNeonSign(44, 8, -20, 1, 1, 8, 0xff00ff, sharedBoxGeo);

    this.spawnPoints = [
      {x: -10, z: -85}, {x: 10, z: -85}, {x: -5, z: -80}, {x: 5, z: -80},
      {x: -10, z: 85}, {x: 10, z: 85}, {x: -5, z: 80}, {x: 5, z: 80}
    ];

    this._hardcodePickups([
      {x: 0, z: 0, type: 'armor'},
      {x: 0, z: -40, type: 'health'},
      {x: 0, z: 40, type: 'health'},
      {x: -35, z: 0, type: 'ammo'},
      {x: 40, z: 0, type: 'ammo'}
    ]);
  }

  _buildDesert() {
    this._setupEnvironment(0xd2b48c, 0x87ceeb, 0xbda07d, 0xa68a68, 0xffeebb, 0xfff5e6, 1.0, 2.5);
    
    const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const sharedCylGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    
    const matWall = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 1.0 });
    const matAccent = new THREE.MeshStandardMaterial({ color: 0xc2a47c, roughness: 0.9 });
    const matWater = new THREE.MeshBasicMaterial({ color: 0x44aaff });

    // Central courtyard walls
    this._addBoxShared(-10, 1, 20, 15, 2, 1, matWall, sharedBoxGeo);
    this._addBoxShared(10, 1, 20, 15, 2, 1, matWall, sharedBoxGeo);
    this._addBoxShared(-10, 1, -20, 15, 2, 1, matWall, sharedBoxGeo);
    this._addBoxShared(10, 1, -20, 15, 2, 1, matWall, sharedBoxGeo);
    this._addBoxShared(-20, 1, -10, 1, 2, 15, matWall, sharedBoxGeo);
    this._addBoxShared(-20, 1, 10, 1, 2, 15, matWall, sharedBoxGeo);
    this._addBoxShared(20, 1, -10, 1, 2, 15, matWall, sharedBoxGeo);
    this._addBoxShared(20, 1, 10, 1, 2, 15, matWall, sharedBoxGeo);
    
    // Fountain
    const fountain = new THREE.Mesh(sharedCylGeo, matAccent);
    fountain.scale.set(3, 1, 3);
    fountain.position.set(0, 0.5, 0);
    this.scene.add(fountain);
    this.collisionBoxes.push({ minX: -3, maxX: 3, minY: 0, maxY: 1, minZ: -3, maxZ: 3 });
    const water = new THREE.Mesh(sharedCylGeo, matWater);
    water.scale.set(2.8, 1.1, 2.8);
    water.position.set(0, 0.5, 0);
    this.scene.add(water);

    // Guard towers
    this._addBoxShared(-30, 10, -30, 8, 20, 8, matAccent, sharedBoxGeo);
    this._addBoxShared(30, 10, 30, 8, 20, 8, matAccent, sharedBoxGeo);

    // Tunnels
    this._addBoxShared(-40, 3, 0, 6, 6, 60, matWall, sharedBoxGeo);
    this._addBoxShared(40, 3, 0, 6, 6, 60, matWall, sharedBoxGeo);
    this._addBoxShared(-40, 1.5, 0, 2, 3, 2, matAccent, sharedBoxGeo);
    this._addBoxShared(40, 1.5, 0, 2, 3, 2, matAccent, sharedBoxGeo);

    // Spawn compounds
    this._addBoxShared(-15, 3, -70, 10, 6, 1, matWall, sharedBoxGeo);
    this._addBoxShared(15, 3, -70, 10, 6, 1, matWall, sharedBoxGeo);
    this._addBoxShared(-20, 3, -80, 1, 6, 20, matWall, sharedBoxGeo);
    this._addBoxShared(20, 3, -80, 1, 6, 20, matWall, sharedBoxGeo);

    this._addBoxShared(-15, 3, 70, 10, 6, 1, matWall, sharedBoxGeo);
    this._addBoxShared(15, 3, 70, 10, 6, 1, matWall, sharedBoxGeo);
    this._addBoxShared(-20, 3, 80, 1, 6, 20, matWall, sharedBoxGeo);
    this._addBoxShared(20, 3, 80, 1, 6, 20, matWall, sharedBoxGeo);

    this.spawnPoints = [
      {x: -10, z: -85}, {x: 10, z: -85}, {x: -5, z: -80}, {x: 5, z: -80},
      {x: -10, z: 85}, {x: 10, z: 85}, {x: -5, z: 80}, {x: 5, z: 80}
    ];

    this._hardcodePickups([
      {x: 0, z: 0, type: 'health', baseY: 1.5},
      {x: -40, z: 0, type: 'armor'},
      {x: 40, z: 0, type: 'armor'},
      {x: 0, z: -35, type: 'ammo'},
      {x: 0, z: 35, type: 'ammo'}
    ]);
  }

  _buildFacility() {
    this._setupEnvironment(0x333333, 0x111111, 0x222222, 0x111111, 0x222222, 0x8899aa, 0.3, 0.5);
    
    const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    
    const matWall = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8, metalness: 0.5 });
    const matCatwalk = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.8 });
    const matCover = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 });

    // Main Hall
    this._addBoxShared(-20, 5, 0, 2, 10, 40, matWall, sharedBoxGeo);
    this._addBoxShared(20, 5, 0, 2, 10, 40, matWall, sharedBoxGeo);
    this._addBoxShared(-12, 5, -20, 16, 10, 2, matWall, sharedBoxGeo);
    this._addBoxShared(12, 5, -20, 16, 10, 2, matWall, sharedBoxGeo);
    this._addBoxShared(0, 8, -20, 8, 4, 2, matWall, sharedBoxGeo); 

    this._addBoxShared(-12, 5, 20, 16, 10, 2, matWall, sharedBoxGeo);
    this._addBoxShared(12, 5, 20, 16, 10, 2, matWall, sharedBoxGeo);
    this._addBoxShared(0, 8, 20, 8, 4, 2, matWall, sharedBoxGeo); 

    // Catwalks
    this._addBoxShared(-15, 4, 0, 8, 0.5, 40, matCatwalk, sharedBoxGeo, true);
    this._addBoxShared(15, 4, 0, 8, 0.5, 40, matCatwalk, sharedBoxGeo, true);
    this._addBoxShared(0, 4, 0, 22, 0.5, 6, matCatwalk, sharedBoxGeo, true);

    // Stairs
    this._addBoxShared(-15, 1, -15, 8, 2, 4, matCatwalk, sharedBoxGeo);
    this._addBoxShared(-15, 2.5, -11, 8, 3, 4, matCatwalk, sharedBoxGeo);
    this._addBoxShared(15, 1, 15, 8, 2, 4, matCatwalk, sharedBoxGeo);
    this._addBoxShared(15, 2.5, 11, 8, 3, 4, matCatwalk, sharedBoxGeo);

    // Side Corridors
    this._addBoxShared(-30, 5, -40, 2, 10, 60, matWall, sharedBoxGeo);
    this._addBoxShared(-40, 5, 0, 2, 10, 140, matWall, sharedBoxGeo);
    this._addBoxShared(-30, 5, 40, 2, 10, 60, matWall, sharedBoxGeo);

    this._addBoxShared(30, 5, -40, 2, 10, 60, matWall, sharedBoxGeo);
    this._addBoxShared(40, 5, 0, 2, 10, 140, matWall, sharedBoxGeo);
    this._addBoxShared(30, 5, 40, 2, 10, 60, matWall, sharedBoxGeo);

    // Cover
    this._addBoxShared(0, 1.5, 10, 4, 3, 2, matCover, sharedBoxGeo);
    this._addBoxShared(0, 1.5, -10, 4, 3, 2, matCover, sharedBoxGeo);

    // Spawn rooms
    this._addBoxShared(0, 5, -90, 80, 10, 2, matWall, sharedBoxGeo);
    this._addBoxShared(0, 5, 90, 80, 10, 2, matWall, sharedBoxGeo);

    this.spawnPoints = [
      {x: -20, z: -80}, {x: -10, z: -80}, {x: 10, z: -80}, {x: 20, z: -80},
      {x: -20, z: 80}, {x: -10, z: 80}, {x: 10, z: 80}, {x: 20, z: 80}
    ];

    this._hardcodePickups([
      {x: 0, z: 0, type: 'armor', baseY: 4.5},
      {x: -35, z: 0, type: 'health'},
      {x: 35, z: 0, type: 'health'},
      {x: 0, z: -50, type: 'ammo'},
      {x: 0, z: 50, type: 'ammo'}
    ]);
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
    for (const p of this.pickups) {
      if (!p.active) continue;
      p.mesh.rotation.y += delta * 1.5;
      p.mesh.position.y = p.baseY + Math.sin(time * 2 + p.position.x) * 0.3;
      if (p.light) p.light.position.y = p.mesh.position.y;
    }
    for (const n of this.neonLights) {
      const flicker = Math.sin(time * n.flickerSpeed) > 0.9 ? 0.3 : 1;
      n.mesh.material.opacity = flicker * 0.8 + 0.2;
      if (n.light) {
        n.light.intensity = n.baseIntensity * flicker;
      }
    }
  }
}
