import * as THREE from 'three';
import { lerp, randomInRange } from './utils.js';

export class Zone {
  constructor(scene) {
    this.scene = scene;
    this.phases = [
      { duration: 60, radius: 100, damage: 1, shrinkTime: 15 },
      { duration: 45, radius: 70, damage: 2, shrinkTime: 12 },
      { duration: 35, radius: 45, damage: 4, shrinkTime: 10 },
      { duration: 25, radius: 25, damage: 8, shrinkTime: 8 },
      { duration: 20, radius: 10, damage: 15, shrinkTime: 5 },
    ];
    this.currentPhase = 0;
    this.currentRadius = 100;
    this.targetRadius = 100;
    this.center = { x: 0, z: 0 };
    this.targetCenter = { x: 0, z: 0 };
    this.phaseTimer = 0;
    this.isShrinking = false;
    this.shrinkTimer = 0;
    this.shrinkDuration = 0;
    this.zoneMesh = null;
    this.active = false;
    this.gameMode = 'SURVIVAL';

    // Hardpoint logic
    this.hardpointTimer = 0;
    this.hardpointDuration = 60;
  }

  init(mapSize) {
    this.mapSize = mapSize;
    this.currentRadius = mapSize / 2;
    this.targetRadius = this.currentRadius;
    this.phases[0].radius = mapSize / 2;
    const geo = new THREE.CylinderGeometry(1, 1, 50, 64, 1, true);
    // Material is updated dynamically based on mode
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.1, side: THREE.BackSide });
    this.zoneMesh = new THREE.Mesh(geo, mat);
    this.zoneMesh.position.y = 25;
    this.zoneMesh.scale.set(this.currentRadius, 1, this.currentRadius);
    this.zoneMesh.visible = false;
    this.scene.add(this.zoneMesh);
  }

  start(gameMode) {
    this.gameMode = gameMode;
    this.active = true;

    if (this.gameMode === 'HARDPOINT') {
       this.currentRadius = 15;
       this.targetRadius = 15;
       this.zoneMesh.material.color.setHex(0xffaa00);
       this.zoneMesh.material.opacity = 0.2;
       this.zoneMesh.material.side = THREE.DoubleSide;
       this.zoneMesh.visible = true;
       this.moveHardpoint();
    } else if (this.gameMode === 'SURVIVAL') {
       this.currentPhase = 0;
       this.phaseTimer = this.phases[0].duration;
       this.currentRadius = this.phases[0].radius;
       this.targetRadius = this.phases[0].radius;
       this.center = { x: 0, z: 0 };
       this.targetCenter = { x: 0, z: 0 };
       this.isShrinking = false;
       this.zoneMesh.material.color.setHex(0xff3333);
       this.zoneMesh.material.opacity = 0.1;
       this.zoneMesh.material.side = THREE.BackSide;
       this.zoneMesh.visible = true;
    } else {
       // TDM
       this.zoneMesh.visible = false;
    }
  }

  moveHardpoint() {
    this.center = {
      x: randomInRange(-70, 70),
      z: randomInRange(-70, 70)
    };
    this.hardpointTimer = this.hardpointDuration;
    if (this.zoneMesh) {
       this.zoneMesh.position.x = this.center.x;
       this.zoneMesh.position.z = this.center.z;
    }
  }

  setHardpointColor(hexStr) {
     if (this.zoneMesh) {
       this.zoneMesh.material.color.set(hexStr);
     }
  }

  update(delta) {
    if (!this.active || this.gameMode === 'TDM') return;

    if (this.gameMode === 'HARDPOINT') {
       this.hardpointTimer -= delta;
       if (this.hardpointTimer <= 0) {
          this.moveHardpoint();
       }
       if (this.zoneMesh) {
         this.zoneMesh.scale.set(this.currentRadius, 1, this.currentRadius);
         // Pulse effect
         this.zoneMesh.material.opacity = 0.2 + Math.sin(performance.now() * 0.005) * 0.05;
       }
       return;
    }

    // SURVIVAL
    if (this.isShrinking) {
      this.shrinkTimer -= delta;
      const t = 1 - Math.max(0, this.shrinkTimer / this.shrinkDuration);
      const smooth = t * t * (3 - 2 * t);
      this.currentRadius = lerp(this.phases[this.currentPhase].radius, this.targetRadius, smooth);
      this.center.x = lerp(this.center.x, this.targetCenter.x, delta * 2);
      this.center.z = lerp(this.center.z, this.targetCenter.z, delta * 2);
      this.zoneMesh.material.opacity = 0.1 + Math.sin(performance.now() * 0.005) * 0.05;
      if (this.shrinkTimer <= 0) {
        this.isShrinking = false;
        this.currentRadius = this.targetRadius;
        this.center.x = this.targetCenter.x;
        this.center.z = this.targetCenter.z;
        this.currentPhase++;
        if (this.currentPhase < this.phases.length) this.phaseTimer = this.phases[this.currentPhase].duration;
      }
    } else {
      this.phaseTimer -= delta;
      if (this.phaseTimer <= 0 && this.currentPhase < this.phases.length - 1) {
        const nextPhase = this.currentPhase + 1;
        this.targetRadius = this.phases[nextPhase].radius;
        this.shrinkDuration = this.phases[this.currentPhase].shrinkTime;
        this.shrinkTimer = this.shrinkDuration;
        this.isShrinking = true;
        const maxOff = (this.currentRadius - this.targetRadius) * 0.4;
        this.targetCenter = {
          x: this.center.x + (Math.random() - 0.5) * maxOff,
          z: this.center.z + (Math.random() - 0.5) * maxOff
        };
      }
    }
    if (this.zoneMesh) {
      this.zoneMesh.scale.set(this.currentRadius, 1, this.currentRadius);
      this.zoneMesh.position.x = this.center.x;
      this.zoneMesh.position.z = this.center.z;
    }
  }

  isInZone(pos) {
    const dx = pos.x - this.center.x, dz = pos.z - this.center.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.currentRadius;
  }
  
  getDamage() { return this.phases[Math.min(this.currentPhase, this.phases.length - 1)].damage; }
  getCenter() { return { ...this.center }; }
  getRadius() { return this.currentRadius; }
  getTargetRadius() { return this.targetRadius; }
  getTargetCenter() { return { ...this.targetCenter }; }
  getPhaseTimer() { return this.phaseTimer; }
  getCurrentPhase() { return this.currentPhase; }
  getTotalPhases() { return this.phases.length; }
  isShrinkingNow() { return this.isShrinking; }
}
