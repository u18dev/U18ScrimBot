import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePoints, calculateStandings } from '../src/scoring.js';
test('win and loss placement points',()=>{
  assert.deepEqual(calculatePoints(2,1,2,3,0),{home:0,away:3});
});
test('only confirmed matches count',()=>{
  const teams=[{id:1,name:'Alpha'},{id:2,name:'Beta'}];
  const matches=[{home_team_id:1,away_team_id:2,winner_team_id:1,status:'pending'},
    {home_team_id:1,away_team_id:2,winner_team_id:2,status:'confirmed'}];
  const rows=calculateStandings(teams,matches);
  assert.equal(rows[0].name,'Beta');assert.equal(rows[0].points,3);assert.equal(rows[1].losses,1);
});
