# Deploy on Cloudflare Workers Free

This is the recommended free deployment path now that Oracle Cloud is off the table.

Cloudflare Workers runs the bot without your PC staying on:

- A cron trigger checks the Palworld server once per minute.
- Discord slash commands use the app's Interactions Endpoint URL.
- Worker KV stores the latest state and persistent status message ID.

## 1. Create a Free Cloudflare Account

Create or log into a Cloudflare account, then install Wrangler locally:

```bash
npm install
npx wrangler login
```

## 2. Create KV State Storage

```bash
npx wrangler kv namespace create STATE
npx wrangler kv namespace create STATE --preview
```

Copy the returned `id` and `preview_id` into `wrangler.toml`.

## 3. Set Worker Secrets

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_GUILD_ID
npx wrangler secret put DISCORD_CHANNEL_ID
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put PALWORLD_PASSWORD
```

These values never go in Git.

## 4. Deploy

```bash
npm run deploy
```

Wrangler will print a Worker URL like:

```text
https://tribal-lands-discord-bot.YOUR_SUBDOMAIN.workers.dev
```

## 5. Configure Discord Slash Commands

In the Discord Developer Portal:

1. Open the application.
2. Go to General Information and copy the Public Key into `DISCORD_PUBLIC_KEY`.
3. Go to Installation and make sure the app can be installed to your Discord server.
4. Go to Bot and copy the token into `DISCORD_TOKEN`.
5. Go to General Information and copy the Application ID into `DISCORD_CLIENT_ID`.
6. Go to Discord, enable Developer Mode, then copy your server ID into `DISCORD_GUILD_ID`.
7. Copy the target channel ID into `DISCORD_CHANNEL_ID`.
8. Set the Interactions Endpoint URL to the Worker URL.

Then register the commands:

```bash
npm run register
```

## Discord Permissions

Invite the app with these scopes:

```text
bot applications.commands
```

Give the bot these channel permissions:

- View Channel
- Send Messages
- Embed Links
- Read Message History

## Monitoring Frequency

Cloudflare's free cron trigger can run every minute. That means join/leave and outage detection are near-real-time, but not 10-second real-time.

For a no-cost setup that does not need your PC or Oracle, this is the cleanest tradeoff.
