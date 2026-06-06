import crypto from 'crypto';
import { Pool } from 'pg';
import { GAME_KEYS, nowIso, normalizeUsername, SESSION_HEARTBEAT_TIMEOUT_MS } from './shared.js';

function uuid() {
  return crypto.randomUUID();
}

function isDemoUserId(userId) {
  return String(userId).startsWith('demo-');
}

function emptyStats() {
  return {
    fishing: { catches: 0, rareCatches: 0, bestCatch: null },
    mines: { gamesPlayed: 0, wins: 0, losses: 0, coinsWon: 0 },
    rpg: { characterName: null, level: 1, xp: 0 },
  };
}

function emptyHours() {
  return { fishing: 0, mines: 0, rpg: 0 };
}

export class MemoryStore {
  constructor() {
    this.users = new Map();
    this.usersByName = new Map();
    this.discordLinks = new Map();
    this.wallets = new Map();
    this.inventory = new Map();
    this.equipment = new Map();
    this.stats = new Map();
    this.sessions = new Map();
    this.dailyClaims = new Map();
    this.rpgMissions = new Map();
  }

  async init() {}

  async createUser({ username, usernameNormalized, passwordHash }) {
    if (this.usersByName.has(usernameNormalized)) {
      const err = new Error('Username is already taken.');
      err.code = 'USERNAME_TAKEN';
      throw err;
    }
    const user = { id: uuid(), username, usernameNormalized, passwordHash, createdAt: nowIso() };
    this.users.set(user.id, user);
    this.usersByName.set(usernameNormalized, user.id);
    this.wallets.set(user.id, { coins: 0 });
    this.equipment.set(user.id, { rod: 'basic', ownedRods: ['basic'], rpgWeapon: 'training_blade' });
    this.stats.set(user.id, emptyStats());
    return user;
  }

  initializeMemoryUser(user, { coins = 0 } = {}) {
    this.users.set(user.id, user);
    this.usersByName.set(user.usernameNormalized, user.id);
    this.wallets.set(user.id, { coins });
    this.equipment.set(user.id, { rod: 'basic', ownedRods: ['basic'], rpgWeapon: 'training_blade' });
    this.stats.set(user.id, emptyStats());
    return user;
  }

  async createDemoUser() {
    const suffix = Math.random().toString(36).slice(2, 7);
    const username = `Demo_${suffix}`;
    const usernameNormalized = username.toLowerCase();
    const user = {
      id: `demo-${uuid()}`,
      username,
      usernameNormalized,
      passwordHash: '',
      createdAt: nowIso(),
      isDemo: true,
    };
    return this.initializeMemoryUser(user, { coins: 100 });
  }

