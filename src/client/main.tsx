import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, hoursText, type BoardEntry, type Summary } from './api';
import './styles.css';

function useMe() {
  const [me, setMe] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<Summary>('/api/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);
  return { me, setMe, loading };
}

function Nav({ me, onLogout }: { me: Summary | null; onLogout: () => void }) {
  return (
    <header className="topbar">
      <a className="brand" href="/">
        Broken Ice Machine
      </a>
      <nav>
        <a href="/">Dashboard</a>
        <a href="/leaderboards">Leaderboards</a>
        <a href="/games/fishing">Fishing</a>
        <a href="/games/mines">Mines</a>
        <a href="/games/rpg">RPG</a>
        {me ? (
          <>
            <a href={`/profile/${me.user.usernameNormalized}`}>Profile</a>
            <button onClick={onLogout}>Log out</button>
          </>
        ) : (
          <>
            <a href="/login">Log in</a>
            <a className="button-link" href="/register">Register</a>
          </>
        )}
      </nav>
    </header>
  );
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) });
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function startDemo() {
    setError('');
    try {
      await api('/api/auth/demo', { method: 'POST', body: '{}' });
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <main className="auth">
      <form className="panel narrow" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Log in' : 'Create account'}</h1>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit">
          {mode === 'login' ? 'Log in' : 'Register'}
        </button>
        <button type="button" onClick={startDemo}>
          Continue as demo guest
        </button>
        <p className="muted">Demo progress is temporary and is not saved to the database.</p>
        <p className="muted">
          {mode === 'login' ? 'Need an account?' : 'Already registered?'}{' '}
          <a href={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? 'Register' : 'Log in'}</a>
        </p>
      </form>
    </main>
  );
}

function Dashboard({ me }: { me: Summary }) {
  const totalHours = Object.values(me.activeHours).reduce((sum, value) => sum + value, 0);
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Gaming social platform</p>
          <h1>{me.user.username}</h1>
          {me.user.isDemo ? <p className="demo-banner">Demo guest: progress is temporary and will disappear when the session ends.</p> : null}
          <p className="lede">Play mini-games, earn coins, track stats, and show progress from one self-hosted account.</p>
        </div>
        <div className="stats-grid">
          <Stat label="Coins" value={me.wallet.coins} />
          <Stat label="Total active hours" value={hoursText(totalHours)} />
          <Stat label="RPG level" value={me.stats.rpg.level} />
        </div>
      </section>
      <section className="grid">
        <GameCard title="Fishing" href="/games/fishing" text="Solo catches, fish inventory, coins, and active time." />
        <GameCard title="Mines" href="/games/mines" text="Lobby-based grid game for friends." />
        <GameCard title="RPG Preview" href="/games/rpg" text="Create a character and run timed missions for XP." />
      </section>
      <section className="panel">
        <h2>Current stats</h2>
        <div className="stats-grid">
          <Stat label="Fishing catches" value={me.stats.fishing.catches} />
          <Stat label="Mines wins" value={me.stats.mines.wins} />
          <Stat label="RPG XP" value={me.stats.rpg.xp} />
          <Stat label="Rod" value={me.equipment.rod} />
        </div>
      </section>
    </main>
  );
}

