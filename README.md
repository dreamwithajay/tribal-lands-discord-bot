# The Tribal Lands Discord Bot

Phase 1 Discord companion for a BerryByte Palworld server.

It monitors the Palworld REST API at `135.148.100.61:25586`, keeps one Discord status message updated, sends Tribal Lands-themed join/leave notices, detects outages and recovery, and registers `/status` plus `/players`.

## Features

- Persistent status embed edited in place
- Player join and leave notifications
- Offline/crash detection after repeated failed checks
- Recovery notification with approximate downtime
- Guild slash commands: `/status` and `/players`
- No committed secrets

## Required Environment Variables

Copy `.env.example` to `.env` locally or set these in your deployment host:

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_CHANNEL_ID=
PALWORLD_PASSWORD=
```

Defaults are already set for:

```bash
PALWORLD_HOST=135.148.100.61
PALWORLD_PORT=25586
PALWORLD_USERNAME=admin
SERVER_DISPLAY_NAME=The Tribal Lands
POLL_INTERVAL_SECONDS=10
STATUS_UPDATE_SECONDS=30
OFFLINE_FAILURE_THRESHOLD=3
```

`STATUS_MESSAGE_ID` is optional. If omitted, the bot looks for its previous status embed in the latest channel messages and creates one only when needed.

## Discord Setup

1. Open the Discord Developer Portal and create an application.
2. Add a bot user and copy the bot token into `DISCORD_TOKEN`.
3. Copy the application ID into `DISCORD_CLIENT_ID`.
4. In Discord, enable Developer Mode, then copy your Discord server ID into `DISCORD_GUILD_ID`.
5. Copy the target channel ID into `DISCORD_CHANNEL_ID`.
6. Invite the bot with the `bot` and `applications.commands` scopes.
7. Give the bot these channel permissions: View Channel, Send Messages, Embed Links, and Read Message History.

## Run Locally

```bash
npm install
npm start
```

## Run With Docker

```bash
docker compose up -d --build
docker compose logs -f
```

## Deployment Recommendation

For a Discord bot that checks every 10 seconds, use a real always-on process. GitHub Actions scheduled jobs are not suitable for sub-minute continuous monitoring.

The best free always-on fit is currently an Oracle Cloud Always Free VM running Docker. See [docs/deploy-oracle-cloud.md](docs/deploy-oracle-cloud.md).

Render and Koyeb free web services can scale down when idle, and Railway's free plan is credit-limited, so they are not the primary recommendation for this bot.
