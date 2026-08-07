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
    emptyAfterLeave: 'Silence falls over {server}. No survivors remain.',
    restartDetected: 'Restart detected for {server}. The camp is back online. Current uptime: {uptime}.'
  },
  joinLines: [
    '{player} has crossed into {server}.',
    '{player} arrives at camp.',
    '{player} steps through the gate and into the wilds.',
    '{player} has entered {server}.',
    '{player} just made landfall in {server}.',
    '{player} has joined the expedition.',
    '{player} is back under the tribal banner.',
    '{player} has returned to the frontier.',
    '{player} is answering the call of {server}.',
    '{player} just lit a torch at camp.',
    '{player} has stepped into the wilds.',
    '{player} rides into {server}.',
    '{player} has joined the hunt.',
    '{player} is back on island time.',
    '{player} has entered the survival zone.',
    '{player} just crossed the boundary stones.',
    '{player} has been spotted near camp.',
    '{player} walks the trail into {server}.',
    '{player} has joined the tribe.',
    '{player} is ready to tame trouble.',
    '{player} just arrived with questionable supplies.',
    '{player} has touched down in {server}.',
    '{player} is back where the campfires burn.',
    '{player} has joined the night watch.',
    '{player} has returned to the grasslands.',
    '{player} enters {server} with purpose.',
    '{player} has appeared on the horizon.',
    '{player} is roaming {server} once again.',
    '{player} has joined the party.',
    '{player} is officially on the island.',
    '{player} just woke up in {server}.',
    '{player} has rejoined the wild company.',
    '{player} brings fresh footsteps to camp.',
    '{player} has entered the Tribal Lands.',
    '{player} is back in the thick of it.',
    '{player} just joined the camp roster.',
    '{player} has arrived. The Pals have been warned.'
  ],
  leaveLines: [
    '{player} has returned to civilization.',
    '{player} fades from the trail.',
    '{player} heads back beyond the border.',
    '{player} leaves {server} behind for now.',
    '{player} has left the expedition.',
    '{player} logs off beneath a quiet sky.',
    '{player} has stepped away from the campfire.',
    '{player} disappears beyond the treeline.',
    '{player} has headed back to safer ground.',
    '{player} leaves the wilds to settle down.',
    '{player} has packed up for now.',
    '{player} walks out past the boundary stones.',
    '{player} has gone off the map.',
    '{player} returns to the world beyond {server}.',
    '{player} has left the hunt.',
    '{player} is no longer roaming the island.',
    '{player} has gone quiet on comms.',
    '{player} takes the long road home.',
    '{player} has departed camp.',
    '{player} leaves only footprints behind.',
    '{player} has signed off from {server}.',
    '{player} has vanished into the mist.',
    '{player} is done tempting fate for now.',
    '{player} has left the tribe to its business.',
    '{player} slips away from the watchfire.',
    '{player} has ended today\'s expedition.',
    '{player} has retreated from the wilds.',
    '{player} exits {server} in one piece.',
    '{player} leaves the camp roster.',
    '{player} has gone back beyond the gates.',
    '{player} is taking shelter elsewhere.',
    '{player} has left the island behind.',
    '{player} has clocked out of survival duty.',
    '{player} disappears from the trail markers.',
    '{player} has stepped out of {server}.',
    '{player} leaves the Pals unsupervised.',
    '{player} has returned to the quiet side of life.'
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
    uptimeSeconds: firstNumber([
      metrics?.uptime,
      metrics?.serveruptime,
      metrics?.serverUptime,
      metrics?.server_uptime
    ]),
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
