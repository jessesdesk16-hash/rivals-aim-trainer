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
    this.grenadeEl = document.getElementById('grenade-count');
    this.ctx = this.minimap ? this.minimap.getContext('2d') : null;
    this.hitMarkerTimer = 0;
    this.damageTimer = 0;
    this.streakTimer = 0;
    this.waveAnnounceTimer = 0;
    // Cache of last-written values — DOM is only touched when something changes
    this._last = {};
  }

  update(data) {
    const d = data;
    const L = this._last;
    // Health
    if (this.healthFill) {
      const hp = Math.ceil(d.health);
      if (L.hp !== hp) {
        L.hp = hp;
        this.healthFill.style.width = (d.health / d.maxHealth) * 100 + '%';
        this.healthText.textContent = hp;
      }
      const lowHp = d.health < 25;
      if (L.lowHp !== lowHp) {
        L.lowHp = lowHp;
        this.healthFill.style.background = lowHp
          ? 'linear-gradient(90deg,#cc0000,#ff3333)'
          : 'linear-gradient(90deg,#00cc66,#00ff88)';
      }
    }
    // Armor
    if (this.armorFill) {
      const ar = Math.ceil(d.armor);
      if (L.armor !== ar) {
        L.armor = ar;
        this.armorFill.style.width = (d.armor / d.maxArmor) * 100 + '%';
        this.armorText.textContent = ar;
      }
    }
    // Ammo
    if (this.ammoCurrent) {
      if (L.ammo !== d.ammo) { L.ammo = d.ammo; this.ammoCurrent.textContent = d.ammo; }
      if (L.maxAmmo !== d.maxAmmo) { L.maxAmmo = d.maxAmmo; this.ammoMax.textContent = '/' + d.maxAmmo; }
      if (L.reserve !== d.reserve) { L.reserve = d.reserve; this.ammoReserve.textContent = d.reserve; }
      if (L.weaponName !== d.weaponName) { L.weaponName = d.weaponName; this.weaponName.textContent = d.weaponName; }
    }
    // Reload
    if (this.reloadIndicator && L.isReloading !== d.isReloading) {
      L.isReloading = d.isReloading;
      this.reloadIndicator.style.display = d.isReloading ? 'block' : 'none';
    }
    // Crosshair spread
    if (this.crosshair) {
      const spread = d.isADS ? 4 : (d.spread || 12);
      if (L.spread !== spread) {
        L.spread = spread;
        this.crosshair.style.setProperty('--spread', spread + 'px');
      }
    }
    // Weapon slots
    if (this.weaponSlots && L.weaponIndex !== d.weaponIndex) {
      L.weaponIndex = d.weaponIndex;
      const slots = this.weaponSlots.children;
      for (let i = 0; i < slots.length; i++) {
        slots[i].classList.toggle('active', i === d.weaponIndex);
      }
    }
    // Scores & Info
    if (this.scoreBlue && L.blueScore !== d.blueScore) { L.blueScore = d.blueScore; this.scoreBlue.textContent = d.blueScore || 0; }
    if (this.scoreRed && L.redScore !== d.redScore) { L.redScore = d.redScore; this.scoreRed.textContent = d.redScore || 0; }

    if (this.gameModeInfo) {
      let info;
      if (d.gameMode === 'ELIMINATION') {
        info = `ROUND ${d.roundNumber || 1} / 5`;
        if (d.buyPhaseTimer > 0) {
          info += `<br><span style="font-size: 1.2rem; color: #ffaa00; animation: pulse 0.5s infinite;">ROUND STARTS IN ${d.buyPhaseTimer}</span>`;
        } else {
          // Count alive
          let blueAlive = 0, redAlive = 0;
          if (d.enemies) {
            for (const e of d.enemies) {
              if (e.alive) { if (e.team === 1) blueAlive++; else redAlive++; }
            }
          }
          if (d.health > 0) blueAlive++; // player
          info += `<br><span style="font-size: 0.9rem; color: #00aaff;">🔵 ${blueAlive}</span> <span style="color: #666;">vs</span> <span style="font-size: 0.9rem; color: #ff3e3e;">${redAlive} 🔴</span>`;
        }
      } else if (d.gameMode === 'HARDPOINT') {
        info = `HARDPOINT<br><span style="font-size: 0.9rem; color: #ffaa00;">${d.hardpointStatus || 'MOVING'}</span>`;
      } else {
        info = `TEAM DEATHMATCH<br><span style="font-size: 0.9rem; color: #ffaa00;">FIRST TO 50</span>`;
      }
      if (L.modeInfo !== info) {
        L.modeInfo = info;
        this.gameModeInfo.innerHTML = info;
      }
    }

    // Grenade count display
    if (this.grenadeEl && d.grenadeCount !== undefined && L.grenadeCount !== d.grenadeCount) {
      L.grenadeCount = d.grenadeCount;
      this.grenadeEl.textContent = '🧨 ' + d.grenadeCount;
    }

    if (this.killCount && L.kills !== d.kills) {
      L.kills = d.kills;
      this.killCount.textContent = 'KILLS: ' + d.kills;
    }
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
        const ex = (e.position.x - d.playerPos.x) * scale;
        const ez = (e.position.z - d.playerPos.z) * scale;
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

  showKillFeed(killer, victim = null, weapon = null, isHeadshot = false) {
    const el = document.createElement('div');
    el.className = 'kill-msg';

    if (!victim) {
      // System message
      const isNegative = killer.includes('☠');
      el.innerHTML = `<span class="${isNegative ? 'kill-enemy-system' : 'kill-system'}">${killer}</span>`;
    } else {
      // Weapon SVG mapping
      const icons = {
        'AK-47': '<svg viewBox="0 0 100 30" style="height:24px; fill:white; opacity:0.9"><path d="M0,22 L15,22 L25,10 L80,10 L80,13 L100,13 L100,16 L80,16 L70,22 L50,22 C48,28 44,30 40,30 L35,30 C40,26 42,24 42,22 L20,22 Z"/></svg>',
        'VIPER SMG': '<svg viewBox="0 0 100 30" style="height:22px; fill:white; opacity:0.9"><path d="M20,22 L25,12 L60,12 L60,16 L80,16 L80,18 L60,18 L55,22 L45,22 L45,30 L35,30 L35,22 Z"/></svg>',
        'THUNDER SNIPER': '<svg viewBox="0 0 100 30" style="height:24px; fill:white; opacity:0.9"><path d="M0,22 L15,22 L25,12 L100,12 L100,16 L50,16 L45,22 L20,22 Z M40,6 L70,6 L70,10 L40,10 Z"/></svg>',
        'PUMP SHOTGUN': '<svg viewBox="0 0 100 30" style="height:24px; fill:white; opacity:0.9"><path d="M0,20 L15,20 L25,12 L90,12 L90,16 L50,16 L45,20 L20,20 Z M60,16 L80,16 L80,20 L60,20 Z"/></svg>',
        'HEAVY LMG': '<svg viewBox="0 0 100 30" style="height:26px; fill:white; opacity:0.9"><path d="M0,22 L15,22 L25,10 L95,10 L95,15 L70,15 L65,22 L50,22 L50,28 L35,28 L35,22 L20,22 Z M70,15 L75,25 L80,25 L75,15 Z"/></svg>',
        'TACTICAL PISTOL': '<svg viewBox="0 0 100 30" style="height:20px; fill:white; opacity:0.9"><path d="M40,22 L45,10 L80,10 L80,16 L65,16 L60,22 L55,30 L45,30 Z"/></svg>',
        'MELEE': '<svg viewBox="0 0 100 30" style="height:20px; fill:white; opacity:0.9"><path d="M10,25 L30,15 L90,15 L95,20 L35,20 L20,28 Z M80,5 L90,15 L70,15 Z"/></svg>',
        'UNKNOWN': '<svg viewBox="0 0 30 30" style="height:20px; fill:white; opacity:0.9"><circle cx="15" cy="12" r="10"/><path d="M10,22 L20,22 L20,28 L10,28 Z"/></svg>'
      };
      const icon = icons[weapon] || '🔫';

      el.innerHTML = `
        <span class="kill-killer">${killer}</span>
        <span class="kill-weapon">${icon}</span>
        ${isHeadshot ? '<span class="kill-hs">💀</span>' : ''}
        <span class="kill-victim">${victim}</span>
      `;
    }

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
    const titleEl = document.getElementById('game-over-title');
    const won = !!stats.won;

    if (titleEl) {
      titleEl.textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED';
      titleEl.style.color = won ? '#00ff88' : '#ff3e3e';
      titleEl.style.textShadow = won
        ? '0 0 30px rgba(0,255,136,0.6)'
        : '0 0 30px rgba(255,62,62,0.6)';
    }

    if (statsEl) {
      const winLine = won && stats.winCount !== undefined
        ? `<br><span style="color:#00ff88;">🏆 Total Wins: ${stats.winCount}</span> <span style="color:#888; font-size:0.9rem;">(bots scale with your wins)</span>`
        : '';
      const coinLine = stats.coinsEarned !== undefined
        ? `<br><span style="color:#ffd700;">💰 +${stats.coinsEarned} coins</span> <span style="color:#888; font-size:0.9rem;">(balance: ${stats.coins})</span>`
        : '';
      statsEl.innerHTML = `
        Kills: <span>${stats.kills}</span><br>
        Score: <span>${stats.wave}</span><br>
        Shots Fired: <span>${stats.shots}</span><br>
        Accuracy: <span>${stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0}%</span>
        ${coinLine}
        ${winLine}
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
