import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openDatabase } from '../src/database.js';
import { createVisualStore } from '../src/visual-store.js';
import { signRequest, buildOutboundPayload, createScrimCenterClient } from '../src/integration.js';

test('signature covers timestamp, method, path and body', () => {
  const sig = signRequest('s3cret', '1794752000', 'POST', '/scrim-events', '{"a":1}');
  assert.equal(sig, 'sha256=' + createHmac('sha256', 's3cret').update('1794752000.POST./scrim-events.{"a":1}').digest('hex'));
  assert.notEqual(sig, signRequest('s3cret', '1794752000', 'POST', '/scrim-events', '{"a":2}'));
  assert.notEqual(sig, signRequest('s3cret', '1794752001', 'POST', '/scrim-events', '{"a":1}'));
  assert.notEqual(signRequest('s3cret', '1', 'GET', '/standings'), signRequest('s3cret', '1', 'POST', '/standings'));
});

test('outbound payload is v2, carries challenge format/time and drops evidence', () => {
  const store = openDatabase(':memory:');
  try {
    const visual = createVisualStore(store);
    store.registerTeam('123456789012345678', 'Alpha', 'cap-a');
    store.registerTeam('123456789012345678', 'Bravo', 'cap-b');
    const future = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) + ' 19:30';
    const c = visual.create('123456789012345678', 'Alpha', 'Bravo', 'BO5', future, '', 'cap-a', false);
    const accepted = visual.respond('123456789012345678', c.id, 'accept', 'cap-b', false);
    store.report('123456789012345678', accepted.scrim_id, 1, 'https://cdn.discordapp.com/x.png', 'cap-a', false);
    const row = store.db.prepare("SELECT payload FROM outbox WHERE event_type='reported'").get();
    const out = JSON.parse(buildOutboundPayload(store.db, row.payload));
    assert.equal(out.version, 2);
    assert.equal(out.event_id, `u18.scrim.reported.${accepted.scrim_id}`);
    assert.equal(out.scrim.format, 'BO5');
    assert.equal(out.scrim.scheduled_pacific, future);
    assert.ok(!('evidence_url' in out.scrim));
  } finally { store.db.close(); }
});

test('client signs requests and falls back to null when standings fail', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ standings: [{ guild_id: 'g1', name: 'Alpha', wins: 2, losses: 0, played: 2 }, { guild_id: 'g2', name: 'Other', wins: 1, losses: 0, played: 1 }] }) };
  };
  const client = createScrimCenterClient({ apiUrl: 'https://example.test/partner-api/', keyId: 'sck_u18_0123456789abcdef', keySecret: 'k', fetchImpl, now: () => 1794752000000 });
  const rows = await client.standings('g1');
  assert.deepEqual(rows.map(r => r.name), ['Alpha']);
  assert.equal(calls[0].url, 'https://example.test/partner-api/standings');
  assert.equal(calls[0].init.headers['x-sc-signature'], signRequest('k', '1794752000', 'GET', '/standings'));
  await client.standings('g1');
  assert.equal(calls.length, 1, 'standings are cached');

  const failing = createScrimCenterClient({ apiUrl: 'https://example.test/x', keyId: 'sck_u18_0123456789abcdef', keySecret: 'k', fetchImpl: async () => ({ ok: false, status: 500 }), logger: { warn() {} } });
  assert.equal(await failing.standings('g1'), null);
  assert.equal(createScrimCenterClient({}).enabled, false);
  assert.throws(() => createScrimCenterClient({ apiUrl: 'http://insecure', keyId: 'sck_u18_0123456789abcdef', keySecret: 'k' }), /HTTPS/);
});
