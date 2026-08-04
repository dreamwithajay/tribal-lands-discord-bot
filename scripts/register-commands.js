import 'dotenv/config';

const DISCORD_API = 'https://discord.com/api/v10';

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing ${name}`);
  }
}

const serverName = process.env.SERVER_DISPLAY_NAME || 'The Tribal Lands';
const discordToken = process.env.DISCORD_TOKEN.replace(/^Bot\s+/i, '').trim();
const commands = [
  {
    name: 'status',
    description: `Show ${serverName} server status.`,
    type: 1
  },
  {
    name: 'players',
    description: `Show who is currently in ${serverName}.`,
    type: 1
  },
  {
    name: 'server',
    description: `Show ${serverName} game and monitor details.`,
    type: 1
  },
  {
    name: 'help',
    description: `Show ${serverName} bot commands.`,
    type: 1
  }
];

const response = await fetch(
  `${DISCORD_API}/applications/${process.env.DISCORD_CLIENT_ID}/guilds/${process.env.DISCORD_GUILD_ID}/commands`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${discordToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  }
);

if (!response.ok) {
  if (response.status === 401) {
    throw new Error(
      'Discord command registration failed: 401 Unauthorized. Check DISCORD_TOKEN in your local .env. Use the Bot token only, without a leading "Bot " prefix.'
    );
  }

  throw new Error(`Discord command registration failed: ${response.status} ${await response.text()}`);
}

console.log(`Registered /status, /players, /server, and /help for ${serverName}.`);
