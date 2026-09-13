import { validateCatalog, parseNowPlaying, parseIcecastDate, findTrack, durationLabel } from './channel.js';
const $ = id => document.getElementById(id);
const STATUS_URL = 'https://cheetah.streemlion.com:2005/status-json.xsl';
const POLL_MS = 15000;
const CATALOG_CACHE_KEY = 'mv:catalog:v2';
const STAR_KEY = 'mv:starred:v1';

let catalog, player, desired = false, ready = false, joining = false;
let failed = new Set(), loadTimer, catalogFetchFailed = false, liveFetchFailed = false;
let apiPromise;
let live = null;        // {artist, title, key, startedAt} — what's actually on the station right now
let nowTrack = null;    // catalog track currently loaded in the player
let mode = 'idle';      // 'live' (nowTrack matches the live song) | 'filler' (favorites/catalog while waiting) | 'idle'
let starred = new Set();

function message(text = '') { $('message').textContent = text; }
function current() { return nowTrack; }

function loadStarred() {
  try { starred = new Set(JSON.parse(localStorage.getItem(STAR_KEY)) || []); } catch { starred = new Set(); }
}
function saveStarred() { try { localStorage.setItem(STAR_KEY, JSON.stringify([...starred])); } catch {} }

function pickFiller() {
  if (!catalog) return null;
  const starredTracks = catalog.tracks.filter(t => starred.has(t.videoId) && !failed.has(t.videoId));
  const pool = (starredTracks.length ? starredTracks : catalog.tracks.filter(t => !failed.has(t.videoId)));
  if (!pool.length) return null;
  const candidates = pool.length > 1 ? pool.filter(t => t.videoId !== nowTrack?.videoId) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function showTrack() {
  const t = current();
  if (!t) {
    $('artist').textContent = 'Sound. Vision. Attitude.';
    $('title').textContent = 'Your all-night metal fix.';
    $('track-detail').textContent = '';
    $('youtube-link').hidden = true;
    updateStarButton();
    return;
  }
  $('artist').textContent = t.artist;
  $('title').textContent = t.title;
  $('track-detail').textContent = [t.kind, t.year].filter(Boolean).join(' / ');
  $('youtube-link').href = `https://www.youtube.com/watch?v=${t.videoId}`;
  $('youtube-link').hidden = false;
  updateStarButton();
}

function updateStarButton() {
  const t = current();
  $('star').disabled = !t;
  const on = t && starred.has(t.videoId);
  $('star').setAttribute('aria-pressed', String(!!on));
  $('star').textContent = on ? '★ SAVED' : '☆ SAVE';
}

function toggleStar() {
  const t = current();
  if (!t) return;
  if (starred.has(t.videoId)) starred.delete(t.videoId); else starred.add(t.videoId);
  saveStarred(); updateStarButton(); renderFavorites();
}

function renderFavorites() {
  const list = catalog ? catalog.tracks.filter(t => starred.has(t.videoId)) : [];
  $('favorites').replaceChildren(...list.map(track => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.title = `Play ${track.artist} — ${track.title} from the beginning`;
    btn.setAttribute('aria-label', btn.title);
    const img = document.createElement('img');
    img.className = 'thumb'; img.src = `https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`;
    img.alt = ''; img.loading = 'lazy'; img.width = 160; img.height = 90;
    const details = document.createElement('span'); details.className = 'guide-track';
    [['guide-artist', track.artist], ['guide-song', track.title], ['guide-kind', track.kind]].forEach(([cls, text]) => {
      const span = document.createElement('span'); span.className = cls; span.textContent = text; details.append(span);
    });
    btn.append(img, details);
    btn.addEventListener('click', () => chooseFavorite(track));
    li.append(btn); return li;
  }));
  $('favorites-empty').hidden = list.length > 0;
  $('rotation-count').textContent = catalog
    ? `${catalog.tracks.length} songs have a matched video${list.length ? ` · ${list.length} saved` : ''}`
    : 'Loading the catalog';
}

function updateOnAir() {
  $('live-ticker').textContent = live ? `Hair Band Radio now: ${live.artist} – ${live.title}` : 'THE CHANNEL NEVER CLOCKS OUT';
  if (!desired) { $('playing-label').textContent = 'ON THE CHANNEL'; return; }
  $('playing-label').textContent = mode === 'live' ? 'ON AIR · LIVE MATCH'
    : mode === 'filler' ? 'ON AIR · FAVORITES MIX' : 'ON AIR';
}

function updateControls() {
  $('next').disabled = !desired || mode !== 'filler';
}

