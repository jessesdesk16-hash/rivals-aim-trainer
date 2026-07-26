import * as THREE from 'three';
import { clamp, resolveCollisions } from './utils.js';

// Reusable temp vectors — avoids allocating new Vector3s every frame
const _UP = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

export const KeyBinds = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  slide: 'KeyC',
  reload: 'KeyR',
  melee: 'KeyF',
  spin: 'KeyB',
  flip: 'KeyV',
  wep1: 'Digit1',
  wep2: 'Digit2',
  wep3: 'Digit3'
};

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.position = new THREE.Vector3(0, 1.7, 0);
    this.velocity = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.health = 100; this.maxHealth = 100;
    this.armor = 0; this.maxArmor = 100;
    this.moveSpeed = 12;
    this.sprintMultiplier = 1.6;
    this.jumpForce = 8;
    this.gravity = 20;
    this.isGrounded = true;
    this.jumpCount = 0;
    this.maxJumps = 2;
    this.jumpKeyPressed = false;
    this.isSprinting = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideDuration = 0.6;
    this.slideCooldown = 0;
    this.slideDir = new THREE.Vector3();
    this.standHeight = 1.7;
    this.crouchHeight = 1.0;
    this.currentHeight = 1.7;
    this.keys = {};
    this.mouseSensitivity = 0.002;
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.alive = true;
    this.collisionBoxes = [];
    this.headBobTimer = 0;
    this.locked = false;
    this.targetFOV = 75;
    this.scrollDelta = 0;

    // Alternate input (touch / gamepad). analogMove overrides WASD when non-zero;
    // virtual keys and fire flags OR together with the physical ones.
    this.analogMove = { x: 0, z: 0 };
    this.virtualKeys = {};
    this.virtualFire = false;
    this.virtualADS = false;

    this._onWheel = (e) => { if (this.locked) this.scrollDelta += Math.sign(e.deltaY); };
    this._onKeyDown = (e) => { this.keys[e.code] = true; };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouseMove = (e) => { if (this.locked) this.handleMouseMove(e); };
    this._onMouseDown = (e) => { if (e.button === 0) this.mouseDown = true; if (e.button === 2) this.rightMouseDown = true; };
    this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; if (e.button === 2) this.rightMouseDown = false; };
    this._onContext = (e) => e.preventDefault();
    this._onPointerLock = () => { this.locked = !!document.pointerLockElement; };
  }

  init(spawnPoint) {
    this.position.set(spawnPoint.x, this.standHeight, spawnPoint.z);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.armor = 0;
    this.alive = true;
    this.euler.set(0, 0, 0);
    this.keys = {};

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onPointerLock);
    document.addEventListener('wheel', this._onWheel);
  }

  setCollisionBoxes(boxes) { this.collisionBoxes = boxes; }

  requestPointerLock() {
    // Touch devices steer via TouchControls — pointer lock is meaningless there
    // and throws on some mobile browsers.
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) return;
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.requestPointerLock) {
      const r = canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }
  }

  handleMouseMove(e) {
    this.euler.y -= e.movementX * this.mouseSensitivity;
    this.euler.x -= e.movementY * this.mouseSensitivity;
    this.euler.x = clamp(this.euler.x, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }

  // ---- alternate input hooks (touch / gamepad) ----
  // Look deltas arrive already scaled in radians, so they bypass mouseSensitivity.
  applyLook(dx, dy) {
    this.euler.y -= dx;
    this.euler.x -= dy;
    this.euler.x = clamp(this.euler.x, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }
  setVirtualKey(code, down) { this.virtualKeys[code] = !!down; }
  setVirtualFire(down) { this.virtualFire = !!down; }
  setVirtualADS(down) { this.virtualADS = !!down; }
  // True if either the physical key or its virtual counterpart is held
  key(code) { return !!(this.keys[code] || this.virtualKeys[code]); }

  update(delta) {
    if (!this.alive) return;

    // Movement direction (reused temp vectors — no per-frame allocation)
    const forward = _forward.set(0, 0, -1);
    const right = _right.set(1, 0, 0);
    const yaw = this.euler.y;
    forward.applyAxisAngle(_UP, yaw);
    right.applyAxisAngle(_UP, yaw);

    const moveDir = _moveDir.set(0, 0, 0);
    // Analog stick (touch joystick / gamepad) takes priority when deflected
    const aMag = Math.hypot(this.analogMove.x, this.analogMove.z);
    if (aMag > 0.01) {
      moveDir.addScaledVector(forward, this.analogMove.z);
      moveDir.addScaledVector(right, this.analogMove.x);
    } else {
      if (this.key(KeyBinds.forward)) moveDir.add(forward);
      if (this.key(KeyBinds.backward)) moveDir.sub(forward);
      if (this.key(KeyBinds.left)) moveDir.sub(right);
      if (this.key(KeyBinds.right)) moveDir.add(right);
    }

    // Sprint — needs the sprint key plus forward input (stick or W)
    const movingForward = this.key(KeyBinds.forward) || (aMag > 0.85 && this.analogMove.z > 0.6);
    this.isSprinting = this.key(KeyBinds.sprint) && movingForward && !this.isSliding;

    // Slide
    if (this.slideCooldown > 0) this.slideCooldown -= delta;
    if (this.key(KeyBinds.slide) && this.isSprinting && !this.isSliding && this.slideCooldown <= 0) {
      this.isSliding = true;
      this.slideTimer = this.slideDuration;
      this.slideDir.copy(forward);
      this.slideCooldown = 0.3;
    }

    if (this.isSliding) {
      this.slideTimer -= delta;
      this.currentHeight = this.crouchHeight;
      const slideSpeed = this.moveSpeed * 1.8 * (this.slideTimer / this.slideDuration);
      this.velocity.x = this.slideDir.x * slideSpeed;
      this.velocity.z = this.slideDir.z * slideSpeed;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        this.currentHeight = this.standHeight;
      }
    } else {
      this.currentHeight = this.standHeight;
      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        const speed = this.moveSpeed * (this.isSprinting ? this.sprintMultiplier : 1);
        this.velocity.x = moveDir.x * speed;
        this.velocity.z = moveDir.z * speed;
      } else {
        this.velocity.x *= 0.85;
        this.velocity.z *= 0.85;
        if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
        if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
      }
    }

    // Jump & gravity
    if (this.key(KeyBinds.jump)) {
      if (!this.jumpKeyPressed) {
        if (this.isSliding) {
          // Slide-jump: preserve slide momentum + add upward velocity
          this.velocity.y = this.jumpForce * 1.1; // slightly higher jump
          // Keep the horizontal velocity from the slide (don't reset it)
          this.isSliding = false;
          this.currentHeight = this.standHeight;
          this.isGrounded = false;
          this.jumpCount = 1;
        } else if (this.isGrounded || this.jumpCount < this.maxJumps) {
          this.velocity.y = this.jumpForce;
          this.isGrounded = false;
          this.jumpCount++;
        }
      }
      this.jumpKeyPressed = true;
    } else {
      this.jumpKeyPressed = false;
    }
    this.velocity.y -= this.gravity * delta;

    // Apply velocity
    this.position.x += this.velocity.x * delta;
    this.position.z += this.velocity.z * delta;
    this.position.y += this.velocity.y * delta;

    // Ground check
    if (this.position.y <= this.currentHeight) {
      this.position.y = this.currentHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
      this.jumpCount = 0;
      
      if (this.key(KeyBinds.jump) && this.isMoving()) {
        // Bunny hop: preserve momentum and immediately jump again
        const currentSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.jumpCount = 1;
        // Preserve 70% momentum
        if (currentSpeed > this.moveSpeed) {
          const scale = (this.moveSpeed + (currentSpeed - this.moveSpeed) * 0.7) / currentSpeed;
          this.velocity.x *= scale;
          this.velocity.z *= scale;
        }
      }
    }

    // Collision with world
    const resolved = resolveCollisions(this.position, 0.5, this.collisionBoxes);
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    // Head bob
    if (this.isMoving() && this.isGrounded && !this.isSliding) {
      const bobSpeed = this.isSprinting ? 12 : 7;
      this.headBobTimer += delta * bobSpeed;
      const bobY = Math.sin(this.headBobTimer) * 0.04;
      this.camera.position.set(this.position.x, this.position.y + bobY, this.position.z);
    } else {
      this.camera.position.set(this.position.x, this.position.y, this.position.z);
    }

    // Camera rotation
    this.camera.rotation.copy(this.euler);

    // Sprint FOV
    this.targetFOV = this.isSliding ? 85 : (this.isSprinting ? 82 : 75);
    if (Math.abs(this.camera.fov - this.targetFOV) > 0.1) {
      this.camera.fov += (this.targetFOV - this.camera.fov) * 10 * delta;
      this.camera.updateProjectionMatrix();
    }
  }

  takeDamage(amount) {
    if (!this.alive) return;
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.6);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    if (this.health <= 0) { this.health = 0; this.alive = false; }
  }

  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }
  addArmor(amount) { this.armor = Math.min(this.maxArmor, this.armor + amount); }
  getHealth() { return this.health; }
  getArmor() { return this.armor; }
  isAlive() { return this.alive; }
  getPosition() { return this.position.clone(); }
  getDirection() { const d = new THREE.Vector3(0, 0, -1); d.applyEuler(this.euler); return d; }
  isMoving() {
    if (Math.hypot(this.analogMove.x, this.analogMove.z) > 0.01) return true;
    return this.key(KeyBinds.forward) || this.key(KeyBinds.left) || this.key(KeyBinds.backward) || this.key(KeyBinds.right);
  }
  getIsSprinting() { return this.isSprinting; }
  getIsSliding() { return this.isSliding; }
  getMouseDown() { return this.mouseDown || this.virtualFire; }
  getRightMouseDown() { return this.rightMouseDown || this.virtualADS; }
  getEuler() { return this.euler; }

  getScrollDelta() {
    const d = this.scrollDelta;
    this.scrollDelta = 0;
    return d;
  }

  applyExplosionForce(explosionPos, force) {
    const dir = new THREE.Vector3().subVectors(this.position, explosionPos).normalize();
    this.velocity.add(dir.multiplyScalar(force));
    this.isGrounded = false;
    this.jumpCount = this.maxJumps; // prevent double-jump after boost
  }

  reset(spawnPoint) {
    this.position.set(spawnPoint.x, this.standHeight, spawnPoint.z);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.armor = 0;
    this.alive = true;
    this.euler.set(0, 0, 0);
    this.keys = {};
    this.isSliding = false;
    this.isSprinting = false;
    this.jumpCount = 0;
    this.jumpKeyPressed = false;
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onPointerLock);
    document.removeEventListener('wheel', this._onWheel);
  }
}
