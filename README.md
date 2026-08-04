# The Tribal Lands Discord Bot

Phase 1 Discord companion for a BerryByte Palworld server.

It monitors the Palworld REST API at `135.148.100.61:25586`, keeps one Discord status message updated, sends Tribal Lands-themed join/leave notices, detects outages and recovery, and handles `/status` plus `/players`.

## Features

- Persistent status embed edited in place
- Player join and leave notifications
- Offline/crash detection after repeated failed checks
- Recovery notification with approximate downtime
- Slash commands: `/status` and `/players`
- Cloudflare Workers Free runtime
- No committed secrets

## Required Environment Variables

Copy `.env.example` to `.env` for local command registration and set these as Cloudflare Worker secrets:

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_CHANNEL_ID=
DISCORD_PUBLIC_KEY=
PALWORLD_PASSWORD=
```

Defaults are already set for:

```bash
PALWORLD_HOST=135.148.100.61
PALWORLD_PORT=25586
PALWORLD_USERNAME=admin
SERVER_DISPLAY_NAME=The Tribal Lands
STATUS_UPDATE_SECONDS=60
OFFLINE_FAILURE_THRESHOLD=2
```

`STATUS_MESSAGE_ID` is optional. If omitted, the Worker creates one and stores its ID in Worker KV.

## Discord Setup

1. Open the Discord Developer Portal and create an application.
2. Add a bot user and copy the bot token into `DISCORD_TOKEN`.
3. Copy the application ID into `DISCORD_CLIENT_ID`.
4. Copy the public key into `DISCORD_PUBLIC_KEY`.
5. In Discord, enable Developer Mode, then copy your Discord server ID into `DISCORD_GUILD_ID`.
6. Copy the target channel ID into `DISCORD_CHANNEL_ID`.
7. Invite the bot with the `bot` and `applications.commands` scopes.
8. Give the bot these channel permissions: View Channel, Send Messages, Embed Links, and Read Message History.
9. Set the Discord Interactions Endpoint URL to the deployed Cloudflare Worker URL.

## Deploy

Use Cloudflare Workers Free. See [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md).

## Register Commands

```bash
npm run register
```

## Why Not GitHub Actions?

GitHub Actions is good for builds and deployments, but it is not a real always-on bot host. Scheduled jobs also are not meant for sub-minute monitoring.

See [docs/github-actions-limitations.md](docs/github-actions-limitations.md).
