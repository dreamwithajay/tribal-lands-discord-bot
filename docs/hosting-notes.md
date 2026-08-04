# Hosting Notes

This bot needs a place to run without the user's PC staying on.

## Recommended

Cloudflare Workers Free:

- Runs without a home PC or paid VM.
- Handles Discord slash commands through an Interactions Endpoint URL.
- Uses a cron trigger to check Palworld once per minute.
- Stores bot state in Worker KV.
- Keeps Discord setup separate from game-specific adapters.

## Tradeoff

Cloudflare cron triggers run at minute-level granularity, so join/leave notifications are not 10-second real-time. For a free setup, this is a better fit than trying to keep a GitHub Actions job alive.

## Not Recommended as the Primary Runtime

- Scheduled workflows are not designed for 10-second monitoring.
- Long-running workflow jobs are temporary.
- Private repositories have a monthly free-minutes quota.
- GitHub should host the code, not the live bot process.

Render Free Web Service:

- Free web services can spin down after idle periods.
- Spin-down breaks continuous monitoring.

Koyeb Free Web Service:

- Free instances can scale to zero after idle periods.
- Workers are not available on the free instance type.

Railway Free:

- Useful for trials and small apps, but the free tier is credit-limited.
- Treat it as a convenience option, not guaranteed always-on free hosting.
