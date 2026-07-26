// ===== PLAYER PROGRESSION =====
// Coins, stats, rank, match history, cosmetic unlocks — all persisted on-device
// via localStorage. This is the single source of truth for the profile, shop,
// and leaderboard screens. No server required.

const KEY = 'cbs_profile';
const LB_KEY = 'cbs_leaderboard';

// Rank tiers by total wins
const RANKS = [
  { name: 'BRONZE',   min: 0,   color: '#cd7f32' },
  { name: 'SILVER',   min: 5,   color: '#c0c0c0' },
  { name: 'GOLD',     min: 12,  color: '#ffd700' },
  { name: 'PLATINUM', min: 25,  color: '#5fd0d0' },
  { name: 'DIAMOND',  min: 45,  color: '#7cc0ff' },
  { name: 'MASTER',   min: 75,  color: '#c77dff' },
  { name: 'LEGEND',   min: 120, color: '#ff5e5e' }
];

// Cosmetics the shop can sell. Weapon skins are hex colors; player skins recolor the viewmodel arms/body.
export const SHOP_ITEMS = [
  { id: 'wpn_gold',    type: 'weapon', name: 'Gold Plated',   cost: 500,  value: '0xffcc22' },
  { id: 'wpn_toxic',   type: 'weapon', name: 'Toxic Green',   cost: 300,  value: '0x66ff33' },
  { id: 'wpn_magenta', type: 'weapon', name: 'Hot Magenta',   cost: 300,  value: '0xff33cc' },
  { id: 'wpn_ice',     type: 'weapon', name: 'Ice Blue',      cost: 400,  value: '0x66ddff' },
  { id: 'wpn_carbon',  type: 'weapon', name: 'Carbon Black',  cost: 250,  value: '0x151515' },
  { id: 'wpn_blood',   type: 'weapon', name: 'Blood Red',     cost: 350,  value: '0xdd1111' },
  { id: 'plr_ranger',  type: 'player', name: 'Ranger Green',  cost: 600,  value: '0x4a5d3a' },
  { id: 'plr_arctic',  type: 'player', name: 'Arctic Ops',    cost: 600,  value: '0xd8e0e8' },
  { id: 'plr_crimson', type: 'player', name: 'Crimson Guard', cost: 800,  value: '0x8a1e1e' },
  { id: 'plr_shadow',  type: 'player', name: 'Shadow',        cost: 1000, value: '0x0d0d12' }
];

function defaultProfile() {
  return {
    coins: 0,
    wins: 0, losses: 0,
    kills: 0, deaths: 0,
    matches: 0,
    unlocked: [],                       // cosmetic ids the player owns
    equipped: { weapon: null, player: null },
    recent: []                          // last matches, newest first
  };
}

export class Progression {
  constructor() {
    this.data = this._load();
    this._ensureLeaderboard();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        // Migrate the old wins-only key if it exists
        const oldWins = parseInt(localStorage.getItem('cbs_gamesWon') || '0', 10);
        const p = defaultProfile();
        if (!isNaN(oldWins)) p.wins = oldWins;
        return p;
      }
      return Object.assign(defaultProfile(), JSON.parse(raw));
    } catch (e) {
      return defaultProfile();
    }
  }

  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
    // keep the legacy key in sync so difficulty scaling still reads it if needed
    try { localStorage.setItem('cbs_gamesWon', String(this.data.wins)); } catch (e) {}
  }

  // ---- getters ----
  getCoins() { return this.data.coins; }
  getWins() { return this.data.wins; }
  getStats() { return this.data; }

  getRank() {
    let rank = RANKS[0];
    for (const r of RANKS) if (this.data.wins >= r.min) rank = r;
    return rank;
  }

  getKD() {
    return this.data.deaths > 0
      ? (this.data.kills / this.data.deaths).toFixed(2)
      : this.data.kills.toFixed(2);
  }

  isUnlocked(id) { return this.data.unlocked.includes(id); }
  getEquipped(type) { return this.data.equipped[type]; }

  // ---- match results ----
  // Returns the coins earned this match so the UI can celebrate it.
  recordMatch({ won, kills, deaths, mode }) {
    const earned = kills * 10 + (won ? 100 : 25);
    this.data.coins += earned;
    this.data.matches++;
    this.data.kills += kills;
    this.data.deaths += deaths;
    if (won) this.data.wins++; else this.data.losses++;

    this.data.recent.unshift({
      won: !!won, kills, deaths, mode: mode || 'TDM', coins: earned, t: Date.now()
    });
    if (this.data.recent.length > 8) this.data.recent.length = 8;

    this._save();
    this._updateLeaderboard();
    return earned;
  }

  // ---- shop ----
  buy(id) {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (!item) return { ok: false, reason: 'missing' };
    if (this.isUnlocked(id)) return { ok: false, reason: 'owned' };
    if (this.data.coins < item.cost) return { ok: false, reason: 'poor' };
    this.data.coins -= item.cost;
    this.data.unlocked.push(id);
    this.data.equipped[item.type] = id; // auto-equip on purchase
    this._save();
    return { ok: true, item };
  }

  equip(id) {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (!item || !this.isUnlocked(id)) return false;
    this.data.equipped[item.type] = id;
    this._save();
    return true;
  }

  // Hex color string ("0xrrggbb") for the equipped cosmetic of a type, or null
  getEquippedValue(type) {
    const id = this.data.equipped[type];
    if (!id) return null;
    const item = SHOP_ITEMS.find(i => i.id === id);
    return item ? item.value : null;
  }

  // ---- local (offline) leaderboard ----
  // A stable set of AI rivals plus the player, ranked by wins then kills.
  _ensureLeaderboard() {
    try {
      if (localStorage.getItem(LB_KEY)) return;
    } catch (e) { return; }
    const names = ['V1PER', 'GHOST_09', 'NOVA', 'REAPER', 'BLITZ', 'HAVOC', 'SABLE', 'ROOK', 'ZERO_K', 'FALCON'];
    const rivals = names.map(n => ({
      name: n,
      wins: Math.floor(Math.random() * 40) + 2,
      kills: Math.floor(Math.random() * 400) + 40,
      bot: true
    }));
    try { localStorage.setItem(LB_KEY, JSON.stringify(rivals)); } catch (e) {}
  }

  _updateLeaderboard() {
    // Nudge a couple of rivals up over time so the board stays alive
    try {
      const rivals = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
      for (const r of rivals) {
        if (Math.random() < 0.5) { r.wins += Math.random() < 0.3 ? 1 : 0; r.kills += Math.floor(Math.random() * 6); }
      }
      localStorage.setItem(LB_KEY, JSON.stringify(rivals));
    } catch (e) {}
  }

  getLeaderboard() {
    let rivals = [];
    try { rivals = JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch (e) {}
    const me = { name: 'YOU', wins: this.data.wins, kills: this.data.kills, you: true };
    const all = rivals.concat([me]);
    all.sort((a, b) => (b.wins - a.wins) || (b.kills - a.kills));
    return all.map((e, i) => ({ ...e, rank: i + 1 }));
  }
}
