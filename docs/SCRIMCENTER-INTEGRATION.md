# ScrimCenter integration contract (proposal — pending partner approval)

The U18 bot is the authoritative source for Discord-initiated scrims; ScrimCenter can consume event messages and reconcile by the stable event ID. No live ScrimCenter API or credentials are assumed to exist yet.

## Outbound webhook (optional)
- Configure `SCRIMCENTER_WEBHOOK_URL` (HTTPS) and `SCRIMCENTER_WEBHOOK_SECRET` (shared secret).
- POST JSON with `Content-Type: application/json`.
- `X-U18-Event-ID`: event ID from payload.
- `X-U18-Signature`: `sha256=` + hex HMAC-SHA256 of **raw request body** using shared secret. Validate signature using a constant-time comparison on ScrimCenter's side.
- Events: `scrim.created`, `scrim.reported`, `scrim.confirmed`, `scrim.disputed`, `scrim.cancelled`.
- `event_id`: `u18.scrim.<action>.<scrim_id>`; same logical action delivered at least once. Deduplicate using `event_id`.
- Payload version `1`. Event contains scrim ID, guild ID, both teams, winner ID, state, evidence URL, creation/completion timestamps.
- Only a `scrim.confirmed` should award points; disputes and cancelled matches do not contribute.
- Local outbox retries with capped exponential delay. An event is marked delivered only on successful HTTP 2xx. Note: ScrimCenter availability and API details still need agreement.

## Identity and data boundaries
- IDs are scoped to each Discord guild. Partner must store `(guild_id, team_id)` and `(guild_id, scrim_id)` together, not just integer IDs.
- Team display names can change. Stable internal IDs should anchor mapping to ScrimCenter roster/tournament IDs.
- Treat evidence URLs as potentially sensitive; restrict visibility appropriately and agree retention/deletion policies for minors.
- Do not expose Discord bot credentials or webhook secrets in Git.

## Decisions before production
1. Authentication and event recipient URL, retry semantics, rate limits.
2. ScrimCenter's canonical tournament/team/player IDs and reconciliation API.
3. Official preseason point values, match format/maps, forfeits, ties, and disputes.
4. Who is authoritative for rankings and whether webhook acknowledgements carry a result ID.
5. Privacy and retention practices for youth participation.
