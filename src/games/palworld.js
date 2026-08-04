export const palworldAdapter = {
  id: 'palworld',
  label: 'Palworld',
  authSecretName: 'PALWORLD_PASSWORD',
  copy: {
    online: 'Online. The campfires are lit.',
    empty: 'No survivors currently roam the island.',
    playersLabel: 'Survivors',
    unreachable: '{server} is not reachable right now.',
    cannotReach: 'I cannot reach {server} right now.',
    credentialRejected:
      '{server} REST credentials were rejected. Check the Cloudflare secret for PALWORLD_PASSWORD.',
    offline: '{server} is not answering from the trail. Last good check: {lastGood}.',
    recovered: '{server} has returned. Downtime: {downtime}.',
    offlineDescription: 'Offline. The trail has gone quiet.',
    authErrorDescription: 'The REST API is reachable, but the bot credentials were rejected.',
    noPlayers: 'No survivors are currently in {server}.',
    currentPlayers: 'Currently in {server}: {players}.',
    multiJoin: 'A party crossed into {server}: {players}.',
    multiLeave: 'A party left {server}: {players}.',
    emptyAfterLeave: 'Silence falls over {server}. No survivors remain.'
  },
  joinLines: [
    '{player} has crossed into {server}.',
    '{player} arrives at camp.',
    '{player} steps through the gate and into the wilds.',
    '{player} has entered {server}.'
  ],
  leaveLines: [
    '{player} has returned to civilization.',
    '{player} fades from the trail.',
    '{player} heads back beyond the border.',
    '{player} leaves {server} behind for now.'
  ],
  fetchSnapshot: fetchPalworldSnapshot
};

async function fetchPalworldSnapshot(env) {
  const [info, players, metrics, settings] = await Promise.all([
    palworldRequest(env, '/info'),
    palworldRequest(env, '/players'),
    optionalPalworldRequest(env, '/metrics'),
    optionalPalworldRequest(env, '/settings')
  ]);

  const playerList = normalizePlayers(players);
  const maxPlayers = firstNumber([
    metrics?.maxplayernum,
    metrics?.maxPlayerNum,
    metrics?.max_players,
    settings?.ServerPlayerMaxNum,
    settings?.serverPlayerMaxNum,
    settings?.maxPlayers
  ]);

  return {
    gameProvider: 'palworld',
    gameLabel: 'Palworld',
    fetchedAt: new Date(),
    info,
    players: playerList,
    metrics,
    settings,
    currentPlayers: playerList.length,
    maxPlayers,
    version: info?.version ?? null
  };
}

async function optionalPalworldRequest(env, path) {
  try {
    return await palworldRequest(env, path);
  } catch {
    return null;
  }
}

async function palworldRequest(env, path) {
  const baseUrl = `http://${env.PALWORLD_HOST}:${env.PALWORLD_PORT}/v1/api`;
  const auth = btoa(`${env.PALWORLD_USERNAME}:${env.PALWORLD_PASSWORD}`);
  let response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${auth}`
      }
    });
  } catch (error) {
    const wrapped = new Error(`Network fetch failed for Palworld ${path}`);
    wrapped.code = error?.name || 'FetchError';
    wrapped.cause = error;
    throw wrapped;
  }

  if (!response.ok) {
    const error = new Error(`Palworld REST returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function normalizePlayers(payload) {
  const rawPlayers = Array.isArray(payload) ? payload : payload?.players;
  if (!Array.isArray(rawPlayers)) {
    return [];
  }

  return rawPlayers
    .filter(Boolean)
    .map((player) => ({
      ...player,
      displayName: playerName(player),
      key: playerKey(player)
    }))
    .filter((player) => player.key && player.displayName);
}

function playerKey(player) {
  return String(
    player.userId ??
      player.userid ??
      player.playeruid ??
      player.playerId ??
      player.steamid ??
      player.steamId ??
      player.accountName ??
      player.name
  );
}

function playerName(player) {
  return String(
    player.name ??
      player.playerName ??
      player.accountName ??
      player.nickname ??
      playerKey(player)
  );
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
