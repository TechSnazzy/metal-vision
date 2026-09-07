export function validateChannel(data) {
  if (data?.version !== 1 || !Number.isFinite(data.updatedAt) || !Array.isArray(data.editions) || !data.editions.length) throw Error('Invalid channel guide');
  for (const edition of data.editions) {
    if (!Number.isFinite(edition.startsAt) || typeof edition.id !== 'string' || !Array.isArray(edition.tracks) || !edition.tracks.length) throw Error('Empty edition');
    for (const t of edition.tracks) {
      if (!/^[\w-]{11}$/.test(t.videoId) || !Number.isFinite(t.duration) || t.duration < 60 || t.duration > 1800 || typeof t.artist !== 'string' || typeof t.title !== 'string') throw Error('Invalid video');
    }
  }
  return data;
}

export function editionAt(data, now = Date.now()) {
  const editions = [...data.editions].sort((a, b) => a.startsAt - b.startsAt);
  return editions.filter(e => e.startsAt <= now).at(-1) || editions[0];
}

export function slotAt(edition, now = Date.now()) {
  const total = edition.tracks.reduce((sum, t) => sum + t.duration, 0);
  const elapsed = Math.max(0, (now - edition.startsAt) / 1000);
  let offset = elapsed % total;
  for (let index = 0; index < edition.tracks.length; index++) {
    if (offset < edition.tracks[index].duration) return { index, offset, track: edition.tracks[index] };
    offset -= edition.tracks[index].duration;
  }
  return { index: 0, offset: 0, track: edition.tracks[0] };
}

export function upcoming(edition, index, count = 6) {
  return Array.from({length: Math.min(count, edition.tracks.length - 1)}, (_, n) => {
    const i = (index + n + 1) % edition.tracks.length;
    return { index: i, track: edition.tracks[i] };
  });
}

export function durationLabel(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