function Landing() {
  const [error, setError] = useState('');
  async function startDemo() {
    setError('');
    try {
      await api('/api/auth/demo', { method: 'POST', body: '{}' });
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Broken Ice Machine</p>
          <h1>Mini-games, wallets, leaderboards, and Discord stats.</h1>
          <p className="lede">A self-hostable gaming social platform demo built for a complete recruiter walkthrough.</p>
          <div className="actions">
            <a className="button-link primary" href="/register">Create account</a>
            <a className="button-link" href="/login">Log in</a>
            <button onClick={startDemo}>Try demo guest</button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GameCard({ title, text, href }: { title: string; text: string; href: string }) {
  return (
    <article className="card">
      <h2>{title}</h2>
      <p>{text}</p>
      <a className="button-link" href={href}>Open</a>
    </article>
  );
}

function Leaderboards() {
  const [type, setType] = useState('coins');
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  useEffect(() => {
    api<{ entries: BoardEntry[] }>(`/api/leaderboards?type=${type}`).then((data) => setEntries(data.entries));
  }, [type]);
  return (
    <main className="shell">
      <section className="panel">
        <h1>Leaderboards</h1>
        <div className="tabs">
          {['coins', 'fishing', 'mines', 'rpg', 'hours'].map((item) => (
            <button className={type === item ? 'active' : ''} onClick={() => setType(item)} key={item}>{item}</button>
          ))}
        </div>
        <div className="list">
          {entries.map((entry) => (
            <a href={`/profile/${entry.user.usernameNormalized}`} className="row" key={entry.user.id}>
              <span>#{entry.rank} {entry.user.username}</span>
              <strong>{type === 'hours' ? hoursText(entry.value) : entry.value}</strong>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

function ProfilePage() {
  const username = window.location.pathname.split('/').pop() || '';
  const [profile, setProfile] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Summary>(`/api/users/${username}`).then(setProfile).catch((err) => setError((err as Error).message));
  }, [username]);
  if (error) return <main className="shell"><section className="panel"><h1>{error}</h1></section></main>;
  if (!profile) return <main className="shell"><section className="panel"><h1>Loading...</h1></section></main>;
  return (
    <main className="shell">
      <section className="panel">
        <h1>{profile.user.username}</h1>
        <div className="stats-grid">
          <Stat label="Coins" value={profile.wallet.coins} />
          <Stat label="Fishing hours" value={hoursText(profile.activeHours.fishing || 0)} />
          <Stat label="Mines hours" value={hoursText(profile.activeHours.mines || 0)} />
          <Stat label="RPG hours" value={hoursText(profile.activeHours.rpg || 0)} />
          <Stat label="Fishing catches" value={profile.stats.fishing.catches} />
          <Stat label="Mines wins" value={profile.stats.mines.wins} />
          <Stat label="RPG level" value={profile.stats.rpg.level} />
          <Stat label="Rod" value={profile.equipment.rod} />
        </div>
      </section>
    </main>
  );
}

function FishingGame({ refresh }: { refresh: () => void }) {
  const [message, setMessage] = useState('Spawn a fish, then click it down before it swims away.');
  const [target, setTarget] = useState<null | { name: string; rarity: string; value: number; hp: number }>(null);
  const [hp, setHp] = useState(0);
  const [rod, setRod] = useState<{ id: string; name: string; damage: number }>({ id: 'basic', name: 'Basic Rod', damage: 1 });
  const [catching, setCatching] = useState(false);
  const [shop, setShop] = useState<null | {
    rods: Array<{ id: string; name: string; price: number; damage: number }>;
    equipment: Summary['equipment'];
    wallet: { coins: number };
  }>(null);
  const session = useGameSession('fishing');
  async function spawnFish() {
    try {
      const data = await api<{ fish: { name: string; rarity: string; value: number; hp: number }; rod: typeof rod }>('/api/games/fishing/spawn');
      setTarget(data.fish);
      setHp(data.fish.hp);
      setRod(data.rod);
      setMessage(`${data.fish.rarity} ${data.fish.name} appeared. Click for ${data.rod.damage} damage.`);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  async function clickFish() {
    if (!target || catching) return;
    const nextHp = Math.max(0, hp - rod.damage);
    setHp(nextHp);
    if (nextHp > 0) return;
    try {
      setCatching(true);
      const data = await api<{ fish: { name: string; rarity: string; value: number }; wallet: { coins: number } }>(
        '/api/games/fishing/catch',
        { method: 'POST', body: '{}' }
      );
      setMessage(`Caught ${data.fish.name} for ${data.fish.value} coins. Balance: ${data.wallet.coins}.`);
      setTarget(null);
      setHp(0);
      refresh();
      loadShop();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setCatching(false);
    }
  }
  async function loadShop() {
    const data = await api<typeof shop>('/api/shop/rods');
    setShop(data);
    const current = data?.rods.find((entry) => entry.id === data.equipment.rod);
    if (current) setRod(current);
  }
  async function buyRod(rodId: string) {
    try {
      await api('/api/shop/rods/buy', { method: 'POST', body: JSON.stringify({ rodId }) });
      setMessage('Rod purchased and equipped.');
      await loadShop();
      refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  async function equipRod(rodId: string) {
    try {
      await api('/api/shop/rods/equip', { method: 'POST', body: JSON.stringify({ rodId }) });
      setMessage('Rod equipped.');
      await loadShop();
      refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  useEffect(() => {
    loadShop().catch(() => null);
  }, []);
  return (
    <GameLayout title="Fishing" session={session}>
      <div className="fishing-layout">
        <div className="fishing-stage">
          {target ? (
            <button className={`fish-target fish-target--${target.rarity}`} onClick={clickFish} disabled={catching}>
              <span>{target.name}</span>
              <strong>{hp}/{target.hp}</strong>
            </button>
          ) : (
            <button className="primary big-action" onClick={spawnFish}>Spawn fish</button>
          )}
        </div>
        <aside className="shop-panel">
          <h2>Rod Shop</h2>
          <p className="muted">Equipped: {rod.name} ({rod.damage} damage/click)</p>
          <p className="muted">Coins: {shop?.wallet.coins ?? '--'}</p>
          <div className="list">
            {shop?.rods.map((entry) => {
              const owned = shop.equipment.ownedRods?.includes(entry.id);
              const equipped = shop.equipment.rod === entry.id;
              return (
                <div className="row" key={entry.id}>
                  <span>{entry.name} - {entry.damage} dmg - {entry.price} coins</span>
                  {equipped ? <strong>Equipped</strong> : owned ? (
                    <button onClick={() => equipRod(entry.id)}>Equip</button>
                  ) : (
                    <button onClick={() => buyRod(entry.id)}>Buy</button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
      <p>{message}</p>
    </GameLayout>
  );
}

function MinesGame({ me }: { me: Summary }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('Join a lobby to play.');
  const [revealed, setRevealed] = useState<number[]>([]);
  const [settings, setSettings] = useState({ boardSize: 10, minesPerPlayer: 1, maxPlayers: 8, entryFee: 25 });
  const [state, setState] = useState<null | {
    code: string;
    phase: string;
    settings: typeof settings;
    players: Array<{ userId: string; username: string; alive: boolean; placedMines: number }>;
    mineCount: number;
    pot: number;
    winner: string | null;
  }>(null);
  const session = useGameSession('mines');
  const ws = useMemo(() => ({ current: null as WebSocket | null }), []);
  function join() {
    const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/mines`);
    ws.current = socket;
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ready') {
        socket.send(JSON.stringify({ type: 'join', code: code || undefined, username: me.user.username, settings }));
      }
      if (msg.type === 'error') setStatus(msg.message);
      if (msg.type === 'joined') {
        setCode(msg.code);
        setStatus(`Lobby ${msg.code}`);
      }
      if (msg.type === 'round-ended') {
        setStatus(`Round ended: ${msg.winner}`);
      }
      if (msg.type === 'state') {
        setState(msg.state);
        setSettings(msg.state.settings);
        setRevealed(msg.state.revealed || []);
        setStatus(`Phase: ${msg.state.phase}`);
      }
    };
  }
  const boardSize = state?.settings.boardSize || settings.boardSize;
  const placing = state?.phase === 'placing';
  const playing = state?.phase === 'playing';
  return (
    <GameLayout title="Mines" session={session}>
      <div className="mines-layout">
        <aside className="shop-panel">
          <h2>Lobby Settings</h2>
          <label>Code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Blank to create" /></label>
          <label>Board size
            <select value={settings.boardSize} onChange={(event) => setSettings({ ...settings, boardSize: Number(event.target.value) })}>
              <option value={8}>8x8</option>
              <option value={10}>10x10</option>
              <option value={12}>12x12</option>
            </select>
          </label>
          <label>Mines per player
            <select value={settings.minesPerPlayer} onChange={(event) => setSettings({ ...settings, minesPerPlayer: Number(event.target.value) })}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label>Max players
            <input type="number" min={2} max={8} value={settings.maxPlayers} onChange={(event) => setSettings({ ...settings, maxPlayers: Number(event.target.value) })} />
          </label>
          <label>Entry fee
            <input type="number" min={0} value={settings.entryFee} onChange={(event) => setSettings({ ...settings, entryFee: Number(event.target.value) })} />
          </label>
          <button className="primary" onClick={join}>Join/Create</button>
          <p className="muted">Players place {settings.minesPerPlayer} mine(s), then the round starts automatically.</p>
        </aside>
        <section>
          <p>{status}</p>
          <p className="muted">Pot: {state?.pot ?? 0} coins - Mines placed: {state?.mineCount ?? 0}</p>
          <div className="mines-grid" style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(28px, 1fr))` }}>
            {Array.from({ length: boardSize * boardSize }, (_, index) => (
              <button
                key={index}
                className={revealed.includes(index) ? 'is-revealed' : ''}
                onClick={() => ws.current?.send(JSON.stringify({ type: placing ? 'place-mine' : 'click', index }))}
                disabled={!placing && !playing}
                title={placing ? 'Place mine' : 'Reveal tile'}
              >
                {revealed.includes(index) ? 'X' : placing ? '+' : ''}
              </button>
            ))}
          </div>
          <div className="list lobby-list">
            {state?.players.map((player) => (
              <div className="row" key={player.userId}>
                <span>{player.username}{player.userId === me.user.id ? ' (you)' : ''}</span>
                <strong>{player.alive ? `${player.placedMines}/${state.settings.minesPerPlayer} placed` : 'Out'}</strong>
              </div>
            ))}
          </div>
          {state?.winner ? <p className="demo-banner">Winner: {state.winner}</p> : null}
        </section>
      </div>
    </GameLayout>
  );
}

function RpgGame({ refresh }: { refresh: () => void }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('Create a character, start a mission, then claim rewards.');
  const session = useGameSession('rpg');
  async function createCharacter() {
    try {
      await api('/api/games/rpg/character', { method: 'POST', body: JSON.stringify({ name }) });
      setMessage('Character ready.');
      refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  async function startMission() {
    try {
      await api('/api/games/rpg/missions/start', { method: 'POST', body: JSON.stringify({ missionKey: 'scout' }) });
      setMessage('Mission started. Scout mission takes 15 seconds.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  async function claimMission() {
    try {
      await api('/api/games/rpg/missions/claim', { method: 'POST', body: '{}' });
      setMessage('Mission claimed. XP and coins awarded.');
      refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  return (
    <GameLayout title="RPG Preview" session={session}>
      <div className="actions">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Character name" />
        <button onClick={createCharacter}>Create</button>
      </div>
      <div className="actions">
        <button onClick={startMission}>Start scout mission</button>
        <button className="primary" onClick={claimMission}>Claim mission</button>
      </div>
      <p>{message}</p>
    </GameLayout>
  );
}

function useGameSession(gameKey: string) {
  const [sessionId, setSessionId] = useState('');
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!sessionId || !active) return;
    const timer = window.setInterval(() => {
      api('/api/games/session/heartbeat', { method: 'POST', body: JSON.stringify({ sessionId }) }).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [sessionId, active]);
  return {
    active,
    async start() {
      const data = await api<{ session: { id: string } }>('/api/games/session/start', { method: 'POST', body: JSON.stringify({ gameKey }) });
      setSessionId(data.session.id);
      setActive(true);
    },
    async end() {
      if (sessionId) await api('/api/games/session/end', { method: 'POST', body: JSON.stringify({ sessionId }) }).catch(() => {});
      setActive(false);
      setSessionId('');
    },
  };
}

function GameLayout({ title, session, children }: { title: string; session: ReturnType<typeof useGameSession>; children: React.ReactNode }) {
  return (
    <main className="shell">
      <section className="panel">
        <div className="game-head">
          <h1>{title}</h1>
          <button onClick={session.active ? session.end : session.start}>{session.active ? 'End session' : 'Start session'}</button>
        </div>
        {children}
      </section>
    </main>
  );
}

function SettingsDiscord() {
  const [discordId, setDiscordId] = useState('');
  const [message, setMessage] = useState('Discord OAuth is reserved for the next pass. For local demos, link by Discord user id.');
  async function link() {
    try {
      await api('/api/discord/link/confirm', { method: 'POST', body: JSON.stringify({ discordId }) });
      setMessage('Discord account linked.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  }
  return (
    <main className="shell">
      <section className="panel narrow">
        <h1>Discord link</h1>
        <p>{message}</p>
        <input value={discordId} onChange={(event) => setDiscordId(event.target.value)} placeholder="Discord user id" />
        <button onClick={link}>Link Discord</button>
      </section>
    </main>
  );
}

function App() {
  const { me, setMe, loading } = useMe();
  const path = window.location.pathname;
  async function refresh() {
    const next = await api<Summary>('/api/me').catch(() => null);
    setMe(next);
  }
  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  }
  if (loading) return <div className="loading">Loading...</div>;
  let page: React.ReactNode = me ? <Dashboard me={me} /> : <Landing />;
  if (path === '/login') page = <AuthPage mode="login" />;
  else if (path === '/register') page = <AuthPage mode="register" />;
  else if (path.startsWith('/profile/')) page = <ProfilePage />;
  else if (path === '/leaderboards') page = <Leaderboards />;
  else if (path === '/games/fishing') page = me ? <FishingGame refresh={refresh} /> : <AuthPage mode="login" />;
  else if (path === '/games/mines') page = me ? <MinesGame me={me} /> : <AuthPage mode="login" />;
  else if (path === '/games/rpg') page = me ? <RpgGame refresh={refresh} /> : <AuthPage mode="login" />;
  else if (path === '/settings/discord-link') page = me ? <SettingsDiscord /> : <AuthPage mode="login" />;
  return (
    <>
      <Nav me={me} onLogout={logout} />
      {page}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
