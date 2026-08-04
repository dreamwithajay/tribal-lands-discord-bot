# Deploy on Oracle Cloud Always Free

This is the recommended free always-on path for the bot. The bot does not need a public web port; it only needs outbound internet access to Discord and the Palworld REST API.

## 1. Create the VM

1. Create an Oracle Cloud account.
2. Create an Always Free Ubuntu VM in your home region.
3. Prefer `VM.Standard.A1.Flex` with 1 OCPU and 1 GB RAM if available.
4. Add your SSH public key.
5. Keep inbound networking minimal. SSH is enough for setup.

## 2. Install Docker

SSH into the VM, then run:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## 3. Clone the GitHub Repo

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/tribal-lands-discord-bot.git
cd tribal-lands-discord-bot
```

## 4. Add Secrets on the VM

Create `.env` on the VM:

```bash
cp .env.example .env
nano .env
```

Fill in:

```bash
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_CHANNEL_ID=
PALWORLD_PASSWORD=
```

Do not commit `.env`.

## 5. Start the Bot

```bash
docker compose up -d --build
docker compose logs -f
```

The bot will create or reuse the persistent status message, register `/status` and `/players`, and begin polling.

## 6. Update Later

```bash
git pull
docker compose up -d --build
```

## Notes

- If Oracle reports no Always Free capacity, try another availability domain in the same home region or retry later.
- The bot stores no important local data. On restart, it searches recent channel messages for the previous status embed.
- If it creates a new status message after a long outage, copy that message ID into `STATUS_MESSAGE_ID` to pin it exactly.
