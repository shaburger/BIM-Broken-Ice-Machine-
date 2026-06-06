import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import WebSocket from 'ws';
import { attachMinesWebSocket, createApp, createSessionMiddleware } from '../src/server/app.js';
import { MemoryStore } from '../src/server/store.js';

async function testServer({ ws = false } = {}) {
  const store = new MemoryStore();
  await store.init();
  const sessionMiddleware = createSessionMiddleware();
  const app = createApp({ store, sessionMiddleware });
  const server = http.createServer(app);
  if (ws) attachMinesWebSocket(server, store, sessionMiddleware);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    store,
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function request(base, path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { res, data, cookie: res.headers.get('set-cookie') };
}

test('registration creates a UUID-backed user and rejects duplicate normalized usernames', async () => {
  const server = await testServer();
  try {
    const first = await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'Shaburger', password: 'password1' },
    });
    assert.equal(first.res.status, 201);
    assert.match(first.data.user.id, /^[0-9a-f-]{36}$/);
    assert.equal(first.data.user.usernameNormalized, 'shaburger');

    const duplicate = await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'SHABURGER', password: 'password1' },
    });
    assert.equal(duplicate.res.status, 409);
    assert.equal(duplicate.data.error, 'Username is already taken.');
  } finally {
    await server.close();
  }
});

test('registration rejects invalid usernames and weak passwords', async () => {
  const server = await testServer();
  try {
    const badName = await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'no spaces', password: 'password1' },
    });
    assert.equal(badName.res.status, 400);
    const badPassword = await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'validname', password: 'password' },
    });
    assert.equal(badPassword.res.status, 400);
  } finally {
    await server.close();
  }
});

test('login uses normalized username and protected route rejects signed-out users', async () => {
  const server = await testServer();
  try {
    const signedOut = await request(server.base, '/api/me');
    assert.equal(signedOut.res.status, 401);

    await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'Tester', password: 'password1' },
    });
    const login = await request(server.base, '/api/auth/login', {
      method: 'POST',
      body: { username: 'TESTER', password: 'password1' },
    });
    assert.equal(login.res.status, 200);
    const me = await request(server.base, '/api/me', { cookie: login.cookie });
    assert.equal(me.res.status, 200);
    assert.equal(me.data.user.username, 'Tester');

    const wrong = await request(server.base, '/api/auth/login', {
      method: 'POST',
      body: { username: 'tester', password: 'wrongpass1' },
    });
    assert.equal(wrong.res.status, 401);
    assert.equal(wrong.data.error, 'Invalid username or password.');
  } finally {
    await server.close();
  }
});

test('profile lookup uses normalized username and returns 404 for missing users', async () => {
  const server = await testServer();
  try {
    await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'ProfileUser', password: 'password1' },
    });
    const profile = await request(server.base, '/api/users/profileuser');
    assert.equal(profile.res.status, 200);
    assert.equal(profile.data.user.username, 'ProfileUser');

    const missing = await request(server.base, '/api/users/nobody');
    assert.equal(missing.res.status, 404);
  } finally {
    await server.close();
  }
});

test('discord linking prevents duplicate Discord links', async () => {
  const server = await testServer();
  try {
    const first = await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'oneuser', password: 'password1' },
    });
    await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'twouser', password: 'password1' },
    });
    const link = await request(server.base, '/api/discord/link/confirm', {
      method: 'POST',
      cookie: first.cookie,
      body: { discordId: '123' },
    });
    assert.equal(link.res.status, 200);

    const duplicate = await request(server.base, '/api/discord/link/confirm', {
      method: 'POST',
      cookie: first.cookie,
      body: { discordId: '123' },
    });
    assert.equal(duplicate.res.status, 409);
  } finally {
    await server.close();
  }
});

test('game rewards, daily cooldown, and active session tracking work', async () => {
  const server = await testServer();
  try {
    const reg = await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'gamer', password: 'password1' },
    });
    const cookie = reg.cookie;
    const session = await request(server.base, '/api/games/session/start', {
      method: 'POST',
      cookie,
      body: { gameKey: 'fishing' },
    });
    assert.equal(session.res.status, 201);
    await request(server.base, '/api/games/fishing/spawn', { cookie });
    const catchRes = await request(server.base, '/api/games/fishing/catch', { method: 'POST', cookie, body: {} });
    assert.equal(catchRes.res.status, 200);
    assert.ok(catchRes.data.wallet.coins > 0);

    const daily = await request(server.base, '/api/daily', { method: 'POST', cookie, body: {} });
    assert.equal(daily.res.status, 200);
    const dailyAgain = await request(server.base, '/api/daily', { method: 'POST', cookie, body: {} });
    assert.equal(dailyAgain.res.status, 429);

    const heartbeat = await request(server.base, '/api/games/session/heartbeat', {
      method: 'POST',
      cookie,
      body: { sessionId: session.data.session.id },
    });
    assert.equal(heartbeat.res.status, 200);
    const end = await request(server.base, '/api/games/session/end', {
      method: 'POST',
      cookie,
      body: { sessionId: session.data.session.id },
    });
    assert.equal(end.res.status, 200);
  } finally {
    await server.close();
  }
});

