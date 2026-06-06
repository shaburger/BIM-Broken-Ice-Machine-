import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import {
  DAILY_REWARD,
  FISH_HP_BY_RARITY,
  MINES_DEFAULT_SETTINGS,
  normalizeUsername,
  pickFish,
  publicUser,
  rodById,
  RODS,
  RPG_MISSIONS,
  validatePassword,
  validateUsername,
} from './shared.js';
import { config, isProduction } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'dist', 'client');

export function createSessionMiddleware() {
  return session({
    name: 'bim.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not signed in.' });
  return next();
}

async function sessionUser(req, store) {
  if (!req.session?.userId) return null;
  return store.getUserById(req.session.userId);
}

function sendKnownError(res, err) {
  if (err.code === 'USERNAME_TAKEN') return res.status(409).json({ error: 'Username is already taken.' });
  if (err.code === 'DAILY_COOLDOWN') return res.status(429).json({ error: err.message, nextAt: err.nextAt });
  if (err.code === 'MISSION_NOT_READY') return res.status(409).json({ error: err.message });
  if (err.code === 'MISSION_ACTIVE') return res.status(409).json({ error: err.message });
  if (err.code === 'NO_MISSION') return res.status(404).json({ error: err.message });
  if (err.code === 'ROD_OWNED') return res.status(409).json({ error: err.message });
  if (err.code === 'ROD_NOT_OWNED') return res.status(400).json({ error: err.message });
  if (err.code === 'INSUFFICIENT_COINS') return res.status(400).json({ error: err.message });
  if (err.message === 'Invalid game.') return res.status(400).json({ error: err.message });
  return res.status(500).json({ error: 'Something went wrong.' });
}

