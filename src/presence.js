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

    client.user.setPresence({
      status: presenceStatus(),
      activities: [onlineActivityLine({ adapter, snapshot })]
    });
  } catch (error) {
    console.warn('Presence poll failed', error);
    client.user.setPresence({
      status: offlinePresenceStatus(),
      activities: [offlineActivityLine()]
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

function onlineActivityLine({ adapter, snapshot }) {
  const count = snapshot.maxPlayers
    ? `${snapshot.currentPlayers}/${snapshot.maxPlayers}`
    : String(snapshot.currentPlayers);
  const fps = firstNumber([
    snapshot.metrics?.serverfps,
    snapshot.metrics?.serverFps,
    snapshot.metrics?.fps,
    snapshot.metrics?.server_fps
  ]);
  const uptime = firstNumber([
    snapshot.metrics?.uptime,
    snapshot.metrics?.serveruptime,
    snapshot.metrics?.serverUptime
  ]);
  const lines = [
    { name: `Online - ${count} survivors`, type: ActivityType.Watching },
    { name: `Online - ${count} in ${serverName()}`, type: ActivityType.Playing },
    { name: `Online - ${adapter.label}${snapshot.version ? ` ${snapshot.version}` : ''}`, type: ActivityType.Watching },
    fps ? { name: `Online - FPS ${Math.round(fps)} - ${count}`, type: ActivityType.Watching } : null,
    uptime ? { name: `Online - ${formatDuration(uptime * 1000)} uptime`, type: ActivityType.Watching } : null
  ].filter(Boolean);

  return lines[pulseIndex(lines.length)];
}

function offlineActivityLine() {
  const lines = [
    { name: `${serverName()} - offline`, type: ActivityType.Watching },
    { name: 'server signal lost', type: ActivityType.Watching },
    { name: 'for the campfires to return', type: ActivityType.Watching }
  ];

  return lines[pulseIndex(lines.length)];
}

function activityIntervalMs() {
  const seconds = Number.parseInt(env.PRESENCE_UPDATE_SECONDS || String(DEFAULT_ACTIVITY_SECONDS), 10);
  return Math.max(seconds, 30) * 1000;
}

function presenceStatus() {
  const status = String(env.DISCORD_PRESENCE_STATUS || 'online').toLowerCase();
  return ['online', 'idle', 'dnd', 'invisible'].includes(status) ? status : 'online';
}

function offlinePresenceStatus() {
  const status = String(env.DISCORD_OFFLINE_PRESENCE_STATUS || 'idle').toLowerCase();
  return ['online', 'idle', 'dnd', 'invisible'].includes(status) ? status : 'idle';
}

function serverName() {
  return env.SERVER_DISPLAY_NAME || 'The Tribal Lands';
}

function firstNumber(values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function formatDuration(ms) {
  if (!ms || ms < 1000) {
    return 'under 1m';
  }

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${Math.max(totalMinutes, 1)}m`;
  }

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function requiredEnv(name) {
  const value = env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.replace(/^Bot\s+/i, '').trim();
}
