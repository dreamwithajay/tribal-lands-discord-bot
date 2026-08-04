import nacl from 'tweetnacl';

const DISCORD_API = 'https://discord.com/api/v10';
const STATE_KEY = 'tribal-lands-state';
const STATUS_FOOTER = 'tribal-lands-status';
const ONLINE_COLOR = 0x2f855a;
const OFFLINE_COLOR = 0xc53030;
const UNKNOWN_COLOR = 0x718096;

const JOIN_LINES = [
  '{player} has crossed into The Tribal Lands.',
  '{player} arrives at camp.',
  '{player} steps through the gate and into the wilds.',
  '{player} has entered The Tribal Lands.'
];

const LEAVE_LINES = [
  '{player} has returned to civilization.',
  '{player} fades from the trail.',
  '{player} heads back beyond the border.',
  '{player} leaves The Tribal Lands behind for now.'
];

export default {
  async fetch(request, env) {
    if (request.method === 'GET') {
      return json({ ok: true, name: serverName(env) });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.text();
    const valid = verifyDiscordRequest(request, body, env.DISCORD_PUBLIC_KEY);
    if (!valid) {
      return new Response('Invalid request signature', { status: 401 });
    }

    const interaction = JSON.parse(body);

    if (interaction.type === 1) {
      return json({ type: 1 });
    }

    if (interaction.type !== 2) {
      return interactionResponse(`I do not know how to answer that yet.`);
    }

    return handleCommand(interaction, env);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runMonitor(env));
  }
};

async function handleCommand(interaction, env) {
  const command = interaction.data?.name;

  if (command === 'status') {
    try {
      const snapshot = await fetchPalworldSnapshot(env);
      return interactionResponse('', [buildStatusEmbed({ env, mode: 'online', snapshot })]);
    } catch {
      return interactionResponse(`${serverName(env)} is not reachable right now.`);
    }
  }

  if (command === 'players') {
    try {
      const snapshot = await fetchPalworldSnapshot(env);
      const names = snapshot.players.map((player) => player.displayName);
      const content =
        names.length > 0
          ? `Currently in ${serverName(env)}: ${names.join(', ')}.`
          : `No survivors are currently in ${serverName(env)}.`;
      return interactionResponse(content);
    } catch {
      return interactionResponse(`I cannot reach ${serverName(env)} right now.`);
    }
  }

  return interactionResponse(`Unknown command.`);
}

async function runMonitor(env) {
  const state = await readState(env);

  try {
    const snapshot = await fetchPalworldSnapshot(env);
    await handleOnlineSnapshot(env, state, snapshot);
  } catch (error) {
    await handlePollFailure(env, state, error);
  }
}

async function handleOnlineSnapshot(env, state, snapshot) {
  const recovered = state.offlineAnnounced || state.failureCount >= offlineFailureThreshold(env);
  const downtimeMs = state.offlineSince ? Date.now() - new Date(state.offlineSince).getTime() : null;

  if (recovered) {
    await sendChannelMessage(env, `${serverName(env)} has returned. Downtime: ${formatDuration(downtimeMs)}.`);
  }

  await sendPlayerDiffs(env, state, snapshot);

  const nextState = {
    ...state,
    failureCount: 0,
    offlineSince: null,
    offlineAnnounced: false,
    authFailureAnnounced: false,
    lastSnapshot: {
      fetchedAt: snapshot.fetchedAt.toISOString(),
      players: snapshot.players,
      info: snapshot.info,
      currentPlayers: snapshot.currentPlayers,
      maxPlayers: snapshot.maxPlayers
    },
    lastPlayerMap: Object.fromEntries(snapshot.players.map((player) => [player.key, player])),
    updatedAt: new Date().toISOString()
  };

  await updateStatusMessage(env, nextState, snapshot, { force: recovered });
  await writeState(env, nextState);
}