export function createApp({ store, sessionMiddleware = createSessionMiddleware() }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware);

  app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const usernameError = validateUsername(username);
    if (usernameError) return res.status(400).json({ error: usernameError });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const usernameNormalized = normalizeUsername(username);
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await store.createUser({ username, usernameNormalized, passwordHash });
      req.session.userId = user.id;
      return res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      return sendKnownError(res, err);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const usernameNormalized = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const user = await store.getUserByNormalizedUsername(usernameNormalized);
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });
    req.session.userId = user.id;
    return res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/demo', async (req, res) => {
    if (req.session?.userId) {
      await store.deleteDemoUser?.(req.session.userId);
    }
    const user = await store.createDemoUser();
    req.session.userId = user.id;
    return res.status(201).json({
      user: publicUser(user),
      message: 'Demo account created. Progress lasts only for this server session.',
    });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(() => {
      void store.deleteDemoUser?.(userId);
      res.clearCookie('bim.sid');
      res.status(204).send();
    });
  });

  app.get('/api/me', requireAuth, async (req, res) => {
    const user = await sessionUser(req, store);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    return res.json(await store.buildUserSummary(user));
  });

  app.get('/api/users/:username', async (req, res) => {
    const user = await store.getUserByNormalizedUsername(normalizeUsername(req.params.username));
    if (!user) return res.status(404).json({ error: 'Profile not found.' });
    return res.json(await store.buildUserSummary(user));
  });

  app.get('/api/leaderboards', async (req, res) => {
    const type = String(req.query.type || 'coins');
    const allowed = new Set(['coins', 'fishing', 'mines', 'rpg', 'hours']);
    const entries = await store.getLeaderboards(allowed.has(type) ? type : 'coins', 20);
    return res.json({ type: allowed.has(type) ? type : 'coins', entries });
  });

  app.post('/api/discord/link/start', requireAuth, async (_req, res) => {
    return res.json({
      message: 'Discord linking is reserved for the next OAuth pass.',
      linkUrl: `${config.publicUrl}/settings/discord-link`,
    });
  });

  app.post('/api/discord/link/confirm', requireAuth, async (req, res) => {
    const user = await sessionUser(req, store);
    const discordId = String(req.body?.discordId || '').trim();
    if (!discordId) return res.status(400).json({ error: 'Discord user id is required.' });
    try {
      await store.linkDiscord({ userId: user.id, discordId });
      return res.json({ linked: true });
    } catch (err) {
      return res.status(409).json({ error: err.message || 'Discord account is already linked.' });
    }
  });

  app.get('/api/games/summary', requireAuth, async (req, res) => {
    const user = await sessionUser(req, store);
    return res.json(await store.buildUserSummary(user));
  });

  app.post('/api/games/session/start', requireAuth, async (req, res) => {
    try {
      const session = await store.startGameSession(req.session.userId, String(req.body?.gameKey || ''));
      return res.status(201).json({ session });
    } catch (err) {
      return sendKnownError(res, err);
    }
  });

  app.post('/api/games/session/heartbeat', requireAuth, async (req, res) => {
    const session = await store.heartbeatGameSession(req.session.userId, String(req.body?.sessionId || ''));
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    return res.json({ session });
  });

  app.post('/api/games/session/end', requireAuth, async (req, res) => {
    const session = await store.endGameSession(req.session.userId, String(req.body?.sessionId || ''));
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    return res.json({ session });
  });

  app.post('/api/games/fishing/catch', requireAuth, async (req, res) => {
    if (!req.session.fishingTarget) return res.status(400).json({ error: 'Spawn a fish before catching.' });
    const fish = req.session.fishingTarget;
    req.session.fishingTarget = null;
    await store.addInventoryItem(req.session.userId, `fish:${fish.name}`, 1, fish);
    await store.updateFishingStats(req.session.userId, fish);
    await store.addCoins(req.session.userId, fish.value);
    return res.json({ fish, wallet: await store.getWallet(req.session.userId) });
  });

  app.get('/api/games/fishing/spawn', requireAuth, async (req, res) => {
    const fish = pickFish();
    req.session.fishingTarget = fish;
    const equipment = await store.getEquipment(req.session.userId);
    const rod = rodById(equipment.rod);
    return res.json({
      fish: {
        ...fish,
        hp: FISH_HP_BY_RARITY[fish.rarity] || FISH_HP_BY_RARITY.common,
      },
      rod,
    });
  });

  app.get('/api/shop/rods', requireAuth, async (req, res) => {
    const equipment = await store.getEquipment(req.session.userId);
    return res.json({ rods: RODS, equipment, wallet: await store.getWallet(req.session.userId) });
  });

  app.post('/api/shop/rods/buy', requireAuth, async (req, res) => {
    const rod = rodById(String(req.body?.rodId || ''));
    if (rod.id === 'basic') return res.status(400).json({ error: 'Basic rod is already owned.' });
    try {
      return res.json(await store.buyRod(req.session.userId, rod));
    } catch (err) {
      return sendKnownError(res, err);
    }
  });

  app.post('/api/shop/rods/equip', requireAuth, async (req, res) => {
    const rod = rodById(String(req.body?.rodId || ''));
    try {
      return res.json({ equipment: await store.equipRod(req.session.userId, rod) });
    } catch (err) {
      return sendKnownError(res, err);
    }
  });

  app.post('/api/games/mines/lobbies', requireAuth, async (req, res) => {
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    return res.status(201).json({ code, message: 'Lobby created. WebSocket play uses /ws/mines.' });
  });

  app.post('/api/games/rpg/character', requireAuth, async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 24);
    if (name.length < 3) return res.status(400).json({ error: 'Character name must be at least 3 characters.' });
    const rpg = await store.upsertRpgCharacter(req.session.userId, name);
    return res.json({ rpg });
  });

  app.post('/api/games/rpg/missions/start', requireAuth, async (req, res) => {
    const mission = RPG_MISSIONS[String(req.body?.missionKey || 'scout')] || RPG_MISSIONS.scout;
    try {
      const record = await store.startRpgMission(req.session.userId, mission);
      return res.status(201).json({ mission: record });
    } catch (err) {
      return sendKnownError(res, err);
    }
  });

  app.post('/api/games/rpg/missions/claim', requireAuth, async (req, res) => {
    try {
      const result = await store.claimRpgMission(req.session.userId);
      return res.json({ ...result, wallet: await store.getWallet(req.session.userId) });
    } catch (err) {
      return sendKnownError(res, err);
    }
  });

  app.post('/api/daily', requireAuth, async (req, res) => {
    try {
      const wallet = await store.claimDaily(req.session.userId);
      return res.json({ reward: DAILY_REWARD, wallet });
    } catch (err) {
      return sendKnownError(res, err);
    }
  });

  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  return app;
}

