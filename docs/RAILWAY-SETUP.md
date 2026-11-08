# Deploy U18ScrimBot to Railway (initial staging)

## Before deploying
1. Create a Discord application in the [Discord Developer Portal](https://discord.com/developers/applications). Enable a bot under the application.
2. Under **Bot**, reset/copy the token and keep it private. Under **General Information**, copy the application ID.
3. Turn on Discord Developer Mode and copy the target **server** ID.
4. Use a dedicated staging Discord server for the first tests; do not enable ScrimCenter production integration.

## Railway service
- Connect GitHub repo `u18dev/U18ScrimBot`, branch `main` after the PR is merged.
- Set **Start Command** to `npm start` (also supplied in `railway.json`).
- This is a long-running Discord worker, **not an HTTP server**. Do not add an HTTP health check or public domain.
- Use **one replica only** while using SQLite and registering guild commands on startup.
- Make a Railway Volume for the bot service with mount path **`/data`**. Configure `DATABASE_PATH=/data/u18scrim.sqlite`. Set up volume backups. **Without a volume the bot will lose teams and results on redeployment.**
- In **Variables**, configure:
  - `DISCORD_TOKEN` = Bot token from Developer Portal (secret)
  - `DISCORD_CLIENT_ID` = Discord application ID
  - `DISCORD_GUILD_ID` = Staging Discord server ID
  - `DATABASE_PATH=/data/u18scrim.sqlite`
  - `WIN_POINTS=3` and `LOSS_POINTS=0` (provisional only)
  - Optional `RESULTS_CHANNEL_ID` = text channel ID for confirmed results
- Leave `SCRIMCENTER_WEBHOOK_URL` and `SCRIMCENTER_WEBHOOK_SECRET` **unset** until ScrimCenter accepts and secures the webhook contract.
- Ensure deployment logs print `U18 ScrimBot online as ...`. If a deployment fails, examine **Deploy Logs** rather than assuming the bot is live.

## Invite the bot
In Discord Developer Portal > OAuth2 > URL Generator, select `bot` and `applications.commands` scopes and grant View Channels, Send Messages, Embed Links, and Attach Files in your testing channels. Open the generated invite URL and choose the staging server.

## Test sequence
1. `/team register` twice from two Discord users (captains).
2. `/scrim start` with the two registered teams.
3. `/scrim report` from one captain, attaching a scoreboard image.
4. Click **Confirm Result** as the *other* captain. Confirming the captain's own report must fail.
5. Check `/leaderboard` for exactly one counted win.
6. Test a second scrim's **Dispute Result** button and admin `/scrim resolve`.
7. Redeploy once and confirm the saved results and teams remain present (volume persistence check).
8. Only after approval, configure ScrimCenter delivery and inspect retry behavior with partner engineers.

## Production hardening still required
- Team and roster validation against U18's registration system; currently any server member can claim a team name.
- Discord user permissions and staff roles, anti-spam, map/mode rules, preseason scoring approval.
- Backup/restore rehearsal, observability and recovery instructions.
- ScrimCenter authentication, privacy retention agreement and bidirectional ID mapping.
- Run automated tests and staging integration checks before moving to production.
