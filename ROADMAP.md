# Broken Ice Machine Rebuild Roadmap

Broken Ice Machine is now being rebuilt as a simple self-hostable gaming social platform demo. The product loop is:

1. Create a website account with a unique username.
2. Or start a temporary demo guest account with unsaved data.
3. Log in and view a dashboard.
4. Play Fishing, Mines, or the RPG preview.
5. Earn coins, XP, inventory, and stats.
6. Show progress on public profiles and leaderboards.
7. Link Discord so bot commands can access the same account.

## Target Stack

- Node.js backend runtime.
- Express for API routes and session auth.
- React + TypeScript frontend, built with Vite.
- PostgreSQL for production persistence.
- In-memory store for local demos/tests when `DATABASE_URL` is not set.
- `discord.js` for bot commands.
- WebSockets for Mines lobbies.

## MVP Features

- Username/password website accounts.
- Temporary demo guest accounts excluded from persistence and leaderboards.
- UUID user IDs.
- Case-insensitive unique usernames.
- Public profile pages by normalized username.
- Wallet and daily rewards.
- Active playtime tracking by game session heartbeat.
- Fishing clicker mini-game with fish HP, moving circle targets, rod damage upgrades, catch rewards, and inventory/stat progress.
- Mines multiplayer lobby mini-game with invite codes, up to 8 players, configurable board size, mines per player, entry fee, player mine placement, eliminations, and winner payout.
- RPG preview with character and timed missions, kept lightweight until the later 3D dungeon crawler phase.
- Leaderboards for coins, fishing, Mines, RPG, and active hours.
- Discord bot commands for linked accounts.

## Deferred Features

- Real Discord OAuth linking flow.
- Friends and social feed.
- Subscription payments.
- Full 3D browser RPG map/combat/dungeon crawler framework.
- Production deployment pipeline.

## Demo Script

1. Register a new account.
2. Try registering the same username with different casing to show duplicate protection.
3. Start a demo guest account to show no-setup play.
4. Play Fishing and earn coins.
5. Start an RPG mission, then claim rewards after it finishes.
6. Show profile stats and active hours.
7. Show leaderboards.
8. Explain that Discord commands require linking and use the same account stats.
