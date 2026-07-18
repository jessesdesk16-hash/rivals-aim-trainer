import * as THREE from 'three';

export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.flashes = [];
  }

  muzzleFlash(position, direction) {
    const geo = new THREE.SphereGeometry(0.15, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position).add(direction.clone().multiplyScalar(0.5));
    this.scene.add(mesh);

    const light = new THREE.PointLight(0xffaa00, 3, 8);
    light.position.copy(mesh.position);
    this.scene.add(light);

    this.flashes.push({ mesh, light, lifetime: 0.05, age: 0 });
  }

  bulletTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.02, 0.02, len, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.lookAt(to);
    mesh.rotateX(Math.PI / 2);
    this.scene.add(mesh);
    this.particles.push({ mesh, velocity: new THREE.Vector3(), lifetime: 0.1, age: 0, gravity: false, type: 'tracer' });
  }

  explosion(position, scale = 1) {
    for (let i = 0; i < 30; i++) {
      const size = (Math.random() * 0.15 + 0.05) * scale;
      const geo = new THREE.SphereGeometry(size, 4, 4);
      const colors = [0xff4400, 0xff8800, 0xffcc00, 0xff2200];
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 15 * scale,
        Math.random() * 12 * scale,
        (Math.random() - 0.5) * 15 * scale
      );
      this.particles.push({ mesh, velocity: vel, lifetime: 0.8 + Math.random() * 0.4, age: 0, gravity: true, type: 'explosion' });
    }
    // Flash light
    const light = new THREE.PointLight(0xff6600, 5, 20);
    light.position.copy(position);
    this.scene.add(light);
    this.flashes.push({ mesh: null, light, lifetime: 0.3, age: 0 });
  }

  bulletImpact(position) {
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.SphereGeometry(0.04, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 5,
        (Math.random() - 0.5) * 8
      );
      this.particles.push({ mesh, velocity: vel, lifetime: 0.3, age: 0, gravity: true, type: 'spark' });
    }
  }

  bloodEffect(position) {
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.SphereGeometry(0.06, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 3,
        (Math.random() - 0.5) * 5
      );
      this.particles.push({ mesh, velocity: vel, lifetime: 0.5, age: 0, gravity: true, type: 'blood' });
    }
  }

  update(delta) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += delta;
      if (p.age >= p.lifetime) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
      if (p.gravity) {
        p.velocity.y -= 15 * delta;
        if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.velocity.set(0, 0, 0); }
      }
      const life = 1 - p.age / p.lifetime;
      p.mesh.material.opacity = life;
      p.mesh.scale.setScalar(life);
    }
    // Update flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += delta;
      if (f.age >= f.lifetime) {
        if (f.mesh) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
        if (f.light) { this.scene.remove(f.light); }
        this.flashes.splice(i, 1);
      }
    }
  }
}
