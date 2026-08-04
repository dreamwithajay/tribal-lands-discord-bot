# BerryByte Restart Integration

BerryByte's dashboard documents Start, Stop, and Restart controls, plus scheduled automations. BerryByte appears to use a Pterodactyl-style panel, so the bot supports the Pterodactyl Client API for power actions and schedule execution.

## What `/restart` Can Do

The bot supports two restart modes:

1. Direct panel power restart:

```text
POST /api/client/servers/{server}/power
{"signal":"restart"}
```

2. Execute a BerryByte/Pterodactyl automation schedule:

```text
POST /api/client/servers/{server}/schedules/{schedule}/execute
```

Use schedule mode if you want a nicer restart flow, such as console announcements, save-world, wait, then restart.

## Required Cloudflare Secrets

Add these under the Worker's Production environment:

```text
PTERODACTYL_PANEL_URL
PTERODACTYL_API_KEY
PTERODACTYL_SERVER_ID
DISCORD_ADMIN_ROLE_ID
```

Optional:

```text
PTERODACTYL_RESTART_SCHEDULE_ID
DISCORD_ADMIN_USER_IDS
```

If `PTERODACTYL_RESTART_SCHEDULE_ID` is set, `/restart` executes that schedule. If it is not set, `/restart` sends a direct `restart` power signal.

## Finding Values

`PTERODACTYL_PANEL_URL` is the base BerryByte panel URL, with no trailing slash.

`PTERODACTYL_API_KEY` should be a Client API key from your BerryByte/Pterodactyl account. It usually starts with `ptlc_`.

`PTERODACTYL_SERVER_ID` is the server identifier/short UUID used in the panel URL or API. It is usually an 8-character identifier.

`DISCORD_ADMIN_ROLE_ID` is the Discord role allowed to use `/restart`. Enable Developer Mode in Discord, right-click the role, and copy its ID.

`DISCORD_ADMIN_USER_IDS` is a comma-separated fallback list of Discord user IDs.

## Suggested BerryByte Automation

In the Automations/Schedules tab, create a restart schedule with tasks like:

```text
command: Broadcast Server restart requested from Discord. Restarting soon.
command: save
power: restart
```

If the panel supports task offsets, add a delay between warning players and restarting.

## Safety

Keep `/restart` locked to a private admin role. Do not expose `PTERODACTYL_API_KEY` in GitHub, Discord, or screenshots.
