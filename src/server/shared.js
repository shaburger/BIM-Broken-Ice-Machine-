export const GAME_KEYS = ['fishing', 'mines', 'rpg'];
export const DAILY_REWARD = 250;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SESSION_HEARTBEAT_TIMEOUT_MS = 90 * 1000;

export const FISH = [
  { name: 'Minnow', rarity: 'common', value: 8 },
  { name: 'Bluegill', rarity: 'common', value: 10 },
  { name: 'Salmon', rarity: 'rare', value: 32 },
  { name: 'Golden Koi', rarity: 'epic', value: 90 },
  { name: 'Aurora Leviathan', rarity: 'legendary', value: 180 },
];

export const RPG_MISSIONS = {
  scout: { key: 'scout', name: 'Scout the Frozen Dock', seconds: 15, xp: 20, coins: 35 },
  salvage: { key: 'salvage', name: 'Salvage Ice Parts', seconds: 30, xp: 45, coins: 80 },
  courier: { key: 'courier', name: 'Courier Run', seconds: 45, xp: 70, coins: 120 },
};

export const RODS = [
  { id: 'basic', name: 'Basic Rod', price: 0, damage: 1 },
  { id: 'copper', name: 'Copper Rod', price: 120, damage: 2 },
  { id: 'iron', name: 'Iron Rod', price: 450, damage: 5 },
  { id: 'ice', name: 'Ice Rod', price: 1200, damage: 10 },
  { id: 'mythic', name: 'Mythic Rod', price: 4500, damage: 25 },
];

export const FISH_HP_BY_RARITY = {
  common: 12,
  rare: 28,
  epic: 70,
  legendary: 160,
};

export const MINES_DEFAULT_SETTINGS = {
  boardSize: 10,
  minesPerPlayer: 1,
  maxPlayers: 8,
  entryFee: 25,
};

export function rodById(id) {
  return RODS.find((rod) => rod.id === id) || RODS[0];
}

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export function validateUsername(username) {
  const raw = String(username || '').trim();
  if (raw.length < 3) return 'Username must be at least 3 characters.';
  if (raw.length > 20) return 'Username must be 20 characters or less.';
  if (!/^[a-zA-Z0-9_]+$/.test(raw)) return 'Username can only use letters, numbers, and underscores.';
  return null;
}

export function validatePassword(password) {
  const raw = String(password || '');
  if (raw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(raw) || !/[0-9]/.test(raw)) return 'Password must include letters and numbers.';
  return null;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    usernameNormalized: user.usernameNormalized,
    isDemo: Boolean(user.isDemo),
    createdAt: user.createdAt,
  };
}

export function pickFish() {
  const roll = Math.random() * 100;
  const rarity = roll < 2 ? 'legendary' : roll < 10 ? 'epic' : roll < 35 ? 'rare' : 'common';
  const pool = FISH.filter((fish) => fish.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)] || FISH[0];
}

export function nowIso() {
  return new Date().toISOString();
}
