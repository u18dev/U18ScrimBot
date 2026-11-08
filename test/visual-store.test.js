import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database.js';
import { createVisualStore } from '../src/visual-store.js';

test('captain challenge, acceptance, persistence, and replay protection',()=>{
  const store=openDatabase(':memory:');
  try {
    store.registerTeam('g','Alpha','captain-a');
    store.registerTeam('g','Beta','captain-b');
    const visual=createVisualStore(store);
    assert.throws(()=>visual.create('g','Alpha','Beta','BO5','2099-10-01 19:00','', 'random',false),/challenging team captain/);
    const c=visual.create('g','Alpha','Beta','BO5','2099-10-01 19:00','CDL rules','captain-a',false);
    assert.equal(c.status,'pending');
    assert.throws(()=>visual.respond('g',c.id,'accept','captain-a',false),/challenged team captain/);
    const accepted=visual.respond('g',c.id,'accept','captain-b',false);
    assert.equal(accepted.status,'accepted');
    assert.ok(accepted.scrim_id);
    assert.equal(store.getScrim('g',accepted.scrim_id).status,'active');
    assert.throws(()=>visual.respond('g',c.id,'accept','captain-b',false),/already been answered/);
    visual.putMessage('g','control','channel','message');
    assert.equal(visual.getMessage('g','control').message_id,'message');
  } finally {store.db.close();}
});

test('declining challenge does not create active match',()=>{
  const store=openDatabase(':memory:');
  try {
    store.registerTeam('g','Alpha','captain-a');
    store.registerTeam('g','Beta','captain-b');
    const visual=createVisualStore(store);
    const c=visual.create('g','Alpha','Beta','BO3','2099-10-01 19:00','','captain-a',false);
    assert.equal(visual.respond('g',c.id,'decline','captain-b',false).status,'declined');
    assert.equal(visual.get('g',c.id).scrim_id,null);
  } finally {store.db.close();}
});