export function attachMinesWebSocket(server, store, sessionMiddleware = createSessionMiddleware()) {
  const wss = new WebSocketServer({ server, path: '/ws/mines' });
  const lobbies = new Map();

  function send(ws, payload) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  }

  function broadcast(code) {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    const players = Array.from(lobby.players.values());
    const state = {
      code,
      settings: lobby.settings,
      phase: lobby.phase,
      players: players.map((player) => ({
        userId: player.userId,
        username: player.username,
        alive: player.alive,
        placedMines: player.mines.size,
      })),
      revealed: Array.from(lobby.revealed),
      mineCount: lobby.mines.size,
      winner: lobby.winner,
      pot: lobby.pot,
    };
    lobby.sockets.forEach((ws) => send(ws, { type: 'state', state }));
  }

  function sanitizeSettings(raw = {}) {
    const boardSize = [8, 10, 12].includes(Number(raw.boardSize)) ? Number(raw.boardSize) : MINES_DEFAULT_SETTINGS.boardSize;
    const minesPerPlayer = [1, 2, 3].includes(Number(raw.minesPerPlayer))
      ? Number(raw.minesPerPlayer)
      : MINES_DEFAULT_SETTINGS.minesPerPlayer;
    const maxPlayersRaw = Number(raw.maxPlayers);
    const maxPlayers = Number.isFinite(maxPlayersRaw) ? Math.max(2, Math.min(8, maxPlayersRaw)) : MINES_DEFAULT_SETTINGS.maxPlayers;
    const entryFeeRaw = Number(raw.entryFee);
    const entryFee = Number.isFinite(entryFeeRaw) ? Math.max(0, Math.min(10000, entryFeeRaw)) : MINES_DEFAULT_SETTINGS.entryFee;
    return { boardSize, minesPerPlayer, maxPlayers, entryFee };
  }

  function publicPlayer(message) {
    const username = String(message.username || 'Guest').trim().slice(0, 24) || 'Guest';
    return { username };
  }

  async function endLobby(lobby, reason) {
    lobby.phase = 'ended';
    const alive = Array.from(lobby.players.values()).filter((player) => player.alive);
    const winners = alive.length ? alive : [];
    lobby.winner = winners.map((winner) => winner.username).join(', ') || 'No winner';
    if (winners.length) {
      const payout = Math.floor(lobby.pot / winners.length);
      for (const winner of winners) {
        await store.addCoins(winner.userId, payout).catch(() => null);
        await store.updateMinesStats(winner.userId, { won: true, coinsWon: payout }).catch(() => null);
      }
    }
    for (const player of lobby.players.values()) {
      if (!winners.some((winner) => winner.userId === player.userId)) {
        await store.updateMinesStats(player.userId, { won: false, coinsWon: 0 }).catch(() => null);
      }
    }
    lobby.sockets.forEach((ws) => send(ws, { type: 'round-ended', reason, winner: lobby.winner }));
    broadcast(lobby.code);
  }

  wss.on('connection', (ws, req) => {
    sessionMiddleware(req, {}, async () => {
      const userId = req.session?.userId;
      const user = userId ? await store.getUserById(userId) : null;
      if (!user) {
        ws.close(1008, 'unauthorized');
        return;
      }
      ws.isAuthed = true;
      ws.userId = user.id;
      ws.username = user.username;

      ws.on('message', async (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return send(ws, { type: 'error', message: 'Invalid message.' });
        }
        if (msg.type === 'join') {
          const code = String(msg.code || Math.random().toString(36).slice(2, 7)).toUpperCase();
          if (!lobbies.has(code)) {
            const settings = sanitizeSettings(msg.settings || {});
            lobbies.set(code, {
              code,
              settings,
              sockets: new Set(),
              players: new Map(),
              revealed: new Set(),
              mines: new Set(),
              phase: 'placing',
              winner: null,
              pot: 0,
            });
          }
          const lobby = lobbies.get(code);
          const alreadyJoined = lobby.players.has(ws.userId);
          const player = { ...publicPlayer(msg), userId: ws.userId, username: ws.username };
          if (lobby.players.size >= lobby.settings.maxPlayers && !alreadyJoined) {
            send(ws, { type: 'error', message: 'Lobby is full.' });
            return;
          }
          if (lobby.phase !== 'placing' && !alreadyJoined) {
            send(ws, { type: 'error', message: 'Round already started.' });
            return;
          }
          if (!alreadyJoined && lobby.settings.entryFee > 0) {
            try {
              await store.spendCoins(ws.userId, lobby.settings.entryFee);
              lobby.pot += lobby.settings.entryFee;
            } catch {
              send(ws, { type: 'error', message: 'Not enough coins for this lobby entry fee.' });
              if (!lobby.players.size && !lobby.sockets.size) lobbies.delete(code);
              return;
            }
          }
          lobby.sockets.add(ws);
          if (!alreadyJoined) {
            lobby.players.set(player.userId, { ...player, alive: true, mines: new Set() });
          }
          ws.lobbyCode = code;
          send(ws, { type: 'joined', code });
          broadcast(code);
        }
        if (msg.type === 'place-mine' && ws.lobbyCode) {
          const lobby = lobbies.get(ws.lobbyCode);
          const player = lobby.players.get(ws.userId);
          const totalTiles = lobby.settings.boardSize * lobby.settings.boardSize;
          const index = Number(msg.index);
          if (!player || lobby.phase !== 'placing') return;
          if (!Number.isInteger(index) || index < 0 || index >= totalTiles) return;
          if (player.mines.size >= lobby.settings.minesPerPlayer) {
            send(ws, { type: 'error', message: 'You placed all your mines.' });
            return;
          }
          if (lobby.mines.has(index)) {
            send(ws, { type: 'error', message: 'Mine already placed there.' });
            return;
          }
          lobby.mines.add(index);
          player.mines.add(index);
          const ready = Array.from(lobby.players.values()).every((entry) => entry.mines.size >= lobby.settings.minesPerPlayer);
          if (ready && lobby.players.size >= 2) lobby.phase = 'playing';
          broadcast(ws.lobbyCode);
        }
        if (msg.type === 'click' && ws.lobbyCode) {
          const lobby = lobbies.get(ws.lobbyCode);
          const player = lobby.players.get(ws.userId);
          const index = Number(msg.index);
          if (!player || !player.alive || lobby.phase !== 'playing') return;
          if (!Number.isInteger(index) || index < 0 || index >= lobby.settings.boardSize * lobby.settings.boardSize) return;
          if (lobby.revealed.has(index)) return;
          lobby.revealed.add(index);
          if (lobby.mines.has(index)) {
            player.alive = false;
            const alive = Array.from(lobby.players.values()).filter((entry) => entry.alive);
            if (alive.length <= 1) {
              await endLobby(lobby, 'last-player');
              return;
            }
          }
          const safeTiles = lobby.settings.boardSize * lobby.settings.boardSize - lobby.mines.size;
          if (lobby.revealed.size >= safeTiles) {
            await endLobby(lobby, 'board-cleared');
            return;
          }
          broadcast(ws.lobbyCode);
        }
      });

      ws.on('close', () => {
        if (ws.lobbyCode && lobbies.has(ws.lobbyCode)) {
          lobbies.get(ws.lobbyCode).sockets.delete(ws);
          broadcast(ws.lobbyCode);
        }
      });

      send(ws, { type: 'ready', username: user.username });
    });
  });
}
