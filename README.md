# Metal Vision

All night. All loud. A personal music-video channel with a black leather,
blood-red, early Sunset Strip look. Sister project to Metal Radio, which is
completely unchanged.

Watch: https://techsnazzy.github.io/metal-vision/

## How it works

Metal Vision watches Hair Band Radio's **live stream metadata** directly from
your browser (the same public status feed Metal Radio's now-playing display
uses) and checks roughly every 15 seconds for a song change. When the current
song matches a video in the reviewed catalog, it loads that video and jumps to
the same point the song is actually at, so it plays in step with the radio.

Most songs in the station's rotation don't have a reviewed video yet — that's
expected, not a bug. When there's no match, Metal Vision plays from your
**favorites** (saved with the ☆ SAVE button) or, if you haven't saved any yet,
a random pick from the small reviewed catalog, cycling until a matching live
song comes on. The "Hair Band Radio now" ticker always shows the real live
song, whether or not a video is currently matched to it, so you always know
what's actually playing.

A separate GitHub Actions job reads the station's public history every 30
minutes purely to grow the catalog and report freshness stats (how much of the
last day's plays had a match) — it has no effect on what plays moment to
moment. That's driven entirely by the live feed above.

GitHub Pages serves only `public/`. No backend server or media downloads.

## Playback

- Click **Tune in** to start; browsers may also require play inside YouTube.
- **Tune live** re-checks the station right now and jumps straight to it.
- **Next** skips to another favorite/catalog pick — only while playing filler
  (there's no "next" when a video is actually matched to the live song).
- **☆ SAVE** stars whatever's currently playing so it's available as filler.
- Restart, theater layout, and YouTube's native controls/fullscreen are
  available.
- Videos pause when the page is hidden. This isn't background YouTube playback.
- Unavailable/embedding-disabled videos are skipped with a bounded retry path.
- YouTube serves all video/audio and controls ads and Premium recognition.
  Premium may depend on sign-in, third-party cookies, browser, or standalone mode.
- The app is intended for personal enjoyment, but this GitHub Pages deployment
  is publicly accessible. It is not affiliated with the station or MTV.

## Develop and test

Python 3.10+, Node 22+. Frontend and collector have no runtime dependencies.

```sh
npm ci
npm test
npm run dev
# in another terminal, with Chromium installed:
npm run test:browser
```

Browser tests mock both the YouTube API and the station status feed to
exercise controls/errors/live-match cutover deterministically, never to claim
real video playback works. Real embed availability must also be checked
manually. `CHROMIUM_PATH` overrides `/usr/bin/chromium`; `TEST_URL` overrides
localhost:8080.

## Programming and live performances

`data/catalog.json` stores reviewed choices. Add an entry:

```json
{"artist":"Band","title":"Song","videoId":"abcdefghijk","duration":300,"kind":"Live performance","year":1987}
```

Use the 11-character YouTube ID and the **video's** duration, not the radio's.
Current hand-entered timing estimates are explicitly marked `durationEstimated`;
the actual YouTube end event always controls advancement. Live/acoustic radio
tags are stripped only for matching, so a different performance can be chosen.
Catalog selection can therefore pair a radio studio track with a live video.

`data/unmatched.json` lists recently-observed songs with no match yet, with
YouTube search links. Verify the artist/song and visual quality, then add the
best available video or live performance. `python3 scripts/verify_catalog.py`
checks oEmbed title and creator.

```sh
npm run collect
git add data public/data
git commit -m 'Update video programming'
git push
```

New catalog entries take effect immediately in the live app — the next time
that song comes on the radio, Metal Vision will have a match for it.

## Optional automatic discovery

Launch works without a YouTube Data API key using the reviewed catalog. To find
new videos automatically, enable YouTube Data API v3 in a Google Cloud project
and add **YOUTUBE_API_KEY** as a repository Actions secret. Never commit the key.
No key is shipped to browsers. Local collection reads the same environment name.

The job performs at most two new searches per run (96 on the normal daily
schedule). Extra manual runs can exceed that budget, so API failures fall back
to the existing catalog. It requires exact artist/song tokens and official
video/performance wording, rejects reaction/cover/tutorial/lyric clips, and
checks duration, embed permission and age restrictions. It's conservative, not
perfect: human catalog choices override automatic results. Live performances
without “official” in the title can be added manually after review.

Search results expire after 28 days (negative matches after 7), then are looked
up again. Only IDs/song metadata are stored, never YouTube media. Manual reviewed
links can outlive individual uploads; unavailable clips are handled by the player.

## Deployment

Repository Settings → Pages → Source: **GitHub Actions**. The workflow tests,
collects, saves programming, and publishes only `public/`. Enable workflow write
permissions. Code and programming use one serialized publishing workflow to
avoid competing deployments. Site navigation lives separately in
`TechSnazzy/TechSnazzy` (seantechguy.com).

GitHub may disable scheduled workflows after 60 days without repository activity;
successful collector commits normally keep this active. If collection stops,
inspect Actions and run **Update channel and publish** manually.
