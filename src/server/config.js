import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  databaseUrl: process.env.DATABASE_URL || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,
  discordToken: process.env.DISCORD_TOKEN || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
};

export const isProduction = config.nodeEnv === 'production';
