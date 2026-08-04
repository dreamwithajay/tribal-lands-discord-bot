# The Tribal Lands Discord Bot

Phase 1 Discord companion for The Tribal Lands game server.

It currently monitors the Palworld REST API, keeps one Discord status message updated, sends Tribal Lands-themed join/leave notices, detects outages and recovery, and handles `/status`, `/players`, `/server`, `/help`, and admin-only `/restart`.

## Features

- Persistent status embed edited in place
- Player join and leave notifications
- Offline/crash detection after repeated failed checks
- Recovery notification with approximate downtime
- Slash commands: `/status`, `/players`, `/server`, `/help`, and admin-only `/restart`
- Rotating Signal line in the persistent status panel
- Optional Google Compute presence service for native Discord online/activity status
- Game-provider adapter structure, starting with Palworld
- Polling can be paused without deleting the Discord bot setup
- Cloudflare Workers Free runtime
- No committed secrets
- `keep_vars = true` so GitHub deploys preserve Cloudflare dashboard secrets

## Required Environment Variables

Copy `.env.example` to `.env` for local command registration and set these as Cloudflare Worker secrets:

```bash
DISCORD_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_PUBLIC_KEY=
PALWORLD_HOST=
PALWORLD_PORT=
PALWORLD_USERNAME=
PALWORLD_PASSWORD=
PTERODACTYL_PANEL_URL=
PTERODACTYL_API_KEY=
PTERODACTYL_SERVER_ID=
DISCORD_ADMIN_ROLE_ID=
```

`DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` are needed locally for `npm run register`; the Worker itself does not need them at runtime.

Defaults are already set for:

```bash
GAME_PROVIDER=palworld
POLLING_ENABLED=true
PALWORLD_HOST=135.148.100.61
PALWORLD_PORT=25586
PALWORLD_USERNAME=admin
SERVER_DISPLAY_NAME=The Tribal Lands
STATUS_UPDATE_SECONDS=60
OFFLINE_FAILURE_THRESHOLD=2
```

`STATUS_MESSAGE_ID` is optional. If omitted, the Worker creates one and stores its ID in Worker KV.

For Cloudflare, set `PALWORLD_HOST` in the dashboard to the DNS hostname, not the raw IP, if you created a Namecheap record.

## Switching Games Later

The Discord app, channel, commands, and Cloudflare Worker can stay the same. The game-specific logic lives in `src/games/`.

Current options:

```bash
GAME_PROVIDER=palworld
GAME_PROVIDER=none
```

To temporarily stop automatic Palworld monitoring while keeping slash commands available, set:

```bash
POLLING_ENABLED=false
```

To fully disable game lookups until another provider is added, set:

```bash
GAME_PROVIDER=none
```

When the server changes to another game, add a new adapter in `src/games/`, register it in `src/games/index.js`, then set `GAME_PROVIDER` to that adapter name.

## Join and Leave Notices

The scheduled monitor compares the latest player list to the previous successful check. It sends a message only when players actually join or leave, so the channel should not get spammed every minute.

Because Cloudflare Free cron runs once per minute, notices can be delayed by up to about a minute.

## Discord Presence

Cloudflare Workers cannot keep a Discord gateway connection open, so they cannot update the bot user's native Discord activity text like `Watching 1/8 players`.

Instead, the persistent status panel has a rotating `Signal` line that changes each scheduled check.

For true native Discord online/activity status, run the optional presence service on an always-on VM:

```bash
npm run presence
```

See [docs/deploy-google-compute-presence.md](docs/deploy-google-compute-presence.md).

The presence service rotates online activity lines with player count, game/version, server FPS, and uptime when available. If Palworld cannot be reached, it switches to the configured offline status and shows an offline/signal-lost activity.

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

## BerryByte Restart

The `/restart` command can restart through the BerryByte/Pterodactyl panel API or trigger a configured BerryByte automation schedule. See [docs/berrybyte-panel-api.md](docs/berrybyte-panel-api.md).

## Why Not GitHub Actions?

GitHub Actions is good for builds and deployments, but it is not a real always-on bot host. Scheduled jobs also are not meant for sub-minute monitoring.

See [docs/github-actions-limitations.md](docs/github-actions-limitations.md).
