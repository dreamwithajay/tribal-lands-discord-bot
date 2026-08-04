# Hosting Notes

This bot needs a continuously running process because it monitors Palworld every few seconds and keeps a live Discord gateway connection.

## Recommended

Oracle Cloud Always Free VM:

- Actually runs a long-lived process.
- No need for the user's PC to stay on.
- Docker Compose keeps deployment simple.
- The VM does not need any public HTTP port for the bot.

## Not Recommended as the Primary Free Path

GitHub Actions:

- Scheduled workflows are not designed for 10-second monitoring.
- They cannot hold a continuous Discord gateway connection as a bot runtime.

Render Free Web Service:

- Free web services can spin down after idle periods.
- Spin-down breaks continuous Discord monitoring.

Koyeb Free Web Service:

- Free instances can scale to zero after idle periods.
- Workers are not available on the free instance type.

Railway Free:

- Useful for trials and small apps, but the free tier is credit-limited.
- Treat it as a convenience option, not guaranteed always-on free hosting.
