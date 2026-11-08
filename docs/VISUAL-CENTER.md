# U18 Scrim Center — Interactive Discord launch guide

## What is implemented in v0.3
- **/scrimcenter** (server manager): posts a persistent control center in the current text channel; invoking it again in the same channel refreshes the existing panel.
- **Challenge Team** button: opens a Discord modal with captain's registered team, opponent, match format (BO3/BO5), requested Pacific date/time, and notes.
- **Challenge announcement**: posts in `CHALLENGES_CHANNEL_ID` (if configured), or the invoking channel. Mentions the opposing captain.
- **Accept / Decline**: the opposing captain (or server manager) can respond. Acceptance creates a normal active scrim in the existing match database.
- **My Matches**: shows recent invitations for your captain account; **Standings**: current team standings.
- **/leaderboardpanel** (server manager): posts a persistent leaderboard and refreshes that message after reported results are confirmed via command or button.
- Existing **/scrim report** remains required to submit image evidence; its Confirm/Dispute buttons remain usable after restart.

## Railway configuration (optional)
- `CHALLENGES_CHANNEL_ID`: Discord text channel for public challenge cards.
- `MATCHES_CHANNEL_ID`: Discord text channel for accepted challenge announcements.
- `RESULTS_CHANNEL_ID`: Existing completed-results announcements.

Channels must be in the same guild as the bot's `DISCORD_GUILD_ID`. The bot needs View Channels, Send Messages and Embed Links in each channel. For first staging tests, use a dedicated private test channel.

**Do not create a second Railway service or point it to a different DB.** Keep the existing service, volume and `DATABASE_PATH`. SQLite migrations add new tables without deleting existing teams or scrims.

## How to test
1. Register two teams with separate Discord accounts (or use existing test teams).
2. As server manager, run `/scrimcenter` in `#scrim-center` and `/leaderboardpanel` in `#leaderboard`.
3. As Team Alpha captain, click **Challenge Team**. Enter exact registered team names, format `BO5`, and future `YYYY-MM-DD HH:MM` (Pacific).
4. As Team Beta captain, click **Accept**; the challenge card becomes accepted and a scrim ID is issued.
5. Report winner and screenshot via `/scrim report`. Have the other captain confirm.
6. Confirm the leaderboard panel refreshes. Redeploy and verify older buttons and saved panels still work.
7. Test declining a second invitation and an unauthorized user's accept attempt.

## Limitations (not yet implemented)
- The Discord modal has five **text fields**. These are not visual team dropdowns. Team names must match the registry; future dashboard work will introduce searchable team selection.
- Accepting creates an active scrim immediately; this is an invitation flow, **not yet a scheduled job/reminder system**.
- No web dashboard or Discord Activity has been deployed. That will be built as a separate authenticated frontend with a shared database.
- No DM fallback if channel posting fails; failure is reported to the creator.
- Registered team ownership is still self-claimed; do not enable public competitive registration until U18 identity verification exists.
- No ScrimCenter live sync is active. See `docs/SCRIMCENTER-INTEGRATION.md`.

## Next milestone
- Team selectors and richer Discord Components
- Calendar scheduling with timezone-safe reminders and notifications
- Scrim queue and captain readiness checks
- Authenticated browser/Discord Activity dashboard (requires shared PostgreSQL, OAuth2 and permissions)
- ScrimCenter outbound event coverage for challenges and ID reconciliation
