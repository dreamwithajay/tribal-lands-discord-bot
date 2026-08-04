import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';
import { PalworldApiError, playerKey } from './palworldClient.js';

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

export class TribalLandsBot {
  constructor({ config, palworld }) {
    this.config = config;
    this.palworld = palworld;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
    });

    this.channel = null;
    this.statusMessage = null;
    this.lastSnapshot = null;
    this.lastPlayerMap = null;
    this.failureCount = 0;
    this.offlineSince = null;
    this.offlineAnnounced = false;
    this.authFailureAnnounced = false;
    this.lastStatusEditAt = 0;
    this.lastStatusSignature = '';
  }

  async start() {
    this.client.once('ready', async () => {
      console.log(`Logged in as ${this.client.user.tag}`);
      await this.registerCommands();
      this.channel = await this.client.channels.fetch(this.config.discord.channelId);
      await this.ensureStatusMessage();

      if (this.config.bot.startupNotification) {
        await this.channel.send(`${this.config.bot.serverName} companion is awake.`);
      }

      await this.pollOnce();
      setInterval(() => {
        this.pollOnce().catch((error) => console.error('Poll failed', error));
      }, this.config.bot.pollIntervalMs);
    });

    this.client.on('interactionCreate', (interaction) => {
      this.handleInteraction(interaction).catch((error) => {
        console.error('Interaction failed', error);
      });
    });

    await this.client.login(this.config.discord.token);
  }

  async registerCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName('status')
        .setDescription(`Show ${this.config.bot.serverName} server status.`),
      new SlashCommandBuilder()
        .setName('players')
        .setDescription(`Show who is currently in ${this.config.bot.serverName}.`)
    ].map((command) => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(this.config.discord.token);
    await rest.put(
      Routes.applicationGuildCommands(this.config.discord.clientId, this.config.discord.guildId),
      { body: commands }
    );
  }

  async ensureStatusMessage() {
    if (this.config.bot.statusMessageId) {
      try {
        this.statusMessage = await this.channel.messages.fetch(this.config.bot.statusMessageId);
        return;
      } catch (error) {
        console.warn('Configured STATUS_MESSAGE_ID could not be fetched; searching channel.', error);
      }
    }

    const recentMessages = await this.channel.messages.fetch({ limit: 50 });
    this.statusMessage = recentMessages.find((message) => {
      const [embed] = message.embeds;
      return message.author.id === this.client.user.id && embed?.footer?.text === STATUS_FOOTER;
    });

    if (!this.statusMessage) {
      this.statusMessage = await this.channel.send({
        embeds: [this.buildStatusEmbed({ mode: 'unknown' })]
      });
      console.log(`Created status message ${this.statusMessage.id}`);
    }
  }

  async pollOnce() {
    try {
      const snapshot = await this.palworld.getSnapshot();
      await this.handleOnlineSnapshot(snapshot);
    } catch (error) {
      await this.handlePollFailure(error);
    }
  }

  async handleOnlineSnapshot(snapshot) {
    const recovered = this.offlineAnnounced || this.failureCount >= this.config.bot.offlineFailureThreshold;
    const downtimeMs = this.offlineSince ? Date.now() - this.offlineSince.getTime() : null;

    this.failureCount = 0;
    this.offlineSince = null;
    this.offlineAnnounced = false;
    this.authFailureAnnounced = false;

    if (recovered) {
      await this.channel.send(
        `${this.config.bot.serverName} has returned. Downtime: ${formatDuration(downtimeMs)}.`
      );
    }

    await this.sendPlayerDiffs(snapshot);
    this.lastSnapshot = snapshot;
    this.lastPlayerMap = toPlayerMap(snapshot.players);
    await this.updateStatusMessage(snapshot, { force: recovered });
  }

  async handlePollFailure(error) {
    this.failureCount += 1;

    if (!this.offlineSince) {
      this.offlineSince = new Date();
    }

    const isAuthError = error instanceof PalworldApiError && error.status === 401;

    if (isAuthError && !this.authFailureAnnounced) {
      this.authFailureAnnounced = true;
      await this.channel.send(
        `${this.config.bot.serverName} REST credentials were rejected. Check the deployment secret for PALWORLD_PASSWORD.`
      );
    }

    if (!isAuthError && this.failureCount >= this.config.bot.offlineFailureThreshold && !this.offlineAnnounced) {
      this.offlineAnnounced = true;
      await this.channel.send(
        `${this.config.bot.serverName} is not answering from the trail. Last good check: ${formatDiscordTimestamp(
          this.lastSnapshot?.fetchedAt
        )}.`
      );
    }

    const mode = isAuthError ? 'auth_error' : 'offline';
    await this.updateStatusMessage(null, { force: this.offlineAnnounced || isAuthError, mode, error });
  }

  async sendPlayerDiffs(snapshot) {
    const currentPlayers = toPlayerMap(snapshot.players);

    if (!this.lastPlayerMap) {
      return;
    }

    const joined = [...currentPlayers.values()].filter((player) => !this.lastPlayerMap.has(player.key));
    const left = [...this.lastPlayerMap.values()].filter((player) => !currentPlayers.has(player.key));

    if (joined.length === 1) {
      await this.channel.send(fillTemplate(pick(JOIN_LINES), joined[0].displayName));
    } else if (joined.length > 1) {
      await this.channel.send(`A party crossed into ${this.config.bot.serverName}: ${formatNames(joined)}.`);
    }

    if (left.length === 1) {
      await this.channel.send(fillTemplate(pick(LEAVE_LINES), left[0].displayName));
    } else if (left.length > 1) {
      await this.channel.send(`A party left ${this.config.bot.serverName}: ${formatNames(left)}.`);
    }

    if (snapshot.players.length === 0 && left.length > 0) {
      await this.channel.send(`Silence falls over ${this.config.bot.serverName}. No survivors remain.`);
    }
  }

  async updateStatusMessage(snapshot, { force = false, mode = 'online', error = null } = {}) {
    const now = Date.now();
    const signature = snapshot
      ? [
          'online',
          snapshot.info?.version,
          snapshot.info?.servername,
          snapshot.players.map((player) => player.key).sort().join(',')
        ].join('|')
      : `${mode}|${this.failureCount}|${error?.status ?? 'network'}`;

    if (!force && signature === this.lastStatusSignature && now - this.lastStatusEditAt < this.config.bot.statusUpdateMs) {
      return;
    }

    const embed = snapshot
      ? this.buildStatusEmbed({ mode: 'online', snapshot })
      : this.buildStatusEmbed({ mode, error });

    this.statusMessage = await this.statusMessage.edit({ embeds: [embed] });
    this.lastStatusSignature = signature;
    this.lastStatusEditAt = now;
  }

  buildStatusEmbed({ mode, snapshot = null, error = null } = {}) {
    if (mode === 'online' && snapshot) {
      const playerText =
        snapshot.players.length > 0
          ? snapshot.players.map((player) => player.displayName).join('\n')
          : 'No survivors currently roam the island.';

      const capacity = snapshot.maxPlayers
        ? `${snapshot.currentPlayers} / ${snapshot.maxPlayers}`
        : String(snapshot.currentPlayers);

      return new EmbedBuilder()
        .setTitle(this.config.bot.serverName)
        .setColor(ONLINE_COLOR)
        .setDescription('Online. The campfires are lit.')
        .addFields(
          { name: 'Version', value: snapshot.info?.version ?? 'Unknown', inline: true },
          { name: 'Players', value: capacity, inline: true },
          { name: 'Survivors', value: playerText.slice(0, 1024), inline: false },
          { name: 'Last check', value: formatDiscordTimestamp(snapshot.fetchedAt), inline: true }
        )
        .setFooter({ text: STATUS_FOOTER });
    }

    if (mode === 'auth_error') {
      return new EmbedBuilder()
        .setTitle(this.config.bot.serverName)
        .setColor(UNKNOWN_COLOR)
        .setDescription('The REST API is reachable, but the bot credentials were rejected.')
        .addFields({ name: 'Last good check', value: formatDiscordTimestamp(this.lastSnapshot?.fetchedAt), inline: true })
        .setFooter({ text: STATUS_FOOTER });
    }

    if (mode === 'offline') {
      return new EmbedBuilder()
        .setTitle(this.config.bot.serverName)
        .setColor(OFFLINE_COLOR)
        .setDescription('Offline. The trail has gone quiet.')
        .addFields(
          { name: 'Failed checks', value: String(this.failureCount), inline: true },
          { name: 'Last good check', value: formatDiscordTimestamp(this.lastSnapshot?.fetchedAt), inline: true }
        )
        .setFooter({ text: STATUS_FOOTER });
    }

    return new EmbedBuilder()
      .setTitle(this.config.bot.serverName)
      .setColor(UNKNOWN_COLOR)
      .setDescription('Waiting for the first server check.')
      .setFooter({ text: STATUS_FOOTER });
  }

  async handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName === 'status') {
      await this.replyWithStatus(interaction);
    }

    if (interaction.commandName === 'players') {
      await this.replyWithPlayers(interaction);
    }
  }

  async replyWithStatus(interaction) {
    try {
      const snapshot = await this.palworld.getSnapshot();
      this.lastSnapshot = snapshot;
      this.lastPlayerMap = toPlayerMap(snapshot.players);
      await interaction.reply({ embeds: [this.buildStatusEmbed({ mode: 'online', snapshot })], ephemeral: true });
    } catch (error) {
      await interaction.reply({
        content: `${this.config.bot.serverName} is not reachable right now.`,
        ephemeral: true
      });
    }
  }

  async replyWithPlayers(interaction) {
    try {
      const snapshot = await this.palworld.getSnapshot();
      const names = snapshot.players.map((player) => player.displayName);
      await interaction.reply({
        content:
          names.length > 0
            ? `Currently in ${this.config.bot.serverName}: ${names.join(', ')}.`
            : `No survivors are currently in ${this.config.bot.serverName}.`,
        ephemeral: true
      });
    } catch {
      await interaction.reply({
        content: `I cannot reach ${this.config.bot.serverName} right now.`,
        ephemeral: true
      });
    }
  }
}

function toPlayerMap(players) {
  return new Map(players.map((player) => [playerKey(player), player]));
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

  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
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
