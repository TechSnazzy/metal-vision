"""Station history -> ordered video editions. No media is downloaded or stored."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HISTORY = 'https://cheetah.streemlion.com:1820/api/v2/history/'
UTC = dt.timezone.utc


def read(path, default):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as f:
        json.dump(value, f, indent=2, ensure_ascii=False)
        f.write('\n')
        temp = Path(f.name)
    temp.replace(path)


def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'MetalVision/1.0 (personal music-video guide)'})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def clean_title(value):
    return re.sub(r'\s*\((?:\d{2}|(?:19|20)\d{2})\)\s*$', '', value).strip()


def normalized(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    value = value.replace('&', ' and ')
    return re.sub(r'[^a-z0-9]+', ' ', value).strip()


def key(artist, title):
    # Performance tags describe the radio version, not a different composition.
    title = re.sub(r'\s*\[(?:live|acoustic)\]', '', clean_title(title), flags=re.I)
    return normalized(artist) + '|' + normalized(title)


def normalize_history(rows):
    songs = []
    for row in rows:
        artist = str(row.get('author') or '').strip()
        title = clean_title(str(row.get('title') or ''))
        ts = row.get('ts')
        if not artist or not title or not isinstance(ts, (int, float)):
            continue
        if row.get('length', 0) < 60000 or normalized(artist) in ('hair band radio', 'jillicious'):
            continue
        if not isinstance(row.get('id'), int) or ts <= 0:
            continue
        songs.append({'id': str(row['id']), 'playedAt': int(ts), 'artist': artist,
                      'title': title, 'album': str(row.get('album') or ''),
                      'key': key(artist, title)})
    return sorted(songs, key=lambda s: (s['playedAt'], s['id']))


def merge_history(old, new, now_ms):
    merged = {s['id']: s for s in old}
    merged.update({s['id']: s for s in new})
    return sorted((s for s in merged.values() if now_ms - 7 * 86400000 < s['playedAt'] <= now_ms + 60000),
                  key=lambda s: (s['playedAt'], s['id']))


def seconds(iso):
    m = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso)
    return sum(int(v or 0) * unit for v, unit in zip(m.groups(), [3600, 60, 1])) if m else 0


def acceptable(song, snippet):
    title = normalized(snippet.get('title', ''))
    # Require artist and song tokens. Deliberately conservative; manual live picks allowed.
    if not all(t in title.split() for t in normalized(song['artist']).split()):
        return False
    if not all(t in title.split() for t in normalized(song['title']).split()):
        return False
    if re.search(r'\b(reaction|cover|tutorial|karaoke|lyrics?|tribute|full album|audio only)\b', title):
        return False
    return 'official' in title and bool(re.search(r'\b(video|live|performance)\b', title))


def discover(songs, catalog, api_key, now):
    """Optional official API; limited searches, weekly negative cache, 28-day refresh."""
    cache_path = ROOT / 'data' / 'discovered.json'
    cache = read(cache_path, {})
    today = now.timestamp()
    cache = {k: v for k, v in cache.items() if today - v['checkedAt'] < (28 if v.get('videoId') else 7) * 86400}
    if not api_key:
        return cache

    def api(endpoint, params):
        params['key'] = api_key
        return get_json('https://www.googleapis.com/youtube/v3/' + endpoint + '?' + urllib.parse.urlencode(params))

    searched = 0
    for song in reversed(songs):
        k = song['key']
        if k in catalog or k in cache:
            continue
        if searched >= 2:  # 48 daily collection runs => at most 96 searches/day.
            break
        searched += 1
        try:
            results = api('search', {'part': 'snippet', 'type': 'video', 'videoEmbeddable': 'true',
                                    'videoSyndicated': 'true', 'maxResults': 5,
                                    'q': song['artist'] + ' ' + song['title'] + ' official video'})
            candidates = [x for x in results.get('items', []) if acceptable(song, x['snippet'])]
            choice = None
            for result in candidates:
                info = api('videos', {'part': 'contentDetails,status', 'id': result['id']['videoId']})
                if not info.get('items'):
                    continue
                video = info['items'][0]
                duration = seconds(video['contentDetails'].get('duration', ''))
                if not 90 <= duration <= 1200 or not video['status'].get('embeddable'):
                    continue
                if video['contentDetails'].get('contentRating', {}).get('ytRating') == 'ytAgeRestricted':
                    continue
                choice = {'videoId': video['id'], 'duration': duration, 'artist': song['artist'],
                          'title': song['title'], 'kind': 'Live performance' if 'live' in normalized(result['snippet']['title']).split() else 'Music video',
                          'checkedAt': today, 'automatic': True}
                break
            cache[k] = choice or {'checkedAt': today}
        except Exception:
            # Never print a URL containing credentials. Preserve the working lineup.
            print('YouTube lookup unavailable; continuing with verified catalog.')
            break
    write(cache_path, cache)
    return cache


def make_tracks(songs, catalog):
    tracks = []
    for song in songs:
        match = catalog.get(song['key'])
        if not match or not re.fullmatch(r'[A-Za-z0-9_-]{11}', match.get('videoId', '')):
            continue
        duration = match.get('duration', 0)
        if not isinstance(duration, (int, float)) or not 60 <= duration <= 1800:
            continue
        tracks.append({**song, 'videoId': match['videoId'], 'duration': duration,
                       'kind': match.get('kind', 'Music video'),
                       'year': match.get('year', ''),
                       'durationEstimated': match.get('durationEstimated', False)})
    return tracks


def editions_for(old, tracks, now):
    today = now.date()
    # Freeze today's program. Changes become tomorrow's program, avoiding jumps
    # every time a fresh history snapshot is published.
    editions = [e for e in old if today - dt.timedelta(days=1) <= dt.date.fromisoformat(e['id']) <= today]
    for date in [today, today + dt.timedelta(days=1)]:
        date_id = date.isoformat()
        if tracks and not any(e['id'] == date_id for e in editions):
            editions.append({'id': date_id, 'startsAt': int(dt.datetime.combine(date, dt.time(), UTC).timestamp() * 1000),
                             'tracks': tracks})
    return editions


def collect(fixture=None):
    now = dt.datetime.now(UTC)
    now_ms = int(now.timestamp() * 1000)
    payload = read(Path(fixture), {}) if fixture else get_json(HISTORY + '?limit=500&offset=0&server=2')
    if not isinstance(payload.get('results'), list) or not payload['results']:
        raise ValueError('Station history is empty or invalid; preserving previous data.')
    incoming = normalize_history(payload['results'])
    if not incoming:
        raise ValueError('No valid songs in history; preserving previous data.')
    history = merge_history(read(ROOT / 'data/history.json', []), incoming, now_ms)
    raw_catalog = read(ROOT / 'data/catalog.json', [])
    catalog = {key(v['artist'], v['title']): v for v in raw_catalog}
    automatic = discover(history, catalog, os.environ.get('YOUTUBE_API_KEY'), now)
    catalog = {**automatic, **catalog}  # Human-reviewed choices always win.
    # Last day of observed music, retaining real repeats and chronological order.
    recent = [s for s in history if s['playedAt'] > now_ms - 86400000]
    tracks = make_tracks(recent, catalog)
    path = ROOT / 'public/data/channel.json'
    previous = read(path, {'editions': []})
    editions = editions_for(previous['editions'], tracks, now)
    if not editions:
        raise ValueError('No playable matches yet. Add reviewed videos to data/catalog.json.')
    write(ROOT / 'data/history.json', history)
    unknown = {s['key']: {'artist': s['artist'], 'title': s['title'],
                           'search': 'https://www.youtube.com/results?search_query=' + urllib.parse.quote(s['artist'] + ' ' + s['title'])}
               for s in recent if not catalog.get(s['key'], {}).get('videoId')}
    write(ROOT / 'data/unmatched.json', list(unknown.values()))
    channel = {'version': 1, 'updatedAt': now_ms, 'sourceUpdatedAt': max(s['playedAt'] for s in incoming),
               'source': 'Hair Band Radio', 'sourceUrl': 'https://hairbandradio.com/',
               'stats': {'observed': len(recent), 'matched': len(tracks), 'catalog': len(raw_catalog),
                         'automaticMatching': bool(os.environ.get('YOUTUBE_API_KEY'))},
               'editions': editions}
    write(path, channel)
    print(f'Collected {len(history)} plays; {len(tracks)} matched in the latest day; {len(unknown)} await review.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixture')
    args = parser.parse_args()
    collect(args.fixture)
