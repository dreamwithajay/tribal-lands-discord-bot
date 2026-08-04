import { config } from './config.js';
import { TribalLandsBot } from './discordBot.js';
import { PalworldClient } from './palworldClient.js';

const palworld = new PalworldClient(config.palworld);
const bot = new TribalLandsBot({ config, palworld });

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', error);
  process.exitCode = 1;
});

await bot.start();
