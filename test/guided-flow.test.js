import test from 'node:test';
import assert from 'node:assert/strict';
import { sevenPacificDates, validPacificChoice } from '../src/guided-flow.js';

test('date selector uses seven consecutive Pacific calendar dates',()=>{
  const dates=sevenPacificDates(new Date('2026-11-08T20:45:00Z'));
  assert.equal(dates.length,7);
  assert.equal(dates[0].value,'2026-11-08');
  assert.equal(dates[6].value,'2026-11-14');
  assert.equal(validPacificChoice('2026-11-14',dates),true);
  assert.equal(validPacificChoice('2026-11-15',dates),false);
});

test('Pacific day remains correct near UTC midnight and daylight-saving changes',()=>{
  const dates=sevenPacificDates(new Date('2026-07-02T01:00:00Z'));
  assert.equal(dates[0].value,'2026-07-01');
});
