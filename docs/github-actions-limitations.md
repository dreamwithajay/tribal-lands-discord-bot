# Why Not GitHub Actions for the Live Bot?

GitHub Actions is free in useful ways, but it is not a true always-on bot host.

Important limits:

- GitHub-hosted jobs are temporary.
- Scheduled workflows are not meant for sub-minute monitoring.
- Private repositories have a monthly free-minutes quota.
- A Discord gateway bot needs a continuous connection, which Actions is not designed to provide.

You could run a limited GitHub Actions monitor every few minutes, but it would not provide instant slash command responses and would be less reliable for join/leave notifications.

For this project, GitHub should store the code. Cloudflare Workers Free should run the bot.