  async deleteDemoUser(userId) {
    const user = this.users.get(userId);
    if (!user?.isDemo) return;
    this.users.delete(userId);
    this.usersByName.delete(user.usernameNormalized);
    this.wallets.delete(userId);
    this.inventory.delete(userId);
    this.equipment.delete(userId);
    this.stats.delete(userId);
    this.dailyClaims.delete(userId);
    this.rpgMissions.delete(userId);
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) this.sessions.delete(sessionId);
    }
  }

  async getUserByNormalizedUsername(usernameNormalized) {
    const id = this.usersByName.get(usernameNormalized);
    return id ? this.users.get(id) : null;
  }

  async getUserById(id) {
    return this.users.get(id) || null;
  }

  async getUserByDiscordId(discordId) {
    const userId = this.discordLinks.get(discordId);
    return userId ? this.getUserById(userId) : null;
  }

  async linkDiscord({ userId, discordId }) {
    if (this.discordLinks.has(discordId)) {
      const err = new Error('Discord account is already linked.');
      err.code = 'DISCORD_TAKEN';
      throw err;
    }
    for (const linkedUserId of this.discordLinks.values()) {
      if (linkedUserId === userId) {
        const err = new Error('Website account already has a linked Discord account.');
        err.code = 'USER_ALREADY_LINKED';
        throw err;
      }
    }
    this.discordLinks.set(discordId, userId);
  }

  async getWallet(userId) {
    return this.wallets.get(userId) || { coins: 0 };
  }

  async addCoins(userId, coins) {
    const wallet = await this.getWallet(userId);
    wallet.coins = Math.max(0, (wallet.coins || 0) + coins);
    this.wallets.set(userId, wallet);
    return wallet;
  }

  async spendCoins(userId, coins) {
    const wallet = await this.getWallet(userId);
    if (wallet.coins < coins) {
      const err = new Error('Not enough coins.');
      err.code = 'INSUFFICIENT_COINS';
      throw err;
    }
    wallet.coins -= coins;
    this.wallets.set(userId, wallet);
    return wallet;
  }

  async getEquipment(userId) {
    const equipment = this.equipment.get(userId) || { rod: 'basic', ownedRods: ['basic'], rpgWeapon: 'training_blade' };
    if (!Array.isArray(equipment.ownedRods)) equipment.ownedRods = ['basic'];
    if (!equipment.ownedRods.includes('basic')) equipment.ownedRods.push('basic');
    return equipment;
  }

  async buyRod(userId, rod) {
    const equipment = await this.getEquipment(userId);
    if (equipment.ownedRods.includes(rod.id)) {
      const err = new Error('Rod already owned.');
      err.code = 'ROD_OWNED';
      throw err;
    }
    const wallet = await this.getWallet(userId);
    if (wallet.coins < rod.price) {
      const err = new Error('Not enough coins.');
      err.code = 'INSUFFICIENT_COINS';
      throw err;
    }
    await this.spendCoins(userId, rod.price);
    equipment.ownedRods.push(rod.id);
    equipment.rod = rod.id;
    this.equipment.set(userId, equipment);
    return { equipment, wallet: await this.getWallet(userId) };
  }

  async equipRod(userId, rod) {
    const equipment = await this.getEquipment(userId);
    if (!equipment.ownedRods.includes(rod.id)) {
      const err = new Error('Rod not owned.');
      err.code = 'ROD_NOT_OWNED';
      throw err;
    }
    equipment.rod = rod.id;
    this.equipment.set(userId, equipment);
    return equipment;
  }

  async getInventory(userId) {
    return this.inventory.get(userId) || {};
  }

  async addInventoryItem(userId, itemKey, quantity = 1, metadata = {}) {
    const inv = await this.getInventory(userId);
    const current = inv[itemKey] || { quantity: 0, metadata };
    current.quantity += quantity;
    current.metadata = { ...current.metadata, ...metadata };
    inv[itemKey] = current;
    this.inventory.set(userId, inv);
    return inv;
  }

  async getStats(userId) {
    return this.stats.get(userId) || emptyStats();
  }

  async updateFishingStats(userId, fish) {
    const stats = await this.getStats(userId);
    stats.fishing.catches += 1;
    if (fish.rarity !== 'common') stats.fishing.rareCatches += 1;
    if (!stats.fishing.bestCatch || fish.value > stats.fishing.bestCatch.value) {
      stats.fishing.bestCatch = fish;
    }
    this.stats.set(userId, stats);
    return stats.fishing;
  }

  async updateMinesStats(userId, { won, coinsWon }) {
    const stats = await this.getStats(userId);
    stats.mines.gamesPlayed += 1;
    if (won) stats.mines.wins += 1;
    else stats.mines.losses += 1;
    stats.mines.coinsWon += coinsWon || 0;
    this.stats.set(userId, stats);
    return stats.mines;
  }

  async upsertRpgCharacter(userId, name) {
    const stats = await this.getStats(userId);
    if (!stats.rpg.characterName) stats.rpg.characterName = name;
    this.stats.set(userId, stats);
    return stats.rpg;
  }

  async addRpgProgress(userId, { xp }) {
    const stats = await this.getStats(userId);
    stats.rpg.xp += xp;
    stats.rpg.level = Math.max(1, Math.floor(stats.rpg.xp / 100) + 1);
    this.stats.set(userId, stats);
    return stats.rpg;
  }

  async startGameSession(userId, gameKey) {
    if (!GAME_KEYS.includes(gameKey)) throw new Error('Invalid game.');
    const id = uuid();
    this.sessions.set(id, {
      id,
      userId,
      gameKey,
      startedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      endedAt: null,
      activeSeconds: 0,
    });
    return this.sessions.get(id);
  }

  async heartbeatGameSession(userId, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.endedAt) return null;
    const now = Date.now();
    const delta = now - session.lastHeartbeatAt;
    if (delta <= SESSION_HEARTBEAT_TIMEOUT_MS) {
      session.activeSeconds += Math.max(0, Math.floor(delta / 1000));
    }
    session.lastHeartbeatAt = now;
    return session;
  }

  async endGameSession(userId, sessionId) {
    const session = await this.heartbeatGameSession(userId, sessionId);
    if (!session) return null;
    session.endedAt = Date.now();
    return session;
  }

  async getActiveHours(userId) {
    const hours = emptyHours();
    for (const session of this.sessions.values()) {
      if (session.userId !== userId) continue;
      hours[session.gameKey] += session.activeSeconds / 3600;
    }
    return hours;
  }

  async claimDaily(userId) {
    const last = this.dailyClaims.get(userId) || 0;
    const now = Date.now();
    if (now - last < 24 * 60 * 60 * 1000) {
      const err = new Error('Daily already claimed.');
      err.code = 'DAILY_COOLDOWN';
      err.nextAt = new Date(last + 24 * 60 * 60 * 1000).toISOString();
      throw err;
    }
    this.dailyClaims.set(userId, now);
    return this.addCoins(userId, 250);
  }

  async startRpgMission(userId, mission) {
    const existing = this.rpgMissions.get(userId);
    if (existing && existing.status === 'active') {
      const err = new Error('Mission already active.');
      err.code = 'MISSION_ACTIVE';
      throw err;
    }
    const record = {
      id: uuid(),
      userId,
      missionKey: mission.key,
      status: 'active',
      startedAt: Date.now(),
      finishesAt: Date.now() + mission.seconds * 1000,
      reward: { xp: mission.xp, coins: mission.coins },
    };
    this.rpgMissions.set(userId, record);
    return record;
  }

  async claimRpgMission(userId) {
    const record = this.rpgMissions.get(userId);
    if (!record || record.status !== 'active') {
      const err = new Error('No active mission.');
      err.code = 'NO_MISSION';
      throw err;
    }
    if (Date.now() < record.finishesAt) {
      const err = new Error('Mission is not finished yet.');
      err.code = 'MISSION_NOT_READY';
      throw err;
    }
    record.status = 'claimed';
    await this.addCoins(userId, record.reward.coins);
    const rpg = await this.addRpgProgress(userId, { xp: record.reward.xp });
    return { mission: record, rpg };
  }

  async buildUserSummary(user) {
    const [wallet, equipment, inventory, stats, activeHours] = await Promise.all([
      this.getWallet(user.id),
      this.getEquipment(user.id),
      this.getInventory(user.id),
      this.getStats(user.id),
      this.getActiveHours(user.id),
    ]);
    return {
      user: {
        id: user.id,
        username: user.username,
        usernameNormalized: user.usernameNormalized,
        createdAt: user.createdAt,
        isDemo: Boolean(user.isDemo),
      },
      wallet,
      equipment,
      inventory,
      stats,
      activeHours,
    };
  }

  async getLeaderboards(type = 'coins', limit = 20) {
    const users = Array.from(this.users.values()).filter((user) => !user.isDemo);
    const rows = [];
    for (const user of users) {
      const summary = await this.buildUserSummary(user);
      let value = summary.wallet.coins;
      if (type === 'fishing') value = summary.stats.fishing.catches;
      if (type === 'mines') value = summary.stats.mines.wins;
      if (type === 'rpg') value = summary.stats.rpg.xp;
      if (type === 'hours') value = Object.values(summary.activeHours).reduce((a, b) => a + b, 0);
      rows.push({ user: summary.user, value });
    }
    return rows.sort((a, b) => b.value - a.value).slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }));
  }
}

