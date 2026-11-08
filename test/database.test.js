import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database.js';

test('scrim report requires opponent confirmation and results appear in leaderboard',()=>{
  const s=openDatabase(':memory:');
  try {
    const a=s.registerTeam('guild','Alpha','captain-a');
    const b=s.registerTeam('guild','Beta','captain-b');
    const match=s.startScrim('guild','Alpha','Beta','captain-a',false);
    assert.equal(match.status,'active');
    const reported=s.report('guild',match.id,a.id,'https://example.com/evidence.png','captain-a',false);
    assert.equal(reported.status,'pending');
    assert.equal(s.standings('guild')[0].points,0);
    assert.throws(()=>s.confirm('guild',match.id,'captain-a',false),/different participating captain/);
    assert.equal(s.confirm('guild',match.id,'captain-b',false).status,'confirmed');
    assert.equal(s.standings('guild')[0].name,'Alpha');
    assert.equal(s.standings('guild')[0].points,3);
    const events=s.db.prepare('SELECT COUNT(*) count FROM outbox WHERE entity_id=?').get(match.id).count;
    assert.equal(events,3);
    assert.equal(b.name,'Beta');
  } finally {s.db.close();}
});

test('dispute freezes standings until staff resolves it',()=>{
  const s=openDatabase(':memory:');
  try {
    const a=s.registerTeam('guild','Alpha','captain-a');
    const b=s.registerTeam('guild','Beta','captain-b');
    const match=s.startScrim('guild','Alpha','Beta','captain-a',false);
    s.report('guild',match.id,b.id,'https://example.com/evidence.png','captain-a',false);
    s.dispute('guild',match.id,'captain-b',false);
    assert.equal(s.standings('guild').every(row=>row.points===0),true);
    assert.throws(()=>s.resolve('guild',match.id,a.id,'captain-a',false),/Only league admins/);
    s.resolve('guild',match.id,b.id,'staff',true);
    assert.equal(s.standings('guild')[0].name,'Beta');
  } finally {s.db.close();}
});
