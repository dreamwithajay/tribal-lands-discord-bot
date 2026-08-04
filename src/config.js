import 'dotenv/config';

const DEFAULTS = {
  PALWORLD_HOST: '135.148.100.61',
  PALWORLD_PORT: '25586',
  PALWORLD_USERNAME: 'admin',
  SERVER_DISPLAY_NAME: 'The Tribal Lands',
  POLL_INTERVAL_SECONDS: '10',
  STATUS_UPDATE_SECONDS: '30',
  OFFLINE_FAILURE_THRESHOLD: '3',
  STARTUP_NOTIFICATION: 'false'
};

function readEnv(name) {
  return process.env[name] ?? DEFAULTS[name];
}

function requireEnv(name) {
  const value = readEnv(name);
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function readInt(name, min) {
  const raw = readEnv(name);
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${name} must be an integer greater than or equal to ${min}`);
  }
  return value;
}

function readBool(name) {
  return String(readEnv(name)).toLowerCase() === 'true';
}

export const config = {
  discord: {
    token: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('DISCORD_CLIENT_ID'),
    guildId: requireEnv('DISCORD_GUILD_ID'),
    channelId: requireEnv('DISCORD_CHANNEL_ID')
  },
  palworld: {
    host: requireEnv('PALWORLD_HOST'),
    port: readInt('PALWORLD_PORT', 1),
    username: requireEnv('PALWORLD_USERNAME'),
    password: requireEnv('PALWORLD_PASSWORD'),
    timeoutMs: 8000
  },
  bot: {
    serverName: requireEnv('SERVER_DISPLAY_NAME'),
    pollIntervalMs: readInt('POLL_INTERVAL_SECONDS', 5) * 1000,
    statusUpdateMs: readInt('STATUS_UPDATE_SECONDS', 10) * 1000,
    offlineFailureThreshold: readInt('OFFLINE_FAILURE_THRESHOLD', 1),
    statusMessageId: readEnv('STATUS_MESSAGE_ID')?.trim() || null,
    startupNotification: readBool('STARTUP_NOTIFICATION')
  }
};