export class PgStore extends MemoryStore {
  constructor(databaseUrl) {
    super();
    this.pool = new Pool({ connectionString: databaseUrl, ssl: process.env.PGSSLMODE === 'disable' ? false : undefined });
  }

  async init() {
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL,
        username_normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS discord_links (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        discord_user_id TEXT NOT NULL UNIQUE,
        linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS wallets (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        coins INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS inventory_items (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}',
        PRIMARY KEY (user_id, item_key)
      );
      CREATE TABLE IF NOT EXISTS equipment (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        rod TEXT NOT NULL DEFAULT 'basic',
        owned_rods JSONB NOT NULL DEFAULT '["basic"]',
        rpg_weapon TEXT NOT NULL DEFAULT 'training_blade'
      );
      CREATE TABLE IF NOT EXISTS fishing_stats (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        catches INTEGER NOT NULL DEFAULT 0,
        rare_catches INTEGER NOT NULL DEFAULT 0,
        best_catch JSONB
      );
      CREATE TABLE IF NOT EXISTS mines_stats (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        games_played INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        coins_won INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS rpg_characters (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        character_name TEXT,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS game_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_key TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ended_at TIMESTAMPTZ,
        active_seconds INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS daily_claims (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        claimed_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rpg_missions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mission_key TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        finishes_at TIMESTAMPTZ NOT NULL,
        reward JSONB NOT NULL
      );
    `);
    await this.pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS owned_rods JSONB NOT NULL DEFAULT '["basic"]';`);
  }

  rowUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      usernameNormalized: row.username_normalized,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
    };
  }