async function handlePollFailure(env, state, error) {
  const failureCount = (state.failureCount ?? 0) + 1;
  const offlineSince = state.offlineSince ?? new Date().toISOString();
  const isAuthError = error?.status === 401;
  const nextState = {
    ...state,
    failureCount,
    offlineSince,
    updatedAt: new Date().toISOString()
  };

  if (isAuthError && !state.authFailureAnnounced) {
    nextState.authFailureAnnounced = true;
    await sendChannelMessage(
      env,
      `${serverName(env)} REST credentials were rejected. Check the Cloudflare secret for PALWORLD_PASSWORD.`
    );
  }

  if (!isAuthError && failureCount >= offlineFailureThreshold(env) && !state.offlineAnnounced) {
    nextState.offlineAnnounced = true;
    await sendChannelMessage(
      env,
      `${serverName(env)} is not answering from the trail. Last good check: ${formatDiscordTimestamp(
        state.lastSnapshot?.fetchedAt
      )}.`
    );
  }

  await updateStatusMessage(env, nextState, null, {
    force: nextState.offlineAnnounced || isAuthError,
    mode: isAuthError ? 'auth_error' : 'offline'
  });
  await writeState(env, nextState);
}

async function sendPlayerDiffs(env, state, snapshot) {
  if (!state.lastPlayerMap) {
    return;
  }

  const previous = new Map(Object.entries(state.lastPlayerMap));
  const current = new Map(snapshot.players.map((player) => [player.key, player]));
  const joined = [...current.values()].filter((player) => !previous.has(player.key));
  const left = [...previous.values()].filter((player) => !current.has(player.key));

  if (joined.length === 1) {
    await sendChannelMessage(env, fillTemplate(pick(JOIN_LINES), joined[0].displayName));
  } else if (joined.length > 1) {
    await sendChannelMessage(env, `A party crossed into ${serverName(env)}: ${formatNames(joined)}.`);
  }

  if (left.length === 1) {
    await sendChannelMessage(env, fillTemplate(pick(LEAVE_LINES), left[0].displayName));
  } else if (left.length > 1) {
    await sendChannelMessage(env, `A party left ${serverName(env)}: ${formatNames(left)}.`);
  }

  if (snapshot.players.length === 0 && left.length > 0) {
    await sendChannelMessage(env, `Silence falls over ${serverName(env)}. No survivors remain.`);
  }
}

async function updateStatusMessage(env, state, snapshot, { force = false, mode = 'online' } = {}) {
  const now = Date.now();
  const signature = snapshot
    ? [
        'online',
        snapshot.info?.version,
        snapshot.info?.servername,
        snapshot.players.map((player) => player.key).sort().join(',')
      ].join('|')
    : `${mode}|${state.failureCount ?? 0}`;

  if (!force && signature === state.lastStatusSignature && now - (state.lastStatusEditAt ?? 0) < statusUpdateMs(env)) {
    return;
  }

  const messageId = state.statusMessageId || env.STATUS_MESSAGE_ID;
  const embed = snapshot
    ? buildStatusEmbed({ env, mode: 'online', snapshot })
    : buildStatusEmbed({ env, mode, state });

  if (messageId) {
    const edited = await editChannelMessage(env, messageId, { embeds: [embed] });
    if (edited?.id) {
      state.statusMessageId = edited.id;
    }
  } else {
    const created = await sendChannelMessage(env, '', { embeds: [embed] });
    state.statusMessageId = created.id;
  }

  state.lastStatusSignature = signature;
  state.lastStatusEditAt = now;
}

