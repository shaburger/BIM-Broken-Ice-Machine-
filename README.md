# Broken Ice Machine

Broken Ice Machine is a self-hostable gaming social platform demo built with Node.js, Express, React + TypeScript, PostgreSQL, WebSockets, and Discord bot commands.

The project is designed as a recruiter/interviewer portfolio piece: it shows account creation, auth, database-backed profiles, mini-games, wallets, stats, leaderboards, and a Discord bot surface that reads from the same account model.

## Features

- Website-first username/password accounts.
- Temporary demo guest accounts that do not save data to PostgreSQL.
- UUID user IDs and case-insensitive unique usernames.
- Public profiles with coins, equipment, game stats, and active hours.
- Fishing clicker loop with fish HP, catch rewards, and rod upgrades.
- Mines multiplayer lobbies with invite codes, configurable board settings, mine placement, eliminations, and winner payout.
- RPG Preview route is intentionally lightweight until the 3D RPG phase.
- Wallet rewards, daily rewards, inventory, XP, and leaderboards.
- Discord bot commands for linked accounts.
- PostgreSQL support with local in-memory fallback for demos/tests.

## Setup

Install dependencies:

```bash
npm install
```

Run the backend and frontend dev servers:

```bash
npm run dev
```

Build the React frontend:

```bash
npm run build
```

Run the production-style Node app after building:

```bash
npm start
```

Run tests:

```bash
npm test
```

## Environment

Optional `.env` values:

```env
PORT=3000
SESSION_SECRET="change-me"
DATABASE_URL="postgres connection string"
PUBLIC_URL="http://localhost:3000"
DISCORD_TOKEN="discord bot token"
```

When `DATABASE_URL` is omitted, the app uses an in-memory store so the demo can run without PostgreSQL.

Use the "Try demo guest" button on the landing/login/register screens for a temporary account. Demo account progress only lives in memory and is excluded from leaderboards.

## Roadmap

See [ROADMAP.md](./ROADMAP.md).