function feedStatus() {
  if (!catalog) return;
  const date = new Date(catalog.updatedAt).toLocaleString();
  const stats = catalog.stats || {};
  let matchNote = 'Connecting to the station…';
  if (live) {
    matchNote = findTrack(catalog, live.key)
      ? 'This song is matched — you’re watching it live.'
      : 'No matched video for the current song yet; playing a favorites mix until one comes on.';
  }
  const staleness = [
    liveFetchFailed ? ' Station status is temporarily unreachable; showing the last known song.' : '',
    catalogFetchFailed ? ' Catalog refresh failed; showing a saved copy.' : '',
  ].join('');
  $('feed-status').textContent = `Catalog updated ${date}. ${stats.matchedRecent ?? '—'} of the last day’s ${stats.observedRecent ?? '—'} station plays had a video. ${matchNote}${staleness}`;
}

async function loadCatalog() {
  try {
    const res = await fetch(`data/catalog.json?t=${Math.floor(Date.now() / 60000)}`, {cache: 'no-store', signal: AbortSignal.timeout(12000)});
    if (!res.ok) throw Error('Catalog unavailable');
    catalog = validateCatalog(await res.json()); catalogFetchFailed = false;
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog)); } catch {}
  } catch {
    catalogFetchFailed = true;
    if (!catalog) { try { catalog = validateCatalog(JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY))); } catch {} }
  }
  $('tune').disabled = !catalog;
  $('intro-status').textContent = catalog ? 'One channel. No decisions. Just press play.' : 'The catalog is unavailable. Check your connection and retry.';
  if (!catalog) { $('tune').disabled = false; $('tune').textContent = '↻ RETRY'; }
  renderFavorites();
  feedStatus();
}

function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { apiPromise = undefined; script.remove(); reject(Error('YouTube did not respond. Check your connection or content blocker.')); }, 15000);
    window.onYouTubeIframeAPIReady = () => {clearTimeout(timer); resolve();};
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {clearTimeout(timer); apiPromise = undefined; script.remove(); reject(Error('YouTube could not load. Check your connection or content blocker.'));};
    document.head.append(script);
  });
  return apiPromise;
}

let pendingOffset = 0;
async function start(offset) {
  if (joining || !current()) return;
  joining = true; desired = true; pendingOffset = offset;
  $('tune').disabled = true; $('intro-status').textContent = 'Warming up the amps…';
  try {
    await loadApi();
    if (!desired) return;
    $('standby').hidden = true;
    ['power','restart','next','live'].forEach(id => $(id).disabled = false);
    updateControls();
    if (!player) {
      player = new YT.Player('player', {
        width: '100%', height: '100%', host: 'https://www.youtube.com',
        playerVars: {autoplay: 0, controls: 1, playsinline: 1, origin: location.origin, rel: 0},
        events: {
          onReady: () => { ready = true; player.getIframe().title = 'Metal Vision YouTube video player'; if (desired) loadCurrent(pendingOffset); },
          onStateChange: onState,
          onError: onError,
          onAutoplayBlocked: () => { clearTimeout(loadTimer); message('Press play in the video to keep watching.'); }
        }
      });
      armLoadTimer();
    } else if (ready) loadCurrent(offset);
  } catch (error) { stop(); message(error.message); }
  finally { joining = false; $('tune').disabled = false; }
}

function armLoadTimer() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    if (desired) message('Still connecting. Press play in the video, or try Next if it stays unavailable.');
  }, 18000);
}

function loadCurrent(offset = 0) {
  if (!ready || !desired || !current()) return;
  message(); showTrack(); updateOnAir(); $('elapsed').textContent = '— / —'; $('progress').style.width = '0%';
  player.loadVideoById({videoId: current().videoId, startSeconds: Math.max(0, Math.min(offset, current().duration - 2))});
  if (document.hidden) player.pauseVideo();
  armLoadTimer();
}

function stop() {
  desired = false; clearTimeout(loadTimer);
  if (ready) player.stopVideo();
  $('standby').hidden = false; document.body.classList.remove('playing');
  $('intro-status').textContent = 'The channel’s still rolling. Join whenever you’re ready.';
  ['power','restart','next','live'].forEach(id => $(id).disabled = true);
  updateOnAir(); updateControls(); message();
}

function joinTrack(track, offset, newMode) {
  mode = newMode; nowTrack = track; failed.delete(track.videoId);
  showTrack(); updateOnAir(); updateControls();
  if (!desired) return;
  if (player && ready) loadCurrent(offset); else start(offset);
}

function joinFiller() {
  const t = pickFiller();
  if (!t) {
    nowTrack = null; mode = 'idle'; showTrack(); updateOnAir(); updateControls();
    if (desired) { stop(); message('No videos are available right now.'); }
    return;
  }
  joinTrack(t, 0, 'filler');
}

