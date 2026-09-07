"""Read-only check using YouTube's official oEmbed endpoint (no API key)."""
import concurrent.futures
import json
from pathlib import Path
import urllib.parse
import urllib.request


def check(entry):
    url = 'https://www.youtube.com/oembed?' + urllib.parse.urlencode({'url': 'https://www.youtube.com/watch?v=' + entry['videoId'], 'format':'json'})
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            data = json.load(response)
        return f"OK {entry['videoId']} | {data['title']} | {data['author_name']}"
    except Exception as e:
        return f"FAIL {entry['videoId']} {type(e).__name__}"


if __name__ == '__main__':
    catalog = json.loads((Path(__file__).resolve().parents[1] / 'data/catalog.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(check, catalog):
            print(result)
