import http from 'http';
import { createApp, attachMinesWebSocket, createSessionMiddleware } from './app.js';
import { createDiscordBot } from './bot.js';
import { config } from './config.js';
import { createStore } from './store.js';

const store = createStore();
await store.init();

const sessionMiddleware = createSessionMiddleware();
const app = createApp({ store, sessionMiddleware });
const server = http.createServer(app);
attachMinesWebSocket(server, store, sessionMiddleware);
createDiscordBot({ token: config.discordToken, store, publicUrl: config.publicUrl });

server.listen(config.port, config.host, () => {
  console.log(`Broken Ice Machine running at http://${config.host}:${config.port}`);
});
