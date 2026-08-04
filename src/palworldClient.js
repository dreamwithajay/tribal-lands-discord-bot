export class PalworldApiError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'PalworldApiError';
    this.status = status;
    this.cause = cause;
  }
}

export class PalworldClient {
  constructor({ host, port, username, password, timeoutMs }) {
    this.baseUrl = `http://${host}:${port}/v1/api`;
    this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    this.timeoutMs = timeoutMs;
  }

  async getSnapshot() {
    const [info, players, metrics, settings] = await Promise.all([
      this.getRequired('/info'),
      this.getRequired('/players'),
      this.getOptional('/metrics'),
      this.getOptional('/settings')
    ]);

    const playerList = normalizePlayers(players);
    const maxPlayers = findFirstNumber([
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
      metrics: metrics ?? null,
      settings: settings ?? null,
      currentPlayers: playerList.length,
      maxPlayers
    };
  }

  async getRequired(path) {
    return this.request(path);
  }

  async getOptional(path) {
    try {
      return await this.request(path);
    } catch {
      return null;
    }
  }

  async request(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Accept: 'application/json',
          Authorization: this.authHeader
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new PalworldApiError(`Palworld REST returned HTTP ${response.status}`, {
          status: response.status
        });
      }

      return response.json();
    } catch (error) {
      if (error instanceof PalworldApiError) {
        throw error;
      }

      throw new PalworldApiError('Palworld REST request failed', { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function playerKey(player) {
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

export function playerName(player) {
  return String(
    player.name ??
      player.playerName ??
      player.accountName ??
      player.nickname ??
      playerKey(player)
  );
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

function findFirstNumber(values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}
