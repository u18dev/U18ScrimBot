import { createHmac } from 'node:crypto';

export function startOutbox(db, url, secret, logger = console) {
  if (!url || !secret) {
    logger.info('ScrimCenter webhook not configured; events safely queued locally.');
    return () => {};
  }
  if (!url.startsWith('https://')) throw new Error('ScrimCenter webhook must use HTTPS.');
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const events = db.prepare(`SELECT * FROM outbox WHERE delivered_at IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP ORDER BY id LIMIT 10`).all();
      for (const e of events) {
        try {
          const signature='sha256='+createHmac('sha256',secret).update(e.payload).digest('hex');
          const res=await fetch(url,{method:'POST', headers:{'content-type':'application/json','x-u18-signature':signature,'x-u18-event-id':JSON.parse(e.payload).event_id},body:e.payload,signal:AbortSignal.timeout(10000)});
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          db.prepare('UPDATE outbox SET delivered_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?').run(e.id);
        } catch (err) {
          const delay=Math.min(3600, 15 * 2 ** Math.min(e.attempt_count,8));
          db.prepare("UPDATE outbox SET attempt_count=attempt_count+1, last_error=?,next_attempt_at=datetime('now', ? ) WHERE id=?").run(String(err.message).slice(0,300),`+${delay} seconds`,e.id);
          logger.warn(`ScrimCenter event ${e.id} retry queued: ${err.message}`);
        }
      }
    } finally {running=false;}
  };
  void tick();
  const timer=setInterval(()=>void tick().catch(err=>logger.error(err)),15000);
  timer.unref();
  return ()=>clearInterval(timer);
}
