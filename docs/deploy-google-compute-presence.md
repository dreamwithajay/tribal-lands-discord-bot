# Google Compute Presence Service

Use this when you want the Discord bot user to show online and rotate native Discord activity text.

Cloudflare Workers should keep handling slash commands, status messages, and scheduled notifications. This VM process only keeps the Discord Gateway connection open for presence.

## Free-Tier Shape

Google Cloud's Always Free Compute Engine allowance includes one `e2-micro` VM worth of monthly hours, enough for one VM to run continuously for the month. Keep the machine tiny and avoid extra paid resources.

Recommended VM:

- Machine type: `e2-micro`
- OS: Ubuntu LTS
- Disk: standard persistent disk, 10 GB
- Region: one of Google's Always Free eligible US regions
- External IP: ephemeral is fine for SSH setup

Set a budget alert in Google Cloud Billing before leaving anything running.

## Create the VM

In Google Cloud Console:

1. Go to Compute Engine.
2. Create a VM instance.
3. Choose `e2-micro`.
4. Use Ubuntu LTS.
5. Use a standard persistent disk.
6. Allow SSH.
7. Do not add load balancers, GPUs, static IP reservations, or extra disks.

## Install Node and Clone the Repo

SSH into the VM:

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
git clone https://github.com/dreamwithajay/tribal-lands-discord-bot.git
cd tribal-lands-discord-bot
npm install --omit=dev
```

## Add Environment Variables

Create `.env` on the VM:

```bash
nano .env
```

Add:

```bash
DISCORD_TOKEN=
GAME_PROVIDER=palworld
PALWORLD_HOST=
PALWORLD_PORT=25586
PALWORLD_USERNAME=admin
PALWORLD_PASSWORD=
SERVER_DISPLAY_NAME=The Tribal Lands
PRESENCE_UPDATE_SECONDS=60
DISCORD_PRESENCE_STATUS=online
DISCORD_OFFLINE_PRESENCE_STATUS=idle
```

Use your Namecheap hostname for `PALWORLD_HOST`, not `http://` and not `:25586`.

## Run It With systemd

Create a service:

```bash
sudo nano /etc/systemd/system/tribal-lands-presence.service
```

Paste:

```ini
[Unit]
Description=Tribal Lands Discord presence service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/YOUR_LINUX_USER/tribal-lands-discord-bot
ExecStart=/usr/bin/npm run presence
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Replace `YOUR_LINUX_USER` with your VM username.

Start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tribal-lands-presence
sudo systemctl status tribal-lands-presence
```

View logs:

```bash
journalctl -u tribal-lands-presence -f
```

## Update Later

```bash
cd ~/tribal-lands-discord-bot
git pull
npm install --omit=dev
sudo systemctl restart tribal-lands-presence
```
