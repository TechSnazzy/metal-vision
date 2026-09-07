import test from 'node:test';
import assert from 'node:assert/strict';
import { slotAt, editionAt, validateChannel, upcoming } from '../public/channel.js';
const tracks = [{videoId:'sidL7S09jsc',artist:'Firehouse',title:'All She Wrote',duration:240},{videoId:'0RHENr6Xe70',artist:'Warrant',title:'Down Boys',duration:180}];
const edition = {id:'2026-09-06',startsAt:1000000,tracks};
test('tune-in uses a shared clock including exact boundaries and repeats', () => {
  assert.deepEqual(slotAt(edition,1000000), {index:0,offset:0,track:tracks[0]});
  assert.equal(slotAt(edition,1240000).index,1);
  assert.equal(slotAt(edition,1250000).offset,10);
  assert.equal(slotAt(edition,1420000).index,0);
  assert.equal(slotAt(edition,1000000+86400000*400).offset,60);
});
test('future editions never replace current programming early', () => {
  const tomorrow={...edition,id:'tomorrow',startsAt:2000000};
  assert.equal(editionAt({editions:[tomorrow,edition]},1999999).id,edition.id);
  assert.equal(editionAt({editions:[edition,tomorrow]},2000000).id,'tomorrow');
});
test('long outage keeps the last usable edition playing', () => {
  assert.equal(editionAt({editions:[edition]},9999999999999).id,edition.id);
  assert.equal(upcoming(edition,1)[0].index,0);
});
test('bad guide and zero-length videos are rejected before replacing cached guide', () => {
  assert.throws(()=>validateChannel({version:1,updatedAt:0,editions:[]}));
  assert.throws(()=>validateChannel({version:1,updatedAt:0,editions:[{...edition,tracks:[{...tracks[0],duration:0}]}]}));
  assert.throws(()=>validateChannel({version:1,updatedAt:0,editions:[{...edition,tracks:[{...tracks[0],videoId:'<script>'}]}]}));
  assert.ok(validateChannel({version:1,updatedAt:0,editions:[edition]}));
});
