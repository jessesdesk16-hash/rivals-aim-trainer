// ===== ALTERNATE INPUT: TOUCH + GAMEPAD =====
// Both feed the same state the keyboard/mouse produce, so the rest of the game
// doesn't need to know where input came from.

export function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

// ---------- TOUCH ----------
export class TouchControls {
  constructor(player, actions) {
    this.player = player;
    this.actions = actions || {};
    this.enabled = false;
    this.root = document.getElementById('touch-controls');

    // Joystick state
    this.moveTouchId = null;
    this.moveOrigin = { x: 0, y: 0 };
    this.knob = document.getElementById('tc-knob');
    this.stickBase = document.getElementById('tc-stick');

    // Look state
    this.lookTouchId = null;
    this.lookLast = { x: 0, y: 0 };
    this.lookSensitivity = 0.004;

    this._bind();
  }

  enable() {
    this.enabled = true;
    if (this.root) this.root.style.display = 'block';
  }

  disable() {
    this.enabled = false;
    if (this.root) this.root.style.display = 'none';
    this._resetMove();
  }

  _resetMove() {
    this.moveTouchId = null;
    this.player.analogMove.x = 0;
    this.player.analogMove.z = 0;
    if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
  }

  _bind() {
    // Action buttons — press/release map onto the player's virtual key state
    const holdBtn = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('active'); onDown && onDown(); };
      const up = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('active'); onUp && onUp(); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      // Also work with a mouse so it's testable on desktop
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', (e) => { if (el.classList.contains('active')) up(e); });
    };

    const p = this.player;
    holdBtn('tc-fire',   () => p.setVirtualFire(true),  () => p.setVirtualFire(false));
    holdBtn('tc-ads',    () => p.setVirtualADS(true),   () => p.setVirtualADS(false));
    holdBtn('tc-jump',   () => p.setVirtualKey('Space', true),      () => p.setVirtualKey('Space', false));
    holdBtn('tc-sprint', () => p.setVirtualKey('ShiftLeft', true),  () => p.setVirtualKey('ShiftLeft', false));
    holdBtn('tc-slide',  () => p.setVirtualKey('KeyC', true),       () => p.setVirtualKey('KeyC', false));
    holdBtn('tc-reload', () => p.setVirtualKey('KeyR', true),       () => p.setVirtualKey('KeyR', false));
    holdBtn('tc-melee',  () => p.setVirtualKey('KeyF', true),       () => p.setVirtualKey('KeyF', false));
    holdBtn('tc-nade',   () => p.setVirtualKey('KeyG', true),       () => p.setVirtualKey('KeyG', false));
    holdBtn('tc-swap',   () => this.actions.onSwapWeapon && this.actions.onSwapWeapon());

    // Joystick + look area live on the document so drags can leave their element
    document.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
    document.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });
  }

  _isOnButton(target) {
    return !!(target && target.closest && target.closest('.tc-btn'));
  }

  _onTouchStart(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      if (this._isOnButton(t.target)) continue; // buttons handle themselves
      const leftHalf = t.clientX < window.innerWidth * 0.45;
      if (leftHalf && this.moveTouchId === null) {
        this.moveTouchId = t.identifier;
        this.moveOrigin.x = t.clientX;
        this.moveOrigin.y = t.clientY;
        if (this.stickBase) {
          this.stickBase.style.left = t.clientX + 'px';
          this.stickBase.style.top = t.clientY + 'px';
          this.stickBase.style.opacity = '1';
        }
        e.preventDefault();
      } else if (!leftHalf && this.lookTouchId === null) {
        this.lookTouchId = t.identifier;
        this.lookLast.x = t.clientX;
        this.lookLast.y = t.clientY;
        e.preventDefault();
      }
    }
  }

  _onTouchMove(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveTouchId) {
        const dx = t.clientX - this.moveOrigin.x;
        const dy = t.clientY - this.moveOrigin.y;
        const maxR = 55;
        const dist = Math.min(Math.hypot(dx, dy), maxR);
        const ang = Math.atan2(dy, dx);
        const kx = Math.cos(ang) * dist, ky = Math.sin(ang) * dist;
        if (this.knob) this.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
        // Normalized: x = strafe, z = forward (screen-up is forward)
        this.player.analogMove.x = (kx / maxR);
        this.player.analogMove.z = -(ky / maxR);
        e.preventDefault();
      } else if (t.identifier === this.lookTouchId) {
        const dx = t.clientX - this.lookLast.x;
        const dy = t.clientY - this.lookLast.y;
        this.lookLast.x = t.clientX;
        this.lookLast.y = t.clientY;
        this.player.applyLook(dx * this.lookSensitivity, dy * this.lookSensitivity);
        e.preventDefault();
      }
    }
  }

  _onTouchEnd(e) {
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveTouchId) {
        this._resetMove();
        if (this.stickBase) this.stickBase.style.opacity = '0.35';
      } else if (t.identifier === this.lookTouchId) {
        this.lookTouchId = null;
      }
    }
  }
}

