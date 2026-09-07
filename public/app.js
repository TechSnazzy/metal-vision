import { validateChannel, editionAt, slotAt, upcoming, durationLabel } from './channel.js';
const $ = id => document.getElementById(id);
let guide, edition, index = 0, player, desired = false, ready = false, joining = false;
let failed = new Set(), loadTimer, fetchFailed = false, pendingOffset = 0;
let apiPromise;
const CACHE_KEY = 'mv:guide:v1';

function message(text = '') { $('message').textContent = text; }
function current() { return edition?.tracks[index]; }
function showTrack() {
  const t = current();
  if (!t) return;
  $('artist').textContent = t.artist;
  $('title').textContent = t.title;
  $('track-detail').textContent = [t.kind, t.year, t.album].filter(Boolean).join(' / ');
  $('youtube-link').href = `https://www.youtube.com/watch?v=${t.videoId}`;
  $('youtube-link').hidden = false;
  $('up-next').replaceChildren(...upcoming(edition, index).map(({index: i, track}, n) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.title = `Play ${track.artist} — ${track.title} from the beginning`;
    btn.setAttribute('aria-label', btn.title);
    const img = document.createElement('img');
    img.className = 'thumb'; img.src = `https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`;
    img.alt = ''; img.loading = 'lazy'; img.width = 160; img.height = 90;
    const details = document.createElement('span'); details.className = 'guide-track';
    [['guide-artist', track.artist], ['guide-song', track.title], ['guide-kind', `${String(n + 1).padStart(2, '0')} / ${track.kind}`]].forEach(([cls, text]) => {
      const span = document.createElement('span'); span.className = cls; span.textContent = text; details.append(span);
    });
    btn.append(img, details); btn.addEventListener('click', () => choose(i)); li.append(btn); return li;
  }));
  const minutes = Math.round(edition.tracks.reduce((s, t) => s + t.duration, 0) / 60);
  $('rotation-count').textContent = `${edition.tracks.length} videos / ~${minutes} minutes in rotation`;
}

function feedStatus() {
  if (!guide) return;
  const age = Date.now() - guide.updatedAt;
  const sourceAge = Date.now() - guide.sourceUpdatedAt;
  const date = new Date(guide.updatedAt).toLocaleString();
  $('feed-status').textContent = `Guide updated ${date}. ${guide.stats?.matched ?? '—'} matched videos from ${guide.stats?.observed ?? '—'} recent station plays. ${fetchFailed || age > 3 * 3600000 || sourceAge > 3 * 3600000 ? 'Playing the saved rotation; fresh programming is delayed.' : 'Station history is being collected in the background.'}`;
}

async function refreshGuide() {
  try {
    const res = await fetch(`data/channel.json?t=${Math.floor(Date.now() / 60000)}`, {cache: 'no-store', signal: AbortSignal.timeout(12000)});
    if (!res.ok) throw Error('Guide unavailable');
    guide = validateChannel(await res.json()); fetchFailed = false;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(guide)); } catch {}
  } catch {
    fetchFailed = true;
    if (!guide) {
      try { guide = validateChannel(JSON.parse(localStorage.getItem(CACHE_KEY))); } catch {}
    }
  }
  if (guide && !edition) {
    edition = editionAt(guide); index = slotAt(edition).index; showTrack();
  }
  $('tune').disabled = !guide;
  $('intro-status').textContent = guide ? (fetchFailed ? 'Saved rotation ready. Turn it up.' : 'One channel. No decisions. Just press play.') : 'The guide is unavailable. Check your connection and retry.';
  if (!guide) {
    $('tune').disabled = false; $('tune').textContent = '↻ RETRY';
  }
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

