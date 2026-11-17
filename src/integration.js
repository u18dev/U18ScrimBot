import { createHmac } from 'node:crypto';

/**
 * Scrim Center partner API client.
 *
 * Every request is signed with the key created in the Scrim Center Partner
 * Portal. The secret never leaves this process: Scrim Center recomputes
 *   HMAC-SHA256(secret, `${timestamp}.${METHOD}.${path}.${body}`)
 * and rejects anything older than 5 minutes, unsigned, or from another server.
 */
export function signRequest(secret, timestamp, method, path, body = '') {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${method}.${path}.${body}`).digest('hex');
}

export function createScrimCenterClient({ apiUrl, keyId, keySecret, logger = console, fetchImpl = fetch, now = () => Date.now(), cacheMs = 60_000 } = {}) {
  const enabled = Boolean(apiUrl && keyId && keySecret);
  if (enabled && !/^https:\/\//i.test(apiUrl)) throw new Error('SCRIMCENTER_API_URL must use HTTPS.');
  if (enabled && !/^sck_[a-z0-9]+_[0-9a-f]{16}$/.test(keyId)) throw new Error('SCRIMCENTER_KEY_ID does not look like a Scrim Center key.');
  const base = (apiUrl || '').replace(/\/+$/, '');
  let cache = null;

  async function request(method, path, body = '') {
    const timestamp = String(Math.floor(now() / 1000));
    const headers = {
      'x-sc-key-id': keyId,
      'x-sc-timestamp': timestamp,
      'x-sc-signature': signRequest(keySecret, timestamp, method, path, body)
    };
    if (body) headers['content-type'] = 'application/json';
    return fetchImpl(base + path, { method, headers, body: body || undefined, signal: AbortSignal.timeout(10_000) });
  }

  return {
    enabled,
    sendEvent(rawBody) { return request('POST', '/scrim-events', rawBody); },
    /** Scrim Center rankings for this guild, or null when unavailable (caller falls back to local). */
    async standings(guildId) {
      if (!enabled) return null;
      if (cache && now() - cache.at < cacheMs) return cache.rows.filter(r => r.guild_id === guildId);
      try {
        const res = await request('GET', '/standings');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data?.standings)) throw new Error('unexpected response');
        cache = { at: now(), rows: data.standings };
        return cache.rows.filter(r => r.guild_id === guildId);
      } catch (err) {
        logger.warn(`Scrim Center standings unavailable, using local: ${err.message}`);
        return null;
      }
    }
  };
}

/**
 * Version 2 payload: adds the challenge's format and Pacific start time, and
 * drops evidence_url (Discord CDN links expire and point at minors' screenshots).
 * Built at send time because the challenge row is linked after the scrim's
 * created event is queued.
 */
export function buildOutboundPayload(db, storedPayload) {
  const payload = JSON.parse(storedPayload);
  const scrim = { ...payload.scrim };
  delete scrim.evidence_url;
  let challenge = null;
  const hasChallenges = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='scrim_challenges'").get();
  if (hasChallenges) challenge = db.prepare('SELECT format,start_text FROM scrim_challenges WHERE scrim_id=? AND guild_id=? ORDER BY id DESC LIMIT 1').get(scrim.id, scrim.guild_id);
  scrim.format = challenge?.format ?? null;
  scrim.scheduled_pacific = challenge?.start_text ?? null;
  return JSON.stringify({ ...payload, version: 2, scrim });
}

// 4xx other than timeout/rate-limit means Scrim Center rejected the event itself;
// retrying sooner won't help, so those wait the maximum delay and get logged loudly.
const permanent = status => status >= 400 && status < 500 && status !== 408 && status !== 429;

export function startOutbox(db, client, logger = console) {
  if (!client?.enabled) {
    logger.info('Scrim Center API not configured; events safely queued locally.');
    return () => {};
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const events = db.prepare(`SELECT * FROM outbox WHERE delivered_at IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP ORDER BY id LIMIT 10`).all();
      for (const e of events) {
        let delay = Math.min(3600, 15 * 2 ** Math.min(e.attempt_count, 8));
        try {
          const res = await client.sendEvent(buildOutboundPayload(db, e.payload));
          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            if (permanent(res.status)) {
              delay = 3600;
              logger.error(`Scrim Center rejected event ${e.event_type} #${e.entity_id}: HTTP ${res.status} ${detail.slice(0, 200)}`);
            }
            throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`);
          }
          db.prepare('UPDATE outbox SET delivered_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?').run(e.id);
        } catch (err) {
          db.prepare("UPDATE outbox SET attempt_count=attempt_count+1, last_error=?,next_attempt_at=datetime('now', ? ) WHERE id=?").run(String(err.message).slice(0, 300), `+${delay} seconds`, e.id);
          logger.warn(`Scrim Center event ${e.id} retry queued in ${delay}s: ${err.message}`);
        }
      }
    } finally { running = false; }
  };
  void tick().catch(err => logger.error(err));
  const timer = setInterval(() => void tick().catch(err => logger.error(err)), 15000);
  timer.unref();
  return () => clearInterval(timer);
}