// ---------- GAMEPAD ----------
// Standard mapping: LS move, RS look, RT fire, LT ADS, A jump, X reload,
// B melee, RB grenade, LB/dpad weapon swap.
export class GamepadInput {
  constructor(player, actions) {
    this.player = player;
    this.actions = actions || {};
    this.connected = false;
    this.deadzone = 0.18;
    this.lookSpeed = 2.6;      // radians/sec at full stick
    this.prev = {};            // edge detection for buttons

    window.addEventListener('gamepadconnected', () => { this.connected = true; this._notify(true); });
    window.addEventListener('gamepaddisconnected', () => { this.connected = false; this._notify(false); });
  }

  _notify(on) {
    const el = document.getElementById('gamepad-indicator');
    if (el) el.style.display = on ? 'block' : 'none';
  }

  _dz(v) { return Math.abs(v) < this.deadzone ? 0 : v; }

  // Rising-edge test so a held button fires an action once
  _pressed(name, isDown) {
    const was = !!this.prev[name];
    this.prev[name] = isDown;
    return isDown && !was;
  }

  update(delta) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const g of pads) { if (g && g.connected) { pad = g; break; } }
    if (!pad) {
      if (this.connected) {
        // Clear any held input so a disconnect mid-press doesn't stick
        this.connected = false;
        this._notify(false);
        this.player.analogMove.x = 0;
        this.player.analogMove.z = 0;
        this.player.setVirtualFire(false);
        this.player.setVirtualADS(false);
        for (const c of ['Space', 'KeyR', 'KeyF', 'KeyG', 'ShiftLeft', 'KeyC']) this.player.setVirtualKey(c, false);
        this.prev = {};
      }
      return false;
    }
    if (!this.connected) { this.connected = true; this._notify(true); }

    const p = this.player;
    const ax = pad.axes;

    // Left stick -> movement
    p.analogMove.x = this._dz(ax[0] || 0);
    p.analogMove.z = -this._dz(ax[1] || 0);

    // Right stick -> look
    const lx = this._dz(ax[2] || 0), ly = this._dz(ax[3] || 0);
    if (lx || ly) p.applyLook(lx * this.lookSpeed * delta, ly * this.lookSpeed * delta);

    const btn = (i) => pad.buttons[i] && pad.buttons[i].pressed;
    const val = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);

    // Triggers
    p.setVirtualFire(val(7) > 0.35 || btn(7));
    p.setVirtualADS(val(6) > 0.35 || btn(6));

    // Face / shoulder buttons
    p.setVirtualKey('Space', btn(0));
    p.setVirtualKey('KeyR', btn(2));
    p.setVirtualKey('KeyF', btn(1));
    p.setVirtualKey('KeyG', btn(5));
    p.setVirtualKey('ShiftLeft', btn(10)); // left stick click = sprint
    p.setVirtualKey('KeyC', btn(11));      // right stick click = slide

    if (this._pressed('swap', btn(4))) this.actions.onSwapWeapon && this.actions.onSwapWeapon();
    if (this._pressed('pause', btn(9))) this.actions.onPause && this.actions.onPause();

    return true;
  }
}