  async createUser({ username, usernameNormalized, passwordHash }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        'INSERT INTO users (username, username_normalized, password_hash) VALUES ($1, $2, $3) RETURNING *',
        [username, usernameNormalized, passwordHash]
      );
      const user = this.rowUser(res.rows[0]);
      await client.query('INSERT INTO wallets (user_id, coins) VALUES ($1, 0)', [user.id]);
      await client.query('INSERT INTO equipment (user_id) VALUES ($1)', [user.id]);
      await client.query('INSERT INTO fishing_stats (user_id) VALUES ($1)', [user.id]);
      await client.query('INSERT INTO mines_stats (user_id) VALUES ($1)', [user.id]);
      await client.query('INSERT INTO rpg_characters (user_id) VALUES ($1)', [user.id]);
      await client.query('COMMIT');
      return user;
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        err.code = 'USERNAME_TAKEN';
        err.message = 'Username is already taken.';
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async getUserByNormalizedUsername(usernameNormalized) {
    const demoUser = await super.getUserByNormalizedUsername(usernameNormalized);
    if (demoUser?.isDemo) return demoUser;
    const res = await this.pool.query('SELECT * FROM users WHERE username_normalized = $1', [normalizeUsername(usernameNormalized)]);
    return this.rowUser(res.rows[0]);
  }

  async getUserById(id) {
    if (isDemoUserId(id)) return super.getUserById(id);
    const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return this.rowUser(res.rows[0]);
  }

