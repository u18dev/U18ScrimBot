# Scrim Center integration

Scrim Center is the source of truth for U18 rankings. The bot sends scrim results to Scrim Center and reads the rankings back for `/leaderboard` and the leaderboard panel. The bot only makes outbound HTTPS calls; it never exposes a URL.

## Setup

1. A Scrim Center admin links the U18 partner to the U18 Discord server ID and sets Dash as its owner.
2. Dash opens **Scrim Center → Partner Portal**, creates an API key, and copies the three values shown (the secret is shown once):
   ```
   SCRIMCENTER_API_URL=https://czfxlzaewgpqaqhmxbse.supabase.co/functions/v1/partner-api
   SCRIMCENTER_KEY_ID=sck_u18_...
   SCRIMCENTER_KEY_SECRET=...
   ```
3. Before the first production connection, skip test events left in the queue: `npm run outbox:clear -- --yes`.
4. Put the three values in Railway variables (never in Git or Discord) and redeploy.
5. New U18 teams appear in Scrim Center as **pending**. Approve them in the Partner Portal; only approved teams show in the rankings and the Match Hub U18 tab.

To rotate: create a second key, swap the Railway variables, redeploy, then revoke the old key. Two keys can be active at once.

## Request signing

| Header | Value |
| --- | --- |
| `X-SC-Key-Id` | key ID from the portal |
| `X-SC-Timestamp` | Unix seconds; rejected if more than 5 minutes off |
| `X-SC-Signature` | `sha256=` + hex HMAC-SHA256(secret, `${timestamp}.${METHOD}.${path}.${rawBody}`) |

`path` is `/scrim-events` or `/standings`. The GET body is empty.

## Endpoints

- `POST /scrim-events`: one outbox event. Scrim Center checks the signature, that the event's `guild_id` is the linked U18 server, and the payload shape, then stores it once per `event_id`. Late or repeated events never move a scrim backwards. Only `confirmed` scrims count. Win/loss only.
- `GET /standings`: `{ partner, generated_at, standings: [{ rank, team_id, guild_id, name, played, wins, losses }] }` with approved teams only. The bot caches it for 60 seconds and falls back to local results if Scrim Center is unreachable.

## Payload (version 2)

```json
{
  "event_id": "u18.scrim.confirmed.42",
  "event_type": "scrim.confirmed",
  "version": 2,
  "scrim": {
    "id": 42, "guild_id": "123456789012345678",
    "home_team": { "id": 3, "name": "Alpha" }, "away_team": { "id": 7, "name": "Bravo" },
    "winner_team_id": 3, "status": "confirmed",
    "format": "BO3", "scheduled_pacific": "2026-11-20 19:00",
    "created_at": "2026-11-15 18:00:00", "finished_at": "2026-11-15 20:10:00"
  }
}
```

Screenshot links are not sent: Discord CDN links expire and the screenshots belong to minors' accounts.

## Responses

- `200`: stored (`result`: `applied`, `duplicate` or `stale`), marked delivered.
- `401`: bad or revoked key, bad signature, or clock skew. Check Railway variables and the server clock.
- `403`: the event is from a Discord server not linked to the key, or the partner has no server set.
- `422`: the payload failed validation (logged as an error and retried hourly).
- `429` / `5xx`: retried with backoff.