async function start(offset) {
  if (joining || !current()) return;
  joining = true; desired = true; pendingOffset = offset;
  $('tune').disabled = true; $('intro-status').textContent = 'Warming up the amps…';
  try {
    await loadApi();
    if (!desired) return;
    $('standby').hidden = true;
    ['power','restart','next','live'].forEach(id => $(id).disabled = false);
    $('playing-label').textContent = 'ON AIR';
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
  message(); showTrack(); $('elapsed').textContent = '— / —'; $('progress').style.width = '0%';
  player.loadVideoById({videoId: current().videoId, startSeconds: Math.max(0, Math.min(offset, current().duration - 2))});
  if (document.hidden) player.pauseVideo();
  armLoadTimer();
}

function stop() {
  desired = false; clearTimeout(loadTimer);
  if (ready) player.stopVideo();
  $('standby').hidden = false; document.body.classList.remove('playing');
  $('intro-status').textContent = 'The channel’s still rolling. Join whenever you’re ready.';
  $('playing-label').textContent = 'ON THE CHANNEL';
  ['power','restart','next','live'].forEach(id => $(id).disabled = true);
  message();
}

async function tuneLive() {
  if (!guide) {await refreshGuide(); return;}
  edition = editionAt(guide); const slot = slotAt(edition); index = slot.index;
  failed.clear(); showTrack(); await start(slot.offset);
}

function advance() {
  if (!desired) return;
  const latest = editionAt(guide);
  if (latest.id !== edition.id) { edition = latest; index = slotAt(edition).index; }
  else index = (index + 1) % edition.tracks.length;
  let attempts = 0;
  while (failed.has(current().videoId) && attempts < edition.tracks.length) {
    index = (index + 1) % edition.tracks.length; attempts++;
  }
  if (attempts >= edition.tracks.length) { stop(); message('These videos could not play here. Check YouTube access, then tune in again.'); return; }
  loadCurrent(0);
}

function choose(i) { index = i; failed.clear(); showTrack(); start(0); }
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
    failed.add(current().videoId); advance();
    if (desired) message('That video is unavailable here. Moving to the next one.');
  } else {
    message(event.data === 153 ? 'YouTube could not verify this player. Try the site in a regular browser tab.' : 'YouTube could not play this video. Try Next or open it on YouTube.');
  }
}

$('tune').addEventListener('click', tuneLive);
$('live').addEventListener('click', tuneLive);
$('power').addEventListener('click', stop);
$('next').addEventListener('click', () => {failed.clear(); advance();});
$('restart').addEventListener('click', () => loadCurrent(0));
$('theater').addEventListener('click', () => {
  const on = document.body.classList.toggle('theater'); $('theater').setAttribute('aria-pressed', String(on));
});
$('about-open').addEventListener('click', () => {feedStatus(); $('about').showModal();});
$('about-close').addEventListener('click', () => $('about').close());
$('about').addEventListener('click', e => {if (e.target === $('about')) {const r = $('about').getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('about').close();}});
$('clear-data').addEventListener('click', () => {try {localStorage.removeItem(CACHE_KEY);} catch {} $('clear-data').textContent = 'Saved guide cleared';});
document.addEventListener('keydown', e => {if (e.key === 'Escape' && !$('about').open) {document.body.classList.remove('theater'); $('theater').setAttribute('aria-pressed','false');}});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ready && desired) player.pauseVideo();
  else if (!document.hidden) refreshGuide();
});
window.addEventListener('online', refreshGuide);
setInterval(() => {
  $('clock').textContent = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  if (!desired && guide) { const e = editionAt(guide), s = slotAt(e); if(e.id !== edition?.id || s.index !== index) {edition=e; index=s.index; showTrack();} }
  if (ready && desired) {
    const duration = player.getDuration() || current().duration, elapsed = player.getCurrentTime() || 0;
    $('progress').style.width = `${Math.min(100, elapsed / duration * 100)}%`;
    $('elapsed').textContent = `${durationLabel(elapsed)} / ${durationLabel(duration)}`;
  }
}, 1000);
setInterval(refreshGuide, 5 * 60000);
await refreshGuide();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
