import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database.js';
import { createRoster } from '../src/roster.js';

test('captain membership is backfilled and team invitations require acceptance',()=>{
 const store=openDatabase(':memory:');
 try{
  const alpha=store.registerTeam('guild','Alpha','captain');
  store.registerTeam('guild','Beta','other-captain');
  const roster=createRoster(store);
  assert.equal(roster.mine('guild','captain').name,'Alpha');
  assert.throws(()=>roster.invite('guild',alpha.id,'stranger','player'),/Only the registered captain/);
  const invitation=roster.invite('guild',alpha.id,'captain','player');
  assert.equal(roster.mine('guild','player'),null);
  assert.throws(()=>roster.respond('guild',invitation.id,'stranger','accepted'),/not addressed/);
  roster.respond('guild',invitation.id,'player','accepted');
  assert.equal(roster.mine('guild','player').name,'Alpha');
  assert.throws(()=>roster.invite('guild',alpha.id,'captain','player'),/already belongs/);
  assert.throws(()=>roster.leave('guild','captain'),/Captains cannot leave/);
  const old=roster.leave('guild','player');
  assert.equal(old.name,'Alpha');
  assert.equal(roster.mine('guild','player'),null);
 }finally{store.db.close();}
});

test('captain transfers captaincy to joined player before leaving',()=>{
 const store=openDatabase(':memory:');
 try {
  const alpha=store.registerTeam('g','Alpha','old');
  const roster=createRoster(store);
  const inv=roster.invite('g',alpha.id,'old','new');
  roster.respond('g',inv.id,'new','accepted');
  assert.throws(()=>roster.transfer('g','old','outsider'),/Choose another member/);
  roster.transfer('g','old','new');
  assert.equal(roster.mine('g','new').captain_id,'new');
  assert.equal(roster.leave('g','old').name,'Alpha');
 }finally{store.db.close();}
});