function buildStatusEmbed({ env, mode, snapshot = null, state = {} }) {
  if (mode === 'online' && snapshot) {
    const playerText =
      snapshot.players.length > 0
        ? snapshot.players.map((player) => player.displayName).join('\n')
        : 'No survivors currently roam the island.';
    const capacity = snapshot.maxPlayers
      ? `${snapshot.currentPlayers} / ${snapshot.maxPlayers}`
      : String(snapshot.currentPlayers);

    return {
      title: serverName(env),
      color: ONLINE_COLOR,
      description: 'Online. The campfires are lit.',
      fields: [
        { name: 'Version', value: snapshot.info?.version ?? 'Unknown', inline: true },
        { name: 'Players', value: capacity, inline: true },
        { name: 'Survivors', value: playerText.slice(0, 1024), inline: false },
        { name: 'Last check', value: formatDiscordTimestamp(snapshot.fetchedAt), inline: true }
      ],
      footer: { text: STATUS_FOOTER }
    };
  }

  if (mode === 'auth_error') {
    return {
      title: serverName(env),
      color: UNKNOWN_COLOR,
      description: 'The REST API is reachable, but the bot credentials were rejected.',
      fields: [{ name: 'Last good check', value: formatDiscordTimestamp(state.lastSnapshot?.fetchedAt), inline: true }],
      footer: { text: STATUS_FOOTER }
    };
  }

  return {
    title: serverName(env),
    color: OFFLINE_COLOR,
    description: 'Offline. The trail has gone quiet.',
    fields: [
      { name: 'Failed checks', value: String(state.failureCount ?? 0), inline: true },
      { name: 'Last good check', value: formatDiscordTimestamp(state.lastSnapshot?.fetchedAt), inline: true }
    ],
    footer: { text: STATUS_FOOTER }
  };
}

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
    fetchedAt: new Date(),
    info,
    players: playerList,
    metrics,
    settings,
    currentPlayers: playerList.length,
    maxPlayers
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
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`
    }
  });

  if (!response.ok) {
    const error = new Error(`Palworld REST returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function sendChannelMessage(env, content, extra = {}) {
  return discordRequest(env, `/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
    method: 'POST',
    body: {
      content,
      ...extra
    }
  });
}

async function editChannelMessage(env, messageId, body) {
  return discordRequest(env, `/channels/${env.DISCORD_CHANNEL_ID}/messages/${messageId}`, {
    method: 'PATCH',
    body
  });
}

async function discordRequest(env, path, { method, body }) {
  const response = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Discord API ${response.status}: ${message}`);
  }

  return response.json();
}

async function readState(env) {
  return (await env.STATE.get(STATE_KEY, 'json')) ?? {};
}

async function writeState(env, state) {
  await env.STATE.put(STATE_KEY, JSON.stringify(state));
}

function verifyDiscordRequest(request, body, publicKey) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');

  if (!signature || !timestamp || !publicKey) {
    return false;
  }

  return nacl.sign.detached.verify(
    textToBytes(`${timestamp}${body}`),
    hexToBytes(signature),
    hexToBytes(publicKey)
  );
}

function interactionResponse(content, embeds = []) {
  return json({
    type: 4,
    data: {
      content,
      embeds,
      flags: 64
    }
  });
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

function serverName(env) {
  return env.SERVER_DISPLAY_NAME || 'The Tribal Lands';
}

function offlineFailureThreshold(env) {
  return Number.parseInt(env.OFFLINE_FAILURE_THRESHOLD || '2', 10);
}

function statusUpdateMs(env) {
  return Number.parseInt(env.STATUS_UPDATE_SECONDS || '60', 10) * 1000;
}

function formatNames(players) {
  return players.map((player) => player.displayName).join(', ');
}

function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

function fillTemplate(template, player) {
  return template.replace('{player}', player);
}

function formatDiscordTimestamp(date) {
  if (!date) {
    return 'Never';
  }

  const parsed = date instanceof Date ? date : new Date(date);
  return `<t:${Math.floor(parsed.getTime() / 1000)}:R>`;
}

function formatDuration(ms) {
  if (!ms || ms < 1000) {
    return 'less than a minute';
  }

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (minutes <= 0) {
    return `${seconds} seconds`;
  }

  if (minutes === 1) {
    return '1 minute';
  }

  return `${minutes} minutes`;
}

function json(value, init = {}) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });
}

function textToBytes(value) {
  return new TextEncoder().encode(value);
}

function hexToBytes(hex) {
  const matches = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(matches.map((byte) => Number.parseInt(byte, 16)));
}
