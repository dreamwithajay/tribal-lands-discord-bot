import 'dotenv/config';
import { ActivityType, Client, GatewayIntentBits } from 'discord.js';
import { palworldAdapter } from './games/palworld.js';

const DEFAULT_ACTIVITY_SECONDS = 60;

const env = process.env;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Presence service logged in as ${client.user.tag}`);
  await updatePresence();
  setInterval(() => {
    updatePresence().catch((error) => console.error('Presence update failed', error));
  }, activityIntervalMs());
});

client.on('error', (error) => {
  console.error('Discord client error', error);
});

await client.login(requiredEnv('DISCORD_TOKEN'));

async function updatePresence() {
  const adapter = getPresenceAdapter();

  if (!adapter) {
    client.user.setPresence({
      status: presenceStatus(),
      activities: [{ name: `${serverName()} is between worlds`, type: ActivityType.Watching }]
    });
    return;
  }

  try {
    const snapshot = await adapter.fetchSnapshot(env);
    const count = snapshot.maxPlayers
      ? `${snapshot.currentPlayers}/${snapshot.maxPlayers}`
      : String(snapshot.currentPlayers);
    const lines = [
      { name: `${count} survivors online`, type: ActivityType.Watching },
      { name: serverName(), type: ActivityType.Playing },
      { name: `${adapter.label}${snapshot.version ? ` ${snapshot.version}` : ''}`, type: ActivityType.Watching }
    ];

    client.user.setPresence({
      status: presenceStatus(),
      activities: [lines[pulseIndex(lines.length)]]
    });
  } catch (error) {
    console.warn('Presence poll failed', error);
    client.user.setPresence({
      status: 'idle',
      activities: [{ name: `${serverName()} signal`, type: ActivityType.Watching }]
    });
  }
}

function getPresenceAdapter() {
  const provider = String(env.GAME_PROVIDER || 'palworld').toLowerCase();
  if (provider === 'none') {
    return null;
  }

  if (provider === 'palworld') {
    return palworldAdapter;
  }

  throw new Error(`Unsupported GAME_PROVIDER: ${provider}`);
}

function pulseIndex(length) {
  return Math.floor(Date.now() / activityIntervalMs()) % length;
}

function activityIntervalMs() {
  const seconds = Number.parseInt(env.PRESENCE_UPDATE_SECONDS || String(DEFAULT_ACTIVITY_SECONDS), 10);
  return Math.max(seconds, 30) * 1000;
}

function presenceStatus() {
  const status = String(env.DISCORD_PRESENCE_STATUS || 'online').toLowerCase();
  return ['online', 'idle', 'dnd', 'invisible'].includes(status) ? status : 'online';
}

function serverName() {
  return env.SERVER_DISPLAY_NAME || 'The Tribal Lands';
}

function requiredEnv(name) {
  const value = env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.replace(/^Bot\s+/i, '').trim();
}
