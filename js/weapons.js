import * as THREE from 'three';
import { clamp, lerp } from './utils.js';

// Fixed weapon positions — allocated once, not per-frame
const HIP_POS = new THREE.Vector3(0.25, -0.15, -0.4);
const ADS_POS = new THREE.Vector3(0, -0.06, -0.25);

export class WeaponSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.allWeapons = [
      { id: 0, name: 'AK-47', type: 'assault_rifle', damage: 32, headMultiplier: 2.5, fireRate: 0.1, spread: 0.02, adsSpread: 0.005, ammo: 30, maxAmmo: 30, reserve: 150, reloadTime: 2.0, range: 150, auto: true },
      { id: 1, name: 'VIPER SMG', type: 'smg', damage: 18, headMultiplier: 2.0, fireRate: 0.06, spread: 0.035, adsSpread: 0.012, ammo: 35, maxAmmo: 35, reserve: 210, reloadTime: 1.5, range: 80, auto: true },
      { id: 2, name: 'THUNDER SNIPER', type: 'sniper', damage: 90, headMultiplier: 3.0, fireRate: 1.2, spread: 0.001, adsSpread: 0.0002, ammo: 5, maxAmmo: 5, reserve: 25, reloadTime: 3.0, range: 300, auto: false },
      { id: 3, name: 'PUMP SHOTGUN', type: 'shotgun', damage: 15, headMultiplier: 1.5, fireRate: 0.8, spread: 0.08, adsSpread: 0.04, ammo: 8, maxAmmo: 8, reserve: 40, reloadTime: 2.5, range: 30, auto: false }, // shoots 8 pellets in main.js
      { id: 4, name: 'HEAVY LMG', type: 'lmg', damage: 28, headMultiplier: 2.0, fireRate: 0.08, spread: 0.04, adsSpread: 0.015, ammo: 100, maxAmmo: 100, reserve: 300, reloadTime: 4.5, range: 120, auto: true },
      { id: 5, name: 'TACTICAL PISTOL', type: 'pistol', damage: 24, headMultiplier: 2.5, fireRate: 0.2, spread: 0.015, adsSpread: 0.005, ammo: 15, maxAmmo: 15, reserve: 60, reloadTime: 1.0, range: 60, auto: false },
      { id: 6, name: 'SHERIFF', type: 'revolver', damage: 55, headMultiplier: 3.0, fireRate: 0.4, spread: 0.008, adsSpread: 0.002, ammo: 6, maxAmmo: 6, reserve: 36, reloadTime: 2.2, range: 120, auto: false }
    ];
    this.weapons = []; // Current loadout
    this.currentIndex = 0;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.adsActive = false;
    this.adsTransition = 0;
    this.weaponMeshes = [];
    this.weaponGroup = new THREE.Group();
    this.recoilY = 0;
    this.recoilZ = 0;
    this.bobTimer = 0;
    this.lastShotFired = false;
    // Sheriff gun-spin animation
    this.spinTimer = 0;
    this.spinDuration = 0.55;
    // Sheriff toss-flip animation
    this.flipTimer = 0;
    this.flipDuration = 0.6;
  }

  init() {
    this.weaponGroup.position.set(0.25, -0.15, -0.4);
    this.camera.add(this.weaponGroup);
  }

  buildWeapons(loadoutConfig) {
    // Clear existing
    this.weaponMeshes.forEach(m => this.weaponGroup.remove(m));
    this.weaponMeshes = [];
    this.weapons = [];

    const dark = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.6, metalness: 0.5 });
    const barrel = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.9, roughness: 0.3 }); // Gold trim
    
    for (let i = 0; i < 3; i++) {
      const config = loadoutConfig[i];
      const weaponDef = { ...this.allWeapons[config.id] };
      this.weapons.push(weaponDef);

      const skinMat = new THREE.MeshStandardMaterial({ color: parseInt(config.skin), roughness: 0.4, metalness: 0.4 });
      
      let meshGroup = new THREE.Group();
      
      if (weaponDef.id === 0) { // AK-47
        meshGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.4), skinMat)); // Receiver
        const akB = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8), gold);
        akB.rotation.x = Math.PI / 2; akB.position.set(0, 0.02, -0.4); meshGroup.add(akB); // Barrel
        const akGas = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 8), barrel);
        akGas.rotation.x = Math.PI / 2; akGas.position.set(0, 0.04, -0.3); meshGroup.add(akGas); // Gas tube
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.15), wood);
        handguard.position.set(0, 0.02, -0.3); meshGroup.add(handguard); // Wood handguard
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.2), wood);
        stock.position.set(0, -0.02, 0.3); meshGroup.add(stock); // Wood stock
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.08), dark);
        mag.position.set(0, -0.1, -0.05); mag.rotation.x = Math.PI / 8; meshGroup.add(mag); // Mag
        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), dark);
        rearSight.position.set(0, 0.05, 0.1); meshGroup.add(rearSight); // Rear sight
        const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.01), dark);
        frontSight.position.set(0, 0.04, -0.55); meshGroup.add(frontSight); // Front sight
      } 
      else if (weaponDef.id === 1) { // SMG
        meshGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.3), skinMat)); // Body
        const smgB = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), barrel);
        smgB.rotation.x = Math.PI / 2; smgB.position.set(0, 0.02, -0.25); meshGroup.add(smgB);
        const smgMag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.05), dark);
        smgMag.position.set(0, -0.1, 0); meshGroup.add(smgMag);
        const smgSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3e3e }));
        smgSight.position.set(0, 0.05, -0.05); meshGroup.add(smgSight);
      }
      else if (weaponDef.id === 2) { // SNIPER
        meshGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.6), skinMat)); // Body
        const snpB = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8), barrel);
        snpB.rotation.x = Math.PI / 2; snpB.position.set(0, 0.02, -0.6); meshGroup.add(snpB);
        const scopeMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, side: THREE.DoubleSide });
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 16, 1, true), scopeMat);
        scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.06, -0.05); meshGroup.add(scope);
        const snpMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.08), dark);
        snpMag.position.set(0, -0.08, -0.1); meshGroup.add(snpMag);
      }
      else if (weaponDef.id === 3) { // SHOTGUN
        meshGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.5), skinMat)); // Body
        const shotB = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), barrel);
        shotB.rotation.x = Math.PI / 2; shotB.position.set(0, 0.02, -0.45); meshGroup.add(shotB);
        const shotTube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), barrel);
        shotTube.rotation.x = Math.PI / 2; shotTube.position.set(0, -0.02, -0.42); meshGroup.add(shotTube);
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.15), wood);
        pump.position.set(0, -0.02, -0.3); meshGroup.add(pump);
        const shotSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
        shotSight.position.set(0, 0.05, -0.6); meshGroup.add(shotSight); // Sight aim point Y=0.06 (requires sight at 0.05 + 0.01 = 0.06)
      }
      else if (weaponDef.id === 4) { // LMG
        meshGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.45), skinMat)); // Body
        const lmgB = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), barrel);
        lmgB.rotation.x = Math.PI / 2; lmgB.position.set(0, 0.02, -0.4); meshGroup.add(lmgB);
        const boxMag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.15), dark);
        boxMag.position.set(0, -0.12, -0.05); meshGroup.add(boxMag);
        const lmgSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02), dark);
        lmgSight.position.set(0, 0.05, 0.1); meshGroup.add(lmgSight);
      }
      else if (weaponDef.id === 5) { // PISTOL
        meshGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.15), skinMat)); // Slide
        const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.05), dark);
        pistolGrip.position.set(0, -0.06, 0.04); pistolGrip.rotation.x = -Math.PI / 8; meshGroup.add(pistolGrip);
        const pistolSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
        pistolSight.position.set(0, 0.04, -0.06); meshGroup.add(pistolSight);
      }
      else if (weaponDef.id === 6) { // SHERIFF REVOLVER
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.14), skinMat);
        frame.position.set(0, 0.01, 0.01); meshGroup.add(frame); // Frame
        const revBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 10), barrel);
        revBarrel.rotation.x = Math.PI / 2; revBarrel.position.set(0, 0.02, -0.17); meshGroup.add(revBarrel); // Long barrel
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.07, 6), gold);
        drum.rotation.x = Math.PI / 2; drum.position.set(0, -0.005, -0.04); meshGroup.add(drum); // Revolving cylinder
        const revGrip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.05), wood);
        revGrip.position.set(0, -0.07, 0.07); revGrip.rotation.x = -Math.PI / 6; meshGroup.add(revGrip); // Wood grip
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.02), dark);
        hammer.position.set(0, 0.045, 0.07); meshGroup.add(hammer); // Hammer
        const revSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.01), gold);
        revSight.position.set(0, 0.04, -0.27); meshGroup.add(revSight); // Front sight
      }

      meshGroup.visible = (i === 0);
      this.weaponMeshes.push(meshGroup);
      this.weaponGroup.add(meshGroup);
    }
    
    this.currentIndex = 0;
  }

  getCurrentWeapon() { return this.weapons[this.currentIndex]; }
  getCurrentIndex() { return this.currentIndex; }

  switchWeapon(index) {
    if (index === this.currentIndex || this.isReloading || index < 0 || index > 2) return;
    this._cancelSpin();
    this._cancelFlip();
    this.weaponMeshes[this.currentIndex].visible = false;
    this.currentIndex = index;
    this.weaponMeshes[this.currentIndex].visible = true;
    this.fireTimer = 0.2;
    // Sheriff gets a flashy draw spin
    if (this.weapons[index].type === 'revolver') this.startSpin();
  }

  startSpin() {
    if (this.spinTimer > 0 || this.flipTimer > 0 || this.isReloading) return; // one trick at a time
    if (this.weapons[this.currentIndex].type !== 'revolver') return;
    this.spinTimer = this.spinDuration;
  }

  startFlip() {
    if (this.flipTimer > 0 || this.spinTimer > 0 || this.isReloading) return; // one trick at a time
    if (this.weapons[this.currentIndex].type !== 'revolver') return;
    this.flipTimer = this.flipDuration;
  }

  _cancelSpin() {
    if (this.spinTimer > 0) {
      this.spinTimer = 0;
      this.weaponMeshes[this.currentIndex].rotation.x = 0;
    }
  }

  _cancelFlip() {
    if (this.flipTimer > 0) {
      this.flipTimer = 0;
      const mesh = this.weaponMeshes[this.currentIndex];
      mesh.rotation.x = 0;
      mesh.position.y = 0;
    }
  }

  shoot(isFiring) {
    if (this.isReloading || this.fireTimer > 0) return null;
    this._cancelSpin(); // firing snaps the gun out of its spin
    this._cancelFlip(); // ...and out of its flip
    const w = this.weapons[this.currentIndex];
    if (w.ammo <= 0) { this.reload(); return null; }
    if (!w.auto && this.lastShotFired) return null;
    w.ammo--;
    this.fireTimer = w.fireRate;
    this.lastShotFired = true;
    this.recoilY = -0.015;
    this.recoilZ = 0.02;
    const spread = this.adsActive ? w.adsSpread : w.spread;
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    if (w.type !== 'shotgun') {
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.normalize();
    }
    if (w.ammo <= 0 && w.reserve > 0) setTimeout(() => this.reload(), 300);
    return { direction: dir, spread, range: w.range, damage: w.damage, headMultiplier: w.headMultiplier, type: w.type };
  }

  reload() {
    const w = this.weapons[this.currentIndex];
    if (this.isReloading || w.ammo === w.maxAmmo || w.reserve <= 0) return false;
    this._cancelSpin();
    this._cancelFlip();
    this.isReloading = true;
    this.reloadTimer = w.reloadTime;
    return true;
  }

  startADS() { this.adsActive = true; }
  stopADS() { this.adsActive = false; }
  isADS() { return this.adsTransition > 0.5; }
  getADSTransition() { return this.adsTransition; }
  addAmmo(amt) { this.weapons[this.currentIndex].reserve += amt; }

  update(delta, isMoving, isSprinting) {
    if (this.fireTimer > 0) this.fireTimer -= delta;
    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        const w = this.weapons[this.currentIndex];
        const needed = w.maxAmmo - w.ammo;
        const avail = Math.min(needed, w.reserve);
        w.ammo += avail; w.reserve -= avail;
        this.isReloading = false;
      }
    }
    this.adsTransition = lerp(this.adsTransition, this.adsActive ? 1 : 0, delta * 8);
    this.weaponGroup.position.lerpVectors(HIP_POS, ADS_POS, this.adsTransition);
    if (isMoving && !this.adsActive) {
      this.bobTimer += delta * (isSprinting ? 14 : 8);
      this.weaponGroup.position.y += Math.sin(this.bobTimer) * 0.008;
      this.weaponGroup.position.x += Math.cos(this.bobTimer * 0.5) * 0.004;
    }
    this.weaponGroup.rotation.z = Math.sin(performance.now() * 0.001) * 0.002 * (1 - this.adsTransition);
    this.recoilY = lerp(this.recoilY, 0, delta * 12);
    this.recoilZ = lerp(this.recoilZ, 0, delta * 12);
    this.weaponGroup.position.y += this.recoilY;
    this.weaponGroup.position.z += this.recoilZ;

    // Sheriff gun spin — full cowboy twirl around the trigger guard
    if (this.spinTimer > 0) {
      this.spinTimer -= delta;
      const mesh = this.weaponMeshes[this.currentIndex];
      if (this.spinTimer <= 0) {
        this.spinTimer = 0;
        mesh.rotation.x = 0;
      } else {
        const t = 1 - this.spinTimer / this.spinDuration; // 0 → 1
        const eased = 1 - Math.pow(1 - t, 2); // ease-out: fast whip, gentle catch
        mesh.rotation.x = -eased * Math.PI * 2;
      }
    }

    // Sheriff toss-flip — gun flips end-over-end in the air and lands back in hand
    if (this.flipTimer > 0) {
      this.flipTimer -= delta;
      const mesh = this.weaponMeshes[this.currentIndex];
      if (this.flipTimer <= 0) {
        this.flipTimer = 0;
        mesh.rotation.x = 0;
        mesh.position.y = 0;
      } else {
        const t = 1 - this.flipTimer / this.flipDuration; // 0 → 1
        mesh.position.y = Math.sin(t * Math.PI) * 0.22;   // tossed up, caught on the way down
        mesh.rotation.x = t * Math.PI * 2;                 // forward flip (opposite direction to the spin)
      }
    }
  }

  resetShotFlag() { this.lastShotFired = false; }
}
