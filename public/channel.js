const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

export function validateCatalog(data) {
  if (data?.version !== 2 || !Number.isFinite(data.updatedAt) || !Array.isArray(data.tracks) || !data.tracks.length) throw Error('Invalid catalog');
  for (const t of data.tracks) {
    if (!/^[\w-]{11}$/.test(t.videoId) || !Number.isFinite(t.duration) || t.duration < 60 || t.duration > 1800 || typeof t.artist !== 'string' || typeof t.title !== 'string' || typeof t.key !== 'string') throw Error('Invalid video');
  }
  return data;
}

export function normalize(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function cleanTitle(value) {
  return value.replace(/\s*\((?:\d{2}|(?:19|20)\d{2})\)\s*$/, '').trim();
}

export function matchKey(artist, title) {
  const strippedPerformance = cleanTitle(title).replace(/\s*\[(?:live|acoustic)\]/i, '');
  return `${normalize(artist)}|${normalize(strippedPerformance)}`;
}

// Icecast station titles look like "Motley Crue - Wild Side (87)".
export function parseNowPlaying(rawTitle) {
  const cleaned = cleanTitle(String(rawTitle || ''));
  const sep = cleaned.indexOf(' - ');
  if (sep === -1) return null;
  const artist = cleaned.slice(0, sep).trim();
  const title = cleaned.slice(sep + 3).trim();
  if (!artist || !title) return null;
  return { artist, title, key: matchKey(artist, title) };
}

// Icecast status-json timestamps look like "13/Sep/2026:04:50:10 +0000".
export function parseIcecastDate(value) {
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const [, day, mon, year, hh, mm, ss, sign, offH, offM] = m;
  const month = MONTHS[mon];
  if (month === undefined) return null;
  const asUtcMs = Date.UTC(+year, month, +day, +hh, +mm, +ss);
  const offsetMs = (sign === '-' ? -1 : 1) * (Number(offH) * 60 + Number(offM)) * 60000;
  return asUtcMs - offsetMs;
}

export function findTrack(catalog, key) {
  return catalog.tracks.find(t => t.key === key) || null;
}

export function durationLabel(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
