import nacl from 'tweetnacl';
import { getGameAdapter, pollingEnabled } from './games/index.js';

const DISCORD_API = 'https://discord.com/api/v10';
const STATE_KEY = 'tribal-lands-state';
const STATUS_FOOTER = 'tribal-lands-status';
const ONLINE_COLOR = 0x2f855a;
const OFFLINE_COLOR = 0xc53030;
const UNKNOWN_COLOR = 0x718096;

export default {
  async fetch(request, env) {
    if (request.method === 'GET') {
      const adapter = getGameAdapter(env);
      return json({
        ok: true,
        name: serverName(env),
        gameProvider: adapter?.id ?? 'none',
        pollingEnabled: pollingEnabled(env),
        diagnostics: {
          stateBinding: Boolean(env.STATE),
          discordPublicKey: Boolean(env.DISCORD_PUBLIC_KEY),
          discordToken: Boolean(env.DISCORD_TOKEN),
          discordChannelId: Boolean(env.DISCORD_CHANNEL_ID),
          palworldHost: Boolean(env.PALWORLD_HOST),
          palworldPort: Boolean(env.PALWORLD_PORT),
          palworldUsername: Boolean(env.PALWORLD_USERNAME),
          palworldPassword: Boolean(env.PALWORLD_PASSWORD)
        }
      });
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

    try {
      return await handleCommand(interaction, env);
    } catch (error) {
      console.error('Interaction handler failed', error);
      return interactionResponse(
        `${serverName(env)} bot hit a setup issue. Check Cloudflare Worker logs for the latest error.`
      );
    }
  },

  async scheduled(_controller, env, ctx) {
    if (pollingEnabled(env)) {
      ctx.waitUntil(runMonitor(env));
    }
  }
};

async function handleCommand(interaction, env) {
  const command = interaction.data?.name;
  const adapter = getGameAdapter(env);

  if (!adapter) {
    return interactionResponse(`${serverName(env)} has no active game monitor right now.`);
  }

  if (command === 'status') {
    const state = await readState(env);
    const cached = readCachedSnapshotFromState(state, adapter);

    if (cached) {
      return interactionResponse('', [buildStatusEmbed({ env, adapter, mode: 'online', snapshot: cached })]);
    }

    if (state.gameProvider === adapter.id && state.failureCount > 0) {
      return interactionResponse('', [buildStatusEmbed({ env, adapter, mode: 'offline', state })]);
    }

    return interactionResponse(`${serverName(env)} is waiting for its first scheduled check.`);
  }

  if (command === 'players') {
    const state = await readState(env);
    const cached = readCachedSnapshotFromState(state, adapter);

    if (cached) {
      return interactionResponse(
        `${formatPlayersResponse(env, adapter, cached)} Last check: ${formatDiscordTimestamp(cached.fetchedAt)}.`
      );
    }

    return interactionResponse(`${serverName(env)} is waiting for its first scheduled check.`);
  }

  return interactionResponse(`Unknown command.`);
}

async function runMonitor(env) {
  const adapter = getGameAdapter(env);
  if (!adapter) {
    return;
  }

  const state = await readState(env);

  try {
    const snapshot = await adapter.fetchSnapshot(env);
    await handleOnlineSnapshot(env, adapter, state, snapshot);
  } catch (error) {
    await handlePollFailure(env, adapter, state, error);
  }
}

async function handleOnlineSnapshot(env, adapter, state, snapshot) {
  const providerChanged = state.gameProvider && state.gameProvider !== adapter.id;
  const recovered = !providerChanged && (state.offlineAnnounced || state.failureCount >= offlineFailureThreshold(env));
  const downtimeMs = state.offlineSince ? Date.now() - new Date(state.offlineSince).getTime() : null;

  if (recovered) {
    await sendChannelMessage(
      env,
      renderTemplate(adapter.copy.recovered, {
        server: serverName(env),
        downtime: formatDuration(downtimeMs)
      })
    );
  }

  if (!providerChanged) {
    await sendPlayerDiffs(env, adapter, state, snapshot);
  }

  const nextState = {
    ...state,
    gameProvider: adapter.id,
    gameLabel: adapter.label,
    failureCount: 0,
    offlineSince: null,
    offlineAnnounced: false,
    authFailureAnnounced: false,
    lastSnapshot: serializeSnapshot(adapter, snapshot),
    lastPlayerMap: Object.fromEntries(snapshot.players.map((player) => [player.key, player])),
    updatedAt: new Date().toISOString()
  };

  await updateStatusMessage(env, adapter, nextState, snapshot, { force: recovered || providerChanged });
  await writeState(env, nextState);
}

async function handlePollFailure(env, adapter, state, error) {
  const failureCount = (state.failureCount ?? 0) + 1;
  const offlineSince = state.offlineSince ?? new Date().toISOString();
  const isAuthError = error?.status === 401;
  const nextState = {
    ...state,
    gameProvider: adapter.id,
    gameLabel: adapter.label,
    failureCount,
    offlineSince,
    lastError: summarizeError(error),
    updatedAt: new Date().toISOString()
  };

  if (isAuthError && !state.authFailureAnnounced) {
    nextState.authFailureAnnounced = true;
    await sendChannelMessage(env, renderTemplate(adapter.copy.credentialRejected, { server: serverName(env) }));
  }

  if (!isAuthError && failureCount >= offlineFailureThreshold(env) && !state.offlineAnnounced) {
    nextState.offlineAnnounced = true;
    await sendChannelMessage(
      env,
      renderTemplate(adapter.copy.offline, {
        server: serverName(env),
        lastGood: formatDiscordTimestamp(state.lastSnapshot?.fetchedAt)
      })
    );
  }

  await updateStatusMessage(env, adapter, nextState, null, {
    force: nextState.offlineAnnounced || isAuthError,
    mode: isAuthError ? 'auth_error' : 'offline'
  });
  await writeState(env, nextState);
}

async function sendPlayerDiffs(env, adapter, state, snapshot) {
  if (!state.lastPlayerMap) {
    return;
  }

  const previous = new Map(Object.entries(state.lastPlayerMap));
  const current = new Map(snapshot.players.map((player) => [player.key, player]));
  const joined = [...current.values()].filter((player) => !previous.has(player.key));
  const left = [...previous.values()].filter((player) => !current.has(player.key));

  if (joined.length === 1) {
    await sendChannelMessage(
      env,
      renderTemplate(pick(adapter.joinLines), { player: joined[0].displayName, server: serverName(env) })
    );
  } else if (joined.length > 1) {
    await sendChannelMessage(
      env,
      renderTemplate(adapter.copy.multiJoin, { server: serverName(env), players: formatNames(joined) })
    );
  }

  if (left.length === 1) {
    await sendChannelMessage(
      env,
      renderTemplate(pick(adapter.leaveLines), { player: left[0].displayName, server: serverName(env) })
    );
  } else if (left.length > 1) {
    await sendChannelMessage(
      env,
      renderTemplate(adapter.copy.multiLeave, { server: serverName(env), players: formatNames(left) })
    );
  }

  if (snapshot.players.length === 0 && left.length > 0) {
    await sendChannelMessage(env, renderTemplate(adapter.copy.emptyAfterLeave, { server: serverName(env) }));
  }
}

async function updateStatusMessage(env, adapter, state, snapshot, { force = false, mode = 'online' } = {}) {
  const now = Date.now();
  const signature = snapshot
    ? [
        adapter.id,
        'online',
        snapshot.version,
        snapshot.players.map((player) => player.key).sort().join(',')
      ].join('|')
    : `${adapter.id}|${mode}|${state.failureCount ?? 0}`;

  if (!force && signature === state.lastStatusSignature && now - (state.lastStatusEditAt ?? 0) < statusUpdateMs(env)) {
    return;
  }

  const messageId = state.statusMessageId || env.STATUS_MESSAGE_ID;
  const embed = snapshot
    ? buildStatusEmbed({ env, adapter, mode: 'online', snapshot })
    : buildStatusEmbed({ env, adapter, mode, state });

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

function buildStatusEmbed({ env, adapter, mode, snapshot = null, state = {} }) {
  if (mode === 'online' && snapshot) {
    const playerText =
      snapshot.players.length > 0
        ? snapshot.players.map((player) => player.displayName).join('\n')
        : adapter.copy.empty;
    const capacity = snapshot.maxPlayers
      ? `${snapshot.currentPlayers} / ${snapshot.maxPlayers}`
      : String(snapshot.currentPlayers);

    return {
      title: serverName(env),
      color: ONLINE_COLOR,
      description: adapter.copy.online,
      fields: [
        { name: 'Game', value: adapter.label, inline: true },
        { name: 'Version', value: snapshot.version ?? 'Unknown', inline: true },
        { name: 'Players', value: capacity, inline: true },
        { name: adapter.copy.playersLabel, value: playerText.slice(0, 1024), inline: false },
        { name: 'Last check', value: formatDiscordTimestamp(snapshot.fetchedAt), inline: true }
      ],
      footer: { text: STATUS_FOOTER }
    };
  }

  if (mode === 'auth_error') {
    return {
      title: serverName(env),
      color: UNKNOWN_COLOR,
      description: adapter.copy.authErrorDescription,
      fields: [
        { name: 'Game', value: adapter.label, inline: true },
        { name: 'Last good check', value: formatDiscordTimestamp(state.lastSnapshot?.fetchedAt), inline: true }
      ],
      footer: { text: STATUS_FOOTER }
    };
  }

  return {
    title: serverName(env),
    color: OFFLINE_COLOR,
    description: adapter.copy.offlineDescription,
    fields: [
      { name: 'Game', value: adapter.label, inline: true },
      { name: 'Failed checks', value: String(state.failureCount ?? 0), inline: true },
      { name: 'Last good check', value: formatDiscordTimestamp(state.lastSnapshot?.fetchedAt), inline: true },
      { name: 'Last error', value: formatErrorForDiscord(state.lastError), inline: false }
    ],
    footer: { text: STATUS_FOOTER }
  };
}

function readCachedSnapshotFromState(state, adapter) {
  if (state.gameProvider !== adapter.id || !state.lastSnapshot) {
    return null;
  }

  return deserializeSnapshot(state.lastSnapshot);
}

function serializeSnapshot(adapter, snapshot) {
  return {
    fetchedAt: snapshot.fetchedAt.toISOString(),
    players: snapshot.players,
    info: snapshot.info,
    gameProvider: adapter.id,
    gameLabel: adapter.label,
    version: snapshot.version,
    currentPlayers: snapshot.currentPlayers,
    maxPlayers: snapshot.maxPlayers
  };
}

function deserializeSnapshot(snapshot) {
  return {
    ...snapshot,
    fetchedAt: new Date(snapshot.fetchedAt),
    players: Array.isArray(snapshot.players) ? snapshot.players : [],
    currentPlayers: Number(snapshot.currentPlayers ?? snapshot.players?.length ?? 0),
    maxPlayers: snapshot.maxPlayers ?? null
  };
}

function formatPlayersResponse(env, adapter, snapshot) {
  const names = snapshot.players.map((player) => player.displayName);
  if (names.length > 0) {
    return renderTemplate(adapter.copy.currentPlayers, {
      server: serverName(env),
      players: names.join(', ')
    });
  }

  return renderTemplate(adapter.copy.noPlayers, { server: serverName(env) });
}

function summarizeError(error) {
  return {
    message: String(error?.message ?? 'Unknown error').slice(0, 180),
    status: error?.status ?? null,
    code: error?.code ?? error?.name ?? null,
    at: new Date().toISOString()
  };
}

function formatErrorForDiscord(error) {
  if (!error) {
    return 'Unknown';
  }

  const parts = [error.status ? `HTTP ${error.status}` : null, error.code, error.message]
    .filter(Boolean)
    .join(' - ');
  return parts.slice(0, 1024);
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
  if (!env.STATE) {
    console.warn('STATE KV binding is missing');
    return {};
  }

  return (await env.STATE.get(STATE_KEY, 'json')) ?? {};
}

async function writeState(env, state) {
  if (!env.STATE) {
    console.warn('STATE KV binding is missing; state was not saved');
    return;
  }

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

function renderTemplate(template, values) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, value),
    template
  );
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
