import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, matchKey, parseNowPlaying, parseIcecastDate, findTrack } from '../public/channel.js';

const tracks = [
  {key: 'firehouse|all she wrote', videoId: 'sidL7S09jsc', artist: 'Firehouse', title: 'All She Wrote', duration: 268, kind: 'Music video'},
  {key: 'warrant|down boys', videoId: '0RHENr6Xe70', artist: 'Warrant', title: 'Down Boys', duration: 247, kind: 'Music video'},
];
const catalog = {version: 2, updatedAt: 1000, tracks};

test('now-playing titles split into artist and title and normalize like the collector', () => {
  assert.deepEqual(parseNowPlaying('Firehouse - All She Wrote (91)'), {artist: 'Firehouse', title: 'All She Wrote', key: 'firehouse|all she wrote'});
  assert.equal(matchKey('Mötley Crüe', 'Home Sweet Home [Live] (99)'), matchKey('Motley Crue', 'Home Sweet Home'));
  assert.equal(parseNowPlaying('Station ID'), null);
});

test('icecast metadata timestamps parse to the correct UTC instant', () => {
  assert.equal(parseIcecastDate('13/Sep/2026:04:50:10 +0000'), Date.UTC(2026, 8, 13, 4, 50, 10));
  assert.equal(parseIcecastDate('13/Sep/2026:04:50:10 -0500'), Date.UTC(2026, 8, 13, 9, 50, 10));
  assert.equal(parseIcecastDate('garbage'), null);
});

test('a live song only swaps the video when it actually matches the catalog', () => {
  assert.equal(findTrack(catalog, 'firehouse|all she wrote').videoId, 'sidL7S09jsc');
  assert.equal(findTrack(catalog, 'motley crue|wild side'), null);
});

test('bad or empty catalogs are rejected before replacing a cached one', () => {
  assert.throws(() => validateCatalog({version: 2, updatedAt: 0, tracks: []}));
  assert.throws(() => validateCatalog({version: 1, updatedAt: 0, tracks}));
  assert.throws(() => validateCatalog({version: 2, updatedAt: 0, tracks: [{...tracks[0], duration: 0}]}));
  assert.throws(() => validateCatalog({version: 2, updatedAt: 0, tracks: [{...tracks[0], videoId: '<script>'}]}));
  assert.ok(validateCatalog(catalog));
});
