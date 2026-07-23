import * as THREE from 'three';

// Shared geometries and materials — created once, reused forever
const SHARED = {
  particleGeo: new THREE.SphereGeometry(1, 4, 4),  // scaled per-particle
  flashGeo: new THREE.SphereGeometry(0.15, 4, 4),
  tracerGeo: new THREE.CylinderGeometry(0.02, 0.02, 1, 4),
  mats: {
    muzzle: new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true }),
    tracer: new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.8 }),
    spark: new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true }),
    blood: new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true }),
    explosion: [
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true }),
      new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true }),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true }),
      new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true }),
    ],
  }
};

// Pool of reusable meshes
const POOL_SIZE = 80;

export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.flashes = [];

    // Pre-allocate particle pool
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(SHARED.particleGeo, SHARED.mats.spark);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push(mesh);
    }
    this.poolIndex = 0;
  }

  _getPoolMesh() {
    const mesh = this.pool[this.poolIndex % POOL_SIZE];
    this.poolIndex++;
    return mesh;
  }

  muzzleFlash(position, direction) {
    const mesh = this._getPoolMesh();
    mesh.material = SHARED.mats.muzzle;
    mesh.scale.setScalar(0.15);
    mesh.position.copy(position).add(direction.clone().multiplyScalar(0.5));
    mesh.visible = true;
    this.flashes.push({ mesh, light: null, lifetime: 0.05, age: 0 });
  }

  bulletTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const mesh = this._getPoolMesh();
    mesh.material = SHARED.mats.tracer;
    mesh.scale.set(1, len, 1);
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.lookAt(to);
    mesh.rotateX(Math.PI / 2);
    mesh.visible = true;
    this.particles.push({ mesh, velocity: new THREE.Vector3(), lifetime: 0.1, age: 0, gravity: false, type: 'tracer' });
  }

  explosion(position, scale = 1) {
    // Reduced from 30 to 12 particles
    const count = 12;
    for (let i = 0; i < count; i++) {
      const size = (Math.random() * 0.15 + 0.05) * scale;
      const mesh = this._getPoolMesh();
      mesh.material = SHARED.mats.explosion[i % 4];
      mesh.scale.setScalar(size);
      mesh.position.copy(position);
      mesh.visible = true;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 15 * scale,
        Math.random() * 12 * scale,
        (Math.random() - 0.5) * 15 * scale
      );
      this.particles.push({ mesh, velocity: vel, lifetime: 0.6, age: 0, gravity: true, type: 'explosion' });
    }
    // No PointLight — just flash a bigger mesh
    const flash = this._getPoolMesh();
    flash.material = SHARED.mats.explosion[0];
    flash.scale.setScalar(2 * scale);
    flash.position.copy(position);
    flash.visible = true;
    this.flashes.push({ mesh: flash, light: null, lifetime: 0.15, age: 0 });
  }

  bulletImpact(position) {
    // Reduced from 6 to 3 particles
    for (let i = 0; i < 3; i++) {
      const mesh = this._getPoolMesh();
      mesh.material = SHARED.mats.spark;
      mesh.scale.setScalar(0.04);
      mesh.position.copy(position);
      mesh.visible = true;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 5,
        (Math.random() - 0.5) * 8
      );
      this.particles.push({ mesh, velocity: vel, lifetime: 0.2, age: 0, gravity: true, type: 'spark' });
    }
  }

  bloodEffect(position) {
    // Reduced from 8 to 4 particles
    for (let i = 0; i < 4; i++) {
      const mesh = this._getPoolMesh();
      mesh.material = SHARED.mats.blood;
      mesh.scale.setScalar(0.06);
      mesh.position.copy(position);
      mesh.visible = true;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 3,
        (Math.random() - 0.5) * 5
      );
      this.particles.push({ mesh, velocity: vel, lifetime: 0.35, age: 0, gravity: true, type: 'blood' });
    }
  }

  update(delta) {
    // Velocity temp vector — avoids clone() allocation every frame
    const tempVel = new THREE.Vector3();

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += delta;
      if (p.age >= p.lifetime) {
        p.mesh.visible = false;
        this.particles.splice(i, 1);
        continue;
      }
      tempVel.copy(p.velocity).multiplyScalar(delta);
      p.mesh.position.add(tempVel);
      if (p.gravity) {
        p.velocity.y -= 15 * delta;
        if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.velocity.set(0, 0, 0); }
      }
      const life = 1 - p.age / p.lifetime;
      p.mesh.scale.setScalar(p.mesh.scale.x * (life > 0.1 ? 1 : life / 0.1));
    }
    // Update flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += delta;
      if (f.age >= f.lifetime) {
        if (f.mesh) f.mesh.visible = false;
        this.flashes.splice(i, 1);
      }
    }
  }
}
