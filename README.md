# U18 ScrimBot 🏆

An independently developed Discord bot for the **U18 CDL Pre-Season Scrims League**, designed to make practice competitive, organized and fun. Uses Discord slash commands, team captain approvals, verified results, league standings, and an eventual ScrimCenter partner integration.

**Status: v0.1 developer foundation. Not yet deployed to Discord or connected to ScrimCenter.**

## Reference and provenance
Inspired by the feature overview of [Probler-Yt/ScrimBot](https://github.com/Probler-Yt/ScrimBot), whose public repo is a showcase only: the original source is private and has no public license. This is a **new, original implementation**, not a fork or copied code.

## Team-linked visual challenge wizard (v0.3.1)

Captain accounts are automatically linked to their team on Discord. The **My Team** button provides invite / join / leave / captain transfer actions. The **Challenge Team** button now opens an interactive guided selection of opponent (registered teams only), the next seven Pacific dates, time, and BO3/BO5 instead of typed team/date/format fields. See [Roster and challenge guide](docs/ROSTER-AND-CHALLENGES.md).

## Interactive Scrim Center (v0.3)

**One command for the control panel:** `/scrimcenter` (server manager). Members then click **Challenge Team**, **My Matches**, and **Standings**. Challenge Team opens a Discord form; the opposing captain accepts or declines on the posted card. Use `/leaderboardpanel` (server manager) to post the refreshable league leaderboard. Read [visual center setup and limitations](docs/VISUAL-CENTER.md).

## Railway deployment

See [Railway staging setup](docs/RAILWAY-SETUP.md). You **must** attach a persistent volume mounted at `/data` and configure `DATABASE_PATH=/data/u18scrim.sqlite`; deploy as a single-instance background worker. The report command now posts Confirm Result / Dispute Result buttons for captains.

## Quick start

1. Install Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env`, setting a Discord bot token, application client ID and test guild ID. Never commit secrets.
3. Invite your bot to the test server with `bot` and `applications.commands` scopes; it needs permissions to view/send messages and embed links.
4. Run `npm test`, then `npm start`.
5. Slash commands register to the specified Discord guild on startup.

## Commands

| Command | Use |
| --- | --- |
| `/team register name:<team>` | Create a team; author becomes captain |
| `/team list` | Show team registry |
| `/scrim start home:<team> away:<team>` | Create match (captain/admin) |
| `/scrim report id:<id> winner:<team> evidence:<image>` | Upload screenshot and propose winner |
| `/scrim confirm id:<id>` | Other captain or admin approves final result |
| `/scrim dispute id:<id>` | Request staff review |
| `/scrim resolve id:<id> winner:<team>` | Admin finalizes a disputed result |
| `/scrim cancel id:<id>` | Creator/admin cancels an unresolved match |
| `/scrim lookup id:<id>` | See match status and proof |
| `/leaderboard` | Team standings from confirmed results |

**Important:** a captain cannot self-confirm their own report, and matches awaiting confirmation/disputes are excluded from standings. Only users with Discord's Manage Server permission can exercise admin overrides.

## MVP assumptions

- League scoring is **provisional**: 3 points for a win, 0 for a loss (configurable `WIN_POINTS`, `LOSS_POINTS`). Final U18 / ScrimCenter placement rules are undecided.
- One unresolved match per team prevents duplicate/overlapping active scrims.
- Registrations currently rely on a Discord identity; no external U18 CDL identity verification, guardian consent, or roster sync yet.
- All records are in local SQLite; provide persistent storage/backups in deployment. Do not deploy SQLite onto ephemeral storage.
- ScrimCenter delivery is **not enabled** unless you configure its endpoint/secret. Events are saved in an outbox even without connection.
- Future phases: team invitations/verification, match scheduling, maps/modes, seasonal resets, role rewards, audit trail, staff dashboard, full ScrimCenter bidirectional reconciliation.

See [the proposed integration contract](docs/SCRIMCENTER-INTEGRATION.md).