test('demo account creates temporary guest data and excludes it from leaderboards', async () => {
  const server = await testServer();
  try {
    const demo = await request(server.base, '/api/auth/demo', { method: 'POST', body: {} });
    assert.equal(demo.res.status, 201);
    assert.equal(demo.data.user.isDemo, true);
    assert.match(demo.data.user.id, /^demo-/);

    const cookie = demo.cookie;
    const me = await request(server.base, '/api/me', { cookie });
    assert.equal(me.res.status, 200);
    assert.equal(me.data.user.isDemo, true);
    assert.equal(me.data.wallet.coins, 100);

    await request(server.base, '/api/games/fishing/spawn', { cookie });
    const catchRes = await request(server.base, '/api/games/fishing/catch', { method: 'POST', cookie, body: {} });
    assert.equal(catchRes.res.status, 200);
    assert.ok(catchRes.data.wallet.coins > 100);

    const board = await request(server.base, '/api/leaderboards?type=coins');
    assert.equal(board.res.status, 200);
    assert.equal(board.data.entries.some((entry) => entry.user.id === demo.data.user.id), false);

    const logout = await request(server.base, '/api/auth/logout', { method: 'POST', cookie });
    assert.equal(logout.res.status, 204);
    const afterLogout = await request(server.base, '/api/me', { cookie });
    assert.equal(afterLogout.res.status, 401);
  } finally {
    await server.close();
  }
});

test('rod shop rejects unaffordable rods, then buys and equips with enough coins', async () => {
  const server = await testServer();
  try {
    const reg = await request(server.base, '/api/auth/register', {
      method: 'POST',
      body: { username: 'angler', password: 'password1' },
    });
    const cookie = reg.cookie;
    const failed = await request(server.base, '/api/shop/rods/buy', {
      method: 'POST',
      cookie,
      body: { rodId: 'copper' },
    });
    assert.equal(failed.res.status, 400);
    assert.equal(failed.data.error, 'Not enough coins.');

    await server.store.addCoins(reg.data.user.id, 150);
    const bought = await request(server.base, '/api/shop/rods/buy', {
      method: 'POST',
      cookie,
      body: { rodId: 'copper' },
    });
    assert.equal(bought.res.status, 200);
    assert.equal(bought.data.equipment.rod, 'copper');
    assert.equal(bought.data.equipment.ownedRods.includes('copper'), true);

    const equipped = await request(server.base, '/api/shop/rods/equip', {
      method: 'POST',
      cookie,
      body: { rodId: 'basic' },
    });
    assert.equal(equipped.res.status, 200);
    assert.equal(equipped.data.equipment.rod, 'basic');
  } finally {
    await server.close();
  }
});

test('fishing spawn returns HP and catch awards the spawned target', async () => {
  const server = await testServer();
  try {
    const demo = await request(server.base, '/api/auth/demo', { method: 'POST', body: {} });
    const cookie = demo.cookie;
    const spawn = await request(server.base, '/api/games/fishing/spawn', { cookie });
    assert.equal(spawn.res.status, 200);
    assert.ok(spawn.data.fish.hp > 0);
    assert.equal(spawn.data.rod.damage, 1);

    const caught = await request(server.base, '/api/games/fishing/catch', { method: 'POST', cookie, body: {} });
    assert.equal(caught.res.status, 200);
    assert.equal(caught.data.fish.name, spawn.data.fish.name);
  } finally {
    await server.close();
  }
});

function waitForMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message.')), 2000);
    ws.on('message', function onMessage(raw) {
      const msg = JSON.parse(raw.toString());
      if (!predicate(msg)) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(msg);
    });
  });
}

test('mines websocket supports lobby settings, mine placement, and winner payout', async () => {
  const server = await testServer({ ws: true });
  const playerOneAuth = await request(server.base, '/api/auth/demo', { method: 'POST', body: {} });
  const playerTwoAuth = await request(server.base, '/api/auth/demo', { method: 'POST', body: {} });
  const playerOne = playerOneAuth.data.user;
  const playerTwo = playerTwoAuth.data.user;
  const wsUrl = server.base.replace('http://', 'ws://') + '/ws/mines';
  const one = new WebSocket(wsUrl, { headers: { Cookie: playerOneAuth.cookie } });
  const two = new WebSocket(wsUrl, { headers: { Cookie: playerTwoAuth.cookie } });
  const oneReady = waitForMessage(one, (msg) => msg.type === 'ready');
  const twoReady = waitForMessage(two, (msg) => msg.type === 'ready');
  try {
    await Promise.all([
      new Promise((resolve) => one.once('open', resolve)),
      new Promise((resolve) => two.once('open', resolve)),
    ]);
    await Promise.all([oneReady, twoReady]);
    one.send(JSON.stringify({
      type: 'join',
      username: playerOne.username,
      settings: { boardSize: 8, minesPerPlayer: 1, maxPlayers: 2, entryFee: 25 },
    }));
    const joined = await waitForMessage(one, (msg) => msg.type === 'joined');
    const code = joined.code;
    two.send(JSON.stringify({ type: 'join', code, username: playerTwo.username }));
    await waitForMessage(two, (msg) => msg.type === 'state' && msg.state.players.length === 2);

    one.send(JSON.stringify({ type: 'place-mine', index: 0 }));
    two.send(JSON.stringify({ type: 'place-mine', index: 1 }));
    await waitForMessage(one, (msg) => msg.type === 'state' && msg.state.phase === 'playing');

    one.send(JSON.stringify({ type: 'click', index: 1 }));
    const ended = await waitForMessage(two, (msg) => msg.type === 'round-ended');
    assert.equal(ended.winner, playerTwo.username);
    const winnerWallet = await server.store.getWallet(playerTwo.id);
    const loserWallet = await server.store.getWallet(playerOne.id);
    assert.equal(winnerWallet.coins, 125);
    assert.equal(loserWallet.coins, 75);
  } finally {
    one.close();
    two.close();
    await server.close();
  }
});
