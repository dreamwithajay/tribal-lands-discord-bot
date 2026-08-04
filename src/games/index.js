import { palworldAdapter } from './palworld.js';

const adapters = new Map([[palworldAdapter.id, palworldAdapter]]);

export function getGameAdapter(env) {
  const provider = gameProvider(env);

  if (provider === 'none') {
    return null;
  }

  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`Unsupported GAME_PROVIDER: ${provider}`);
  }

  return adapter;
}

export function gameProvider(env) {
  return String(env.GAME_PROVIDER || 'palworld').toLowerCase();
}

export function pollingEnabled(env) {
  return String(env.POLLING_ENABLED ?? 'true').toLowerCase() === 'true';
}