function currentOffset() {
  if (mode === 'live' && live) return Math.max(0, (Date.now() - live.startedAt) / 1000);
  return 0;
}

async function tuneLive() {
  if (!catalog) await loadCatalog();
  if (!catalog) return;
  // Background polling (every POLL_MS, plus on boot) keeps nowTrack fresh, so the
  // common case can jump straight into start() without an awaited network call in
  // between the click and loadVideoById — an intervening await here would cost the
  // browser's "this was just clicked" autoplay allowance and silently block playback.
  if (!current()) await pollLive();
  if (!current()) { message('No videos to play yet. Check back soon.'); return; }
  failed.clear();
  await start(currentOffset());
  pollLive();
}

function advance() {
  if (!desired) return;
  if (mode === 'live') { message('Waiting for Hair Band Radio to change songs…'); return; }
  joinFiller();
}

function chooseFavorite(track) {
  failed.clear();
  joinTrack(track, 0, 'filler');
  if (!desired) start(0);
}

function onState(event) {
  if (!desired) return;
  const state = event.data;
  document.body.classList.toggle('playing', state === 1);
  if (state === 1) {
    clearTimeout(loadTimer); failed.clear(); message();
    if (document.hidden) player.pauseVideo();
  }
  if (state === 2) { clearTimeout(loadTimer); message('Paused. Press play in the video, or tune live to catch up.'); }
  if (state === 0) advance();
}

function onError(event) {
  if (!desired) return;
  clearTimeout(loadTimer);
  if ([100, 101, 150, 2].includes(event.data)) {
    if (current()) failed.add(current().videoId);
    joinFiller();
    if (desired) message('That video is unavailable here. Trying another one.');
  } else {
    message(event.data === 153 ? 'YouTube could not verify this player. Try the site in a regular browser tab.' : 'YouTube could not play this video. Try Next or open it on YouTube.');
  }
}

async function pollLive() {
  let parsed = null, startedAt = Date.now();
  try {
    const res = await fetch(`${STATUS_URL}?t=${Date.now()}`, {cache: 'no-store', signal: AbortSignal.timeout(8000)});
    if (!res.ok) throw Error('Station status unavailable');
    const data = await res.json();
    const source = data?.icestats?.source;
    const raw = Array.isArray(source) ? source[0] : source;
    parsed = parseNowPlaying(raw?.title);
    startedAt = parseIcecastDate(raw?.metadata_updated) ?? Date.now();
    liveFetchFailed = false;
  } catch {
    liveFetchFailed = true;
  }
  if (parsed && catalog && (!live || live.key !== parsed.key)) {
    live = { ...parsed, startedAt };
    const match = findTrack(catalog, live.key);
    if (match) joinTrack(match, (Date.now() - startedAt) / 1000, 'live');
    else if (mode !== 'filler') joinFiller();
  }
  updateOnAir(); feedStatus();
}

$('tune').addEventListener('click', tuneLive);
$('live').addEventListener('click', tuneLive);
$('power').addEventListener('click', stop);
$('next').addEventListener('click', () => { if (mode === 'filler') { failed.clear(); joinFiller(); } });
$('restart').addEventListener('click', () => loadCurrent(0));
$('star').addEventListener('click', toggleStar);
$('theater').addEventListener('click', () => {
  const on = document.body.classList.toggle('theater'); $('theater').setAttribute('aria-pressed', String(on));
});
$('about-open').addEventListener('click', () => {feedStatus(); $('about').showModal();});
$('about-close').addEventListener('click', () => $('about').close());
$('about').addEventListener('click', e => {if (e.target === $('about')) {const r = $('about').getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('about').close();}});
$('clear-data').addEventListener('click', () => {try {localStorage.removeItem(CATALOG_CACHE_KEY);} catch {} $('clear-data').textContent = 'Saved catalog cleared';});
document.addEventListener('keydown', e => {if (e.key === 'Escape' && !$('about').open) {document.body.classList.remove('theater'); $('theater').setAttribute('aria-pressed','false');}});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ready && desired) player.pauseVideo();
  else if (!document.hidden) pollLive();
});
window.addEventListener('online', pollLive);
setInterval(() => {
  $('clock').textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  if (ready && desired) {
    const duration = player.getDuration() || current()?.duration || 0, elapsed = player.getCurrentTime() || 0;
    $('progress').style.width = `${duration ? Math.min(100, elapsed / duration * 100) : 0}%`;
    $('elapsed').textContent = `${durationLabel(elapsed)} / ${durationLabel(duration)}`;
  }
}, 1000);
setInterval(pollLive, POLL_MS);
loadStarred();
await loadCatalog();
await pollLive();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
