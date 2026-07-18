export class HUD {
  constructor() {
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.armorFill = document.getElementById('armor-fill');
    this.armorText = document.getElementById('armor-text');
    this.ammoCurrent = document.getElementById('ammo-current');
    this.ammoMax = document.getElementById('ammo-max');
    this.ammoReserve = document.getElementById('ammo-reserve');
    this.weaponName = document.getElementById('weapon-name');
    this.crosshair = document.getElementById('crosshair');
    this.hitMarkerEl = document.getElementById('hit-marker');
    this.killFeed = document.getElementById('kill-feed');
    this.minimap = document.getElementById('minimap');
    this.scoreBlue = document.getElementById('score-blue');
    this.scoreRed = document.getElementById('score-red');
    this.gameModeInfo = document.getElementById('game-mode-info');
    this.hardpointTimer = document.getElementById('hardpoint-timer');
    this.killCount = document.getElementById('kill-count');
    this.streakNotif = document.getElementById('kill-streak-notification');
    this.damageOverlay = document.getElementById('damage-overlay');
    this.weaponSlots = document.getElementById('weapon-slots');
    this.reloadIndicator = document.getElementById('reload-indicator');
    this.waveAnnounce = document.getElementById('wave-announce');
    this.ctx = this.minimap ? this.minimap.getContext('2d') : null;
    this.hitMarkerTimer = 0;
    this.damageTimer = 0;
    this.streakTimer = 0;
    this.waveAnnounceTimer = 0;
  }

  update(data) {
    const d = data;
    // Health
    if (this.healthFill) {
      const hp = (d.health / d.maxHealth) * 100;
      this.healthFill.style.width = hp + '%';
      this.healthText.textContent = Math.ceil(d.health);
      if (d.health < 25) this.healthFill.style.background = 'linear-gradient(90deg,#cc0000,#ff3333)';
      else this.healthFill.style.background = 'linear-gradient(90deg,#00cc66,#00ff88)';
    }
    // Armor
    if (this.armorFill) {
      this.armorFill.style.width = (d.armor / d.maxArmor) * 100 + '%';
      this.armorText.textContent = Math.ceil(d.armor);
    }
    // Ammo
    if (this.ammoCurrent) {
      this.ammoCurrent.textContent = d.ammo;
      this.ammoMax.textContent = '/' + d.maxAmmo;
      this.ammoReserve.textContent = d.reserve;
      this.weaponName.textContent = d.weaponName;
    }
    // Reload
    if (this.reloadIndicator) {
      this.reloadIndicator.style.display = d.isReloading ? 'block' : 'none';
    }
    // Crosshair spread
    if (this.crosshair) {
      const spread = d.isADS ? 4 : (d.spread || 12);
      this.crosshair.style.setProperty('--spread', spread + 'px');
    }
    // Weapon slots
    if (this.weaponSlots) {
      const slots = this.weaponSlots.children;
      for (let i = 0; i < slots.length; i++) {
        slots[i].classList.toggle('active', i === d.weaponIndex);
      }
    }
    // Scores & Info
    if (this.scoreBlue) this.scoreBlue.textContent = d.blueScore || 0;
    if (this.scoreRed) this.scoreRed.textContent = d.redScore || 0;
    
    if (d.gameMode === 'HARDPOINT') {
       if (this.gameModeInfo) {
          this.gameModeInfo.innerHTML = `HARDPOINT<br><span id="hardpoint-timer" style="font-size: 0.9rem; color: #ffaa00;">${d.hardpointStatus || 'MOVING'}</span>`;
       }
    } else {
       if (this.gameModeInfo) {
          this.gameModeInfo.innerHTML = `TEAM DEATHMATCH<br><span id="hardpoint-timer" style="font-size: 0.9rem; color: #ffaa00;">FIRST TO 50</span>`;
       }
    }

    if (this.killCount) this.killCount.textContent = 'KILLS: ' + d.kills;
    // Damage overlay fade
    if (this.damageTimer > 0) {
      this.damageTimer -= d.delta;
      this.damageOverlay.style.opacity = Math.max(0, this.damageTimer / 0.3);
    }
    // Hit marker timer
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= d.delta;
      if (this.hitMarkerTimer <= 0) {
        this.hitMarkerEl.className = '';
      }
    }
    // Streak timer
    if (this.streakTimer > 0) {
      this.streakTimer -= d.delta;
      if (this.streakTimer <= 0) this.streakNotif.classList.remove('show');
    }
    // Wave announce
    if (this.waveAnnounceTimer > 0) {
      this.waveAnnounceTimer -= d.delta;
      if (this.waveAnnounceTimer <= 0 && this.waveAnnounce) {
        this.waveAnnounce.style.opacity = '0';
        this.waveAnnounce.style.transform = 'translate(-50%,-50%) scale(0)';
      }
    }
    // Minimap
    this.updateMinimap(d);
  }

  updateMinimap(d) {
    if (!this.ctx) return;
    const c = this.ctx;
    const size = 180;
    const mapSize = d.mapSize || 200;
    const scale = size / mapSize;

    c.clearRect(0, 0, size, size);
    c.fillStyle = 'rgba(5,5,15,0.8)';
    c.fillRect(0, 0, size, size);

    c.save();
    c.translate(size / 2, size / 2);

    // Hardpoint Zone
    if (d.hardpointPos) {
      c.beginPath();
      c.arc((d.hardpointPos.x - d.playerPos.x) * scale, (d.hardpointPos.z - d.playerPos.z) * scale, 15 * scale, 0, Math.PI * 2);
      c.strokeStyle = d.hardpointColor || 'rgba(255,170,0,0.6)';
      c.fillStyle = d.hardpointColor ? d.hardpointColor.replace('1)', '0.2)') : 'rgba(255,170,0,0.2)';
      c.lineWidth = 2;
      c.fill();
      c.stroke();
    }

    // Bots
    if (d.enemies) {
      for (const e of d.enemies) {
        if (!e.alive) continue;
        const ex = (e.x - d.playerPos.x) * scale;
        const ez = (e.z - d.playerPos.z) * scale;
        if (Math.abs(ex) < size / 2 && Math.abs(ez) < size / 2) {
          c.fillStyle = e.team === 1 ? '#00d0ff' : '#ff3e3e';
          c.beginPath();
          c.arc(ex, ez, 2, 0, Math.PI*2);
          c.fill();
        }
      }
    }

    // Player (center)
    c.fillStyle = '#00f0ff';
    c.beginPath();
    const rot = -(d.playerRotation || 0);
    c.moveTo(Math.sin(rot) * 6, -Math.cos(rot) * 6);
    c.lineTo(Math.sin(rot + 2.5) * 4, -Math.cos(rot + 2.5) * 4);
    c.lineTo(Math.sin(rot - 2.5) * 4, -Math.cos(rot - 2.5) * 4);
    c.closePath();
    c.fill();

    c.restore();
  }

  showHitMarker(isHeadshot) {
    this.hitMarkerEl.className = 'show' + (isHeadshot ? ' headshot' : '');
    this.hitMarkerTimer = 0.2;
  }

  showDamageIndicator() {
    this.damageOverlay.style.opacity = '1';
    this.damageTimer = 0.3;
  }

  showDirectionalDamage(angle) {
    const el = document.getElementById('directional-damage');
    if (el) {
      el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
      el.style.opacity = '1';
      setTimeout(() => { el.style.opacity = '0'; }, 1000);
    }
  }

  showKillFeed(message) {
    const el = document.createElement('div');
    el.className = 'kill-msg';
    el.textContent = message;
    this.killFeed.appendChild(el);
    if (this.killFeed.children.length > 5) this.killFeed.removeChild(this.killFeed.firstChild);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
  }

  showKillStreak(type) {
    this.streakNotif.textContent = type;
    this.streakNotif.classList.add('show');
    this.streakTimer = 2.5;
  }

  showWaveStart(waveNumber) {
    if (!this.waveAnnounce) return;
    this.waveAnnounce.textContent = 'WAVE ' + waveNumber;
    this.waveAnnounce.style.opacity = '1';
    this.waveAnnounce.style.transform = 'translate(-50%,-50%) scale(1)';
    this.waveAnnounceTimer = 2;
  }

  showGameOver(stats) {
    const el = document.getElementById('game-over');
    const statsEl = document.getElementById('game-over-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        Kills: <span>${stats.kills}</span><br>
        Waves Survived: <span>${stats.wave}</span><br>
        Shots Fired: <span>${stats.shots}</span><br>
        Accuracy: <span>${stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0}%</span>
      `;
    }
    if (el) el.style.display = 'flex';
  }

  hideGameOver() {
    const el = document.getElementById('game-over');
    if (el) el.style.display = 'none';
  }

  show() { document.getElementById('hud').style.display = 'block'; }
  hide() { document.getElementById('hud').style.display = 'none'; }
}
