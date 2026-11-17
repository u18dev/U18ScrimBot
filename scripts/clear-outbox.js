// Run once before connecting to Scrim Center production, so test scrims queued
// during staging are not sent. Usage: npm run outbox:clear -- --yes
import 'dotenv/config';
import Database from 'better-sqlite3';

const file = process.env.DATABASE_PATH || './u18scrim.sqlite';
const db = new Database(file);
const pending = db.prepare('SELECT COUNT(*) count FROM outbox WHERE delivered_at IS NULL').get().count;
if (!process.argv.includes('--yes')) {
  console.log(`${pending} undelivered event(s) in ${file}. Re-run with --yes to mark them as skipped.`);
  process.exit(0);
}
const result = db.prepare("UPDATE outbox SET delivered_at=CURRENT_TIMESTAMP, last_error='skipped before Scrim Center go-live' WHERE delivered_at IS NULL").run();
console.log(`Skipped ${result.changes} queued event(s). New scrims will be sent normally.`);