  async getWallet(userId) {
    if (isDemoUserId(userId)) return super.getWallet(userId);
    const res = await this.pool.query('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    return { coins: Number(res.rows[0]?.coins || 0) };
  }

  async addCoins(userId, coins) {
    if (isDemoUserId(userId)) return super.addCoins(userId, coins);
    const res = await this.pool.query(
      `INSERT INTO wallets (user_id, coins) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET coins = GREATEST(0, wallets.coins + EXCLUDED.coins)
       RETURNING coins`,
      [userId, coins]
    );
    return { coins: Number(res.rows[0]?.coins || 0) };
  }

  async spendCoins(userId, coins) {
    if (isDemoUserId(userId)) return super.spendCoins(userId, coins);
    const res = await this.pool.query(
      'UPDATE wallets SET coins = coins - $2 WHERE user_id = $1 AND coins >= $2 RETURNING coins',
      [userId, coins]
    );
    if (!res.rows[0]) {
      const err = new Error('Not enough coins.');
      err.code = 'INSUFFICIENT_COINS';
      throw err;
    }
    return { coins: Number(res.rows[0].coins || 0) };
  }

  async getEquipment(userId) {
    if (isDemoUserId(userId)) return super.getEquipment(userId);
    const res = await this.pool.query('SELECT rod, owned_rods, rpg_weapon FROM equipment WHERE user_id = $1', [userId]);
    const ownedRods = Array.isArray(res.rows[0]?.owned_rods) ? res.rows[0].owned_rods : ['basic'];
    if (!ownedRods.includes('basic')) ownedRods.push('basic');
    return { rod: res.rows[0]?.rod || 'basic', ownedRods, rpgWeapon: res.rows[0]?.rpg_weapon || 'training_blade' };
  }

  async buyRod(userId, rod) {
    if (isDemoUserId(userId)) return super.buyRod(userId, rod);
    const equipment = await this.getEquipment(userId);
    if (equipment.ownedRods.includes(rod.id)) {
      const err = new Error('Rod already owned.');
      err.code = 'ROD_OWNED';
      throw err;
    }
    const wallet = await this.getWallet(userId);
    if (wallet.coins < rod.price) {
      const err = new Error('Not enough coins.');
      err.code = 'INSUFFICIENT_COINS';
      throw err;
    }
    const ownedRods = [...equipment.ownedRods, rod.id];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const walletRes = await client.query(
        'UPDATE wallets SET coins = coins - $2 WHERE user_id = $1 AND coins >= $2 RETURNING coins',
        [userId, rod.price]
      );
      if (!walletRes.rows[0]) {
        const err = new Error('Not enough coins.');
        err.code = 'INSUFFICIENT_COINS';
        throw err;
      }
      await client.query('UPDATE equipment SET rod = $2, owned_rods = $3 WHERE user_id = $1', [
        userId,
        rod.id,
        JSON.stringify(ownedRods),
      ]);
      await client.query('COMMIT');
      return {
        equipment: await this.getEquipment(userId),
        wallet: { coins: Number(walletRes.rows[0]?.coins || 0) },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async equipRod(userId, rod) {
    if (isDemoUserId(userId)) return super.equipRod(userId, rod);
    const equipment = await this.getEquipment(userId);
    if (!equipment.ownedRods.includes(rod.id)) {
      const err = new Error('Rod not owned.');
      err.code = 'ROD_NOT_OWNED';
      throw err;
    }
    await this.pool.query('UPDATE equipment SET rod = $2 WHERE user_id = $1', [userId, rod.id]);
    return this.getEquipment(userId);
  }

  async getInventory(userId) {
    if (isDemoUserId(userId)) return super.getInventory(userId);
    const res = await this.pool.query('SELECT item_key, quantity, metadata FROM inventory_items WHERE user_id = $1', [userId]);
    return Object.fromEntries(
      res.rows.map((row) => [row.item_key, { quantity: Number(row.quantity || 0), metadata: row.metadata || {} }])
    );
  }

  async addInventoryItem(userId, itemKey, quantity = 1, metadata = {}) {
    if (isDemoUserId(userId)) return super.addInventoryItem(userId, itemKey, quantity, metadata);
    await this.pool.query(
      `INSERT INTO inventory_items (user_id, item_key, quantity, metadata) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, item_key) DO UPDATE SET
         quantity = inventory_items.quantity + EXCLUDED.quantity,
         metadata = inventory_items.metadata || EXCLUDED.metadata`,
      [userId, itemKey, quantity, JSON.stringify(metadata)]
    );
    return this.getInventory(userId);
  }

  async getStats(userId) {
    if (isDemoUserId(userId)) return super.getStats(userId);
    const [fish, mines, rpg] = await Promise.all([
      this.pool.query('SELECT catches, rare_catches, best_catch FROM fishing_stats WHERE user_id = $1', [userId]),
      this.pool.query('SELECT games_played, wins, losses, coins_won FROM mines_stats WHERE user_id = $1', [userId]),
      this.pool.query('SELECT character_name, level, xp FROM rpg_characters WHERE user_id = $1', [userId]),
    ]);
    return {
      fishing: {
        catches: Number(fish.rows[0]?.catches || 0),
        rareCatches: Number(fish.rows[0]?.rare_catches || 0),
        bestCatch: fish.rows[0]?.best_catch || null,
      },
      mines: {
        gamesPlayed: Number(mines.rows[0]?.games_played || 0),
        wins: Number(mines.rows[0]?.wins || 0),
        losses: Number(mines.rows[0]?.losses || 0),
        coinsWon: Number(mines.rows[0]?.coins_won || 0),
      },
      rpg: {
        characterName: rpg.rows[0]?.character_name || null,
        level: Number(rpg.rows[0]?.level || 1),
        xp: Number(rpg.rows[0]?.xp || 0),
      },
    };
  }

  async updateFishingStats(userId, fish) {
    if (isDemoUserId(userId)) return super.updateFishingStats(userId, fish);
    const rare = fish.rarity === 'common' ? 0 : 1;
    await this.pool.query(
      `INSERT INTO fishing_stats (user_id, catches, rare_catches, best_catch) VALUES ($1, 1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         catches = fishing_stats.catches + 1,
         rare_catches = fishing_stats.rare_catches + EXCLUDED.rare_catches,
         best_catch = CASE
           WHEN fishing_stats.best_catch IS NULL OR (fishing_stats.best_catch->>'value')::int < ($3::jsonb->>'value')::int THEN $3
           ELSE fishing_stats.best_catch
         END`,
      [userId, rare, JSON.stringify(fish)]
    );
    return (await this.getStats(userId)).fishing;
  }

  async updateMinesStats(userId, { won, coinsWon }) {
    if (isDemoUserId(userId)) return super.updateMinesStats(userId, { won, coinsWon });
    await this.pool.query(
      `INSERT INTO mines_stats (user_id, games_played, wins, losses, coins_won) VALUES ($1, 1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         games_played = mines_stats.games_played + 1,
         wins = mines_stats.wins + EXCLUDED.wins,
         losses = mines_stats.losses + EXCLUDED.losses,
         coins_won = mines_stats.coins_won + EXCLUDED.coins_won`,
      [userId, won ? 1 : 0, won ? 0 : 1, coinsWon || 0]
    );
    return (await this.getStats(userId)).mines;
  }

  async upsertRpgCharacter(userId, name) {
    if (isDemoUserId(userId)) return super.upsertRpgCharacter(userId, name);
    await this.pool.query(
      `INSERT INTO rpg_characters (user_id, character_name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET character_name = COALESCE(rpg_characters.character_name, EXCLUDED.character_name)`,
      [userId, name]
    );
    return (await this.getStats(userId)).rpg;
  }

  async addRpgProgress(userId, { xp }) {
    if (isDemoUserId(userId)) return super.addRpgProgress(userId, { xp });
    await this.pool.query(
      `INSERT INTO rpg_characters (user_id, xp, level) VALUES ($1, $2, GREATEST(1, FLOOR($2 / 100) + 1))
       ON CONFLICT (user_id) DO UPDATE SET
         xp = rpg_characters.xp + EXCLUDED.xp,
         level = GREATEST(1, FLOOR((rpg_characters.xp + EXCLUDED.xp) / 100) + 1)`,
      [userId, xp]
    );
    return (await this.getStats(userId)).rpg;
  }

  async linkDiscord({ userId, discordId }) {
    if (isDemoUserId(userId)) {
      const err = new Error('Demo accounts cannot link Discord.');
      err.code = 'DEMO_LINK_BLOCKED';
      throw err;
    }
    try {
      await this.pool.query('INSERT INTO discord_links (user_id, discord_user_id) VALUES ($1, $2)', [userId, discordId]);
    } catch (err) {
      if (err.code === '23505') err.message = 'Discord account or website account is already linked.';
      throw err;
    }
  }

  async getUserByDiscordId(discordId) {
    const res = await this.pool.query(
      `SELECT u.* FROM users u INNER JOIN discord_links d ON d.user_id = u.id WHERE d.discord_user_id = $1`,
      [discordId]
    );
    return this.rowUser(res.rows[0]);
  }

  async startGameSession(userId, gameKey) {
    if (isDemoUserId(userId)) return super.startGameSession(userId, gameKey);
    if (!GAME_KEYS.includes(gameKey)) throw new Error('Invalid game.');
    const res = await this.pool.query(
      'INSERT INTO game_sessions (user_id, game_key) VALUES ($1, $2) RETURNING id, game_key, active_seconds',
      [userId, gameKey]
    );
    return { id: res.rows[0].id, userId, gameKey: res.rows[0].game_key, activeSeconds: 0 };
  }

  async heartbeatGameSession(userId, sessionId) {
    if (isDemoUserId(userId)) return super.heartbeatGameSession(userId, sessionId);
    const res = await this.pool.query(
      `UPDATE game_sessions
       SET active_seconds = active_seconds + CASE
           WHEN EXTRACT(EPOCH FROM (now() - last_heartbeat_at)) <= $3 THEN FLOOR(EXTRACT(EPOCH FROM (now() - last_heartbeat_at)))::int
           ELSE 0
         END,
         last_heartbeat_at = now()
       WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
       RETURNING id, game_key, active_seconds`,
      [sessionId, userId, Math.floor(SESSION_HEARTBEAT_TIMEOUT_MS / 1000)]
    );
    if (!res.rows[0]) return null;
    return { id: res.rows[0].id, userId, gameKey: res.rows[0].game_key, activeSeconds: Number(res.rows[0].active_seconds) };
  }

  async endGameSession(userId, sessionId) {
    if (isDemoUserId(userId)) return super.endGameSession(userId, sessionId);
    await this.heartbeatGameSession(userId, sessionId);
    const res = await this.pool.query(
      'UPDATE game_sessions SET ended_at = now() WHERE id = $1 AND user_id = $2 RETURNING id, game_key, active_seconds',
      [sessionId, userId]
    );
    if (!res.rows[0]) return null;
    return { id: res.rows[0].id, userId, gameKey: res.rows[0].game_key, activeSeconds: Number(res.rows[0].active_seconds) };
  }

  async getActiveHours(userId) {
    if (isDemoUserId(userId)) return super.getActiveHours(userId);
    const res = await this.pool.query(
      'SELECT game_key, SUM(active_seconds) total FROM game_sessions WHERE user_id = $1 GROUP BY game_key',
      [userId]
    );
    const hours = { fishing: 0, mines: 0, rpg: 0 };
    res.rows.forEach((row) => {
      hours[row.game_key] = Number(row.total || 0) / 3600;
    });
    return hours;
  }

  async claimDaily(userId) {
    if (isDemoUserId(userId)) return super.claimDaily(userId);
    const res = await this.pool.query('SELECT claimed_at FROM daily_claims WHERE user_id = $1', [userId]);
    const last = res.rows[0]?.claimed_at ? new Date(res.rows[0].claimed_at).getTime() : 0;
    if (Date.now() - last < 24 * 60 * 60 * 1000) {
      const err = new Error('Daily already claimed.');
      err.code = 'DAILY_COOLDOWN';
      err.nextAt = new Date(last + 24 * 60 * 60 * 1000).toISOString();
      throw err;
    }
    await this.pool.query(
      `INSERT INTO daily_claims (user_id, claimed_at) VALUES ($1, now())
       ON CONFLICT (user_id) DO UPDATE SET claimed_at = EXCLUDED.claimed_at`,
      [userId]
    );
    return this.addCoins(userId, 250);
  }

  async startRpgMission(userId, mission) {
    if (isDemoUserId(userId)) return super.startRpgMission(userId, mission);
    const active = await this.pool.query('SELECT id FROM rpg_missions WHERE user_id = $1 AND status = $2', [userId, 'active']);
    if (active.rows[0]) {
      const err = new Error('Mission already active.');
      err.code = 'MISSION_ACTIVE';
      throw err;
    }
    const res = await this.pool.query(
      `INSERT INTO rpg_missions (user_id, mission_key, status, started_at, finishes_at, reward)
       VALUES ($1, $2, 'active', now(), now() + ($3 || ' seconds')::interval, $4)
       RETURNING id, user_id, mission_key, status, started_at, finishes_at, reward`,
      [userId, mission.key, mission.seconds, JSON.stringify({ xp: mission.xp, coins: mission.coins })]
    );
    return {
      id: res.rows[0].id,
      userId,
      missionKey: res.rows[0].mission_key,
      status: res.rows[0].status,
      startedAt: res.rows[0].started_at,
      finishesAt: res.rows[0].finishes_at,
      reward: res.rows[0].reward,
    };
  }

  async claimRpgMission(userId) {
    if (isDemoUserId(userId)) return super.claimRpgMission(userId);
    const res = await this.pool.query(
      `SELECT id, mission_key, status, started_at, finishes_at, reward
       FROM rpg_missions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId]
    );
    const row = res.rows[0];
    if (!row) {
      const err = new Error('No active mission.');
      err.code = 'NO_MISSION';
      throw err;
    }
    if (new Date(row.finishes_at).getTime() > Date.now()) {
      const err = new Error('Mission is not finished yet.');
      err.code = 'MISSION_NOT_READY';
      throw err;
    }
    await this.pool.query('UPDATE rpg_missions SET status = $2 WHERE id = $1', [row.id, 'claimed']);
    await this.addCoins(userId, Number(row.reward.coins || 0));
    const rpg = await this.addRpgProgress(userId, { xp: Number(row.reward.xp || 0) });
    return {
      mission: {
        id: row.id,
        userId,
        missionKey: row.mission_key,
        status: 'claimed',
        startedAt: row.started_at,
        finishesAt: row.finishes_at,
        reward: row.reward,
      },
      rpg,
    };
  }

  async getLeaderboards(type = 'coins', limit = 20) {
    const queryByType = {
      coins: `
        SELECT u.id, u.username, u.username_normalized, COALESCE(w.coins, 0) value
        FROM users u LEFT JOIN wallets w ON w.user_id = u.id
        ORDER BY value DESC LIMIT $1`,
      fishing: `
        SELECT u.id, u.username, u.username_normalized, COALESCE(f.catches, 0) value
        FROM users u LEFT JOIN fishing_stats f ON f.user_id = u.id
        ORDER BY value DESC LIMIT $1`,
      mines: `
        SELECT u.id, u.username, u.username_normalized, COALESCE(m.wins, 0) value
        FROM users u LEFT JOIN mines_stats m ON m.user_id = u.id
        ORDER BY value DESC LIMIT $1`,
      rpg: `
        SELECT u.id, u.username, u.username_normalized, COALESCE(r.xp, 0) value
        FROM users u LEFT JOIN rpg_characters r ON r.user_id = u.id
        ORDER BY value DESC LIMIT $1`,
      hours: `
        SELECT u.id, u.username, u.username_normalized, COALESCE(SUM(g.active_seconds), 0) / 3600.0 value
        FROM users u LEFT JOIN game_sessions g ON g.user_id = u.id
        GROUP BY u.id, u.username, u.username_normalized
        ORDER BY value DESC LIMIT $1`,
    };
    const res = await this.pool.query(queryByType[type] || queryByType.coins, [limit]);
    return res.rows.map((row, index) => ({
      rank: index + 1,
      value: Number(row.value || 0),
      user: {
        id: row.id,
        username: row.username,
        usernameNormalized: row.username_normalized,
      },
    }));
  }
}

export function createStore() {
  if (process.env.DATABASE_URL) return new PgStore(process.env.DATABASE_URL);
  return new MemoryStore();
}
