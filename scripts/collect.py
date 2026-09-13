"""Station history -> matched video catalog. No media is downloaded or stored."""
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


def catalog_entry(entry_key, entry):
    video_id = entry.get('videoId', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        return None
    duration = entry.get('duration', 0)
    if not isinstance(duration, (int, float)) or not 60 <= duration <= 1800:
        return None
    return {'key': entry_key, 'artist': entry.get('artist', ''), 'title': entry.get('title', ''),
            'videoId': video_id, 'duration': duration, 'kind': entry.get('kind', 'Music video'),
            'year': entry.get('year', ''), 'durationEstimated': bool(entry.get('durationEstimated', False))}


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
    entries = [e for e in (catalog_entry(k, v) for k, v in catalog.items()) if e]
    if not entries:
        raise ValueError('No playable matches yet. Add reviewed videos to data/catalog.json.')
    # Last day of observed music, for freshness stats only; playback matches live, not a schedule.
    recent = [s for s in history if s['playedAt'] > now_ms - 86400000]
    matched_recent = sum(1 for s in recent if catalog.get(s['key'], {}).get('videoId'))
    write(ROOT / 'data/history.json', history)
    unknown = {s['key']: {'artist': s['artist'], 'title': s['title'],
                           'search': 'https://www.youtube.com/results?search_query=' + urllib.parse.quote(s['artist'] + ' ' + s['title'])}
               for s in recent if not catalog.get(s['key'], {}).get('videoId')}
    write(ROOT / 'data/unmatched.json', list(unknown.values()))
    guide = {'version': 2, 'updatedAt': now_ms, 'sourceUpdatedAt': max(s['playedAt'] for s in incoming),
             'source': 'Hair Band Radio', 'sourceUrl': 'https://hairbandradio.com/',
             'stats': {'observedRecent': len(recent), 'matchedRecent': matched_recent,
                       'catalogSize': len(raw_catalog), 'automaticMatching': bool(os.environ.get('YOUTUBE_API_KEY'))},
             'tracks': entries}
    write(ROOT / 'public/data/catalog.json', guide)
    print(f'Collected {len(history)} plays; catalog has {len(entries)} playable videos; '
          f'{matched_recent}/{len(recent)} of the last day matched live; {len(unknown)} await review.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixture')
    args = parser.parse_args()
    collect(args.fixture)
