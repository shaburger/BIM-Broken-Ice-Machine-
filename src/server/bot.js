import { Client, Events, GatewayIntentBits } from 'discord.js';

function formatHours(hours) {
  return Object.entries(hours)
    .map(([game, value]) => `${game}: ${value.toFixed(2)}h`)
    .join(', ');
}

export function createDiscordBot({ token, store, publicUrl }) {
  if (!token) return null;
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  async function linkedSummary(message) {
    const user = await store.getUserByDiscordId(message.author.id);
    if (!user) {
      await message.reply(`Link your Discord account first: ${publicUrl}/settings/discord-link`);
      return null;
    }
    return store.buildUserSummary(user);
  }

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord bot ready as ${readyClient.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.content.startsWith('!bim')) return;
    const [, command] = message.content.trim().split(/\s+/);
    const cmd = command || 'help';
    if (cmd === 'help') {
      return message.reply('Commands: `!bim stats`, `!bim wallet`, `!bim daily`, `!bim leaderboard`, `!bim coinflip`.');
    }
    const summary = await linkedSummary(message);
    if (!summary) return;
    if (cmd === 'stats') {
      return message.reply(
        `${summary.user.username}: ${summary.wallet.coins} coins | Fishing catches: ${summary.stats.fishing.catches} | RPG level: ${summary.stats.rpg.level} | Hours: ${formatHours(summary.activeHours)}`
      );
    }
    if (cmd === 'wallet') return message.reply(`${summary.user.username} has ${summary.wallet.coins} coins.`);
    if (cmd === 'daily') {
      try {
        const wallet = await store.claimDaily(summary.user.id);
        return message.reply(`Daily claimed. New balance: ${wallet.coins} coins.`);
      } catch (err) {
        return message.reply(err.message || 'Daily is not available yet.');
      }
    }
    if (cmd === 'leaderboard') {
      const board = await store.getLeaderboards('coins', 5);
      return message.reply(board.map((row) => `#${row.rank} ${row.user.username}: ${row.value}`).join('\n') || 'No entries yet.');
    }
    if (cmd === 'coinflip') {
      const won = Math.random() >= 0.5;
      const wallet = won ? await store.addCoins(summary.user.id, 25) : summary.wallet;
      return message.reply(won ? `You won 25 coins. Balance: ${wallet.coins}.` : 'You lost the flip. No coins awarded.');
    }
    return message.reply('Unknown command. Try `!bim help`.');
  });

  void client.login(token);
  return client;
}
