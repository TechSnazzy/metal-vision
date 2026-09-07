# Metal Vision

All night. All loud. A personal music-video channel with a black leather,
blood-red, early Sunset Strip look. Sister project to Metal Radio, which is
completely unchanged.

Watch: https://techsnazzy.github.io/metal-vision/

## How it works

Hair Band Radio's **real recorded song order** is the curator. A short GitHub
Actions job reads its public 500-entry history every 30 minutes. It strips
station IDs, normalizes artist/title/year labels, and matches songs against a
reviewed video catalog. Repeated broadcasts stay repeated; order is preserved.
Music videos and reviewed live performances are both welcome.

The resulting daily edition loops continuously. A shared UTC clock lets you
tune into the approximate current video position. Today's edition is frozen;
fresh collected songs prepare tomorrow's edition. After joining, videos play
through to their actual end, including longer live performances. Ads and pauses
can cause drift; **Tune live** explicitly catches you up. This is a video rotation
based on recorded radio programming, not synchronized simulcasting.

GitHub Pages serves only `public/`. No backend server or media downloads. If the
station or scheduled job is unavailable, the last saved edition continues to loop.
GitHub Actions schedules are best effort; long interruptions exceeding the
station's history window can lose plays. The About panel reports freshness.

## Playback

- Click **Tune in** to start; browsers may also require play inside YouTube.
- Restart, next, upcoming-video selection, theater layout, and YouTube's native
  controls/fullscreen are available.
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

Browser tests use a mocked YouTube API to exercise controls/errors, never to claim
real video playback works. Real embed availability must also be checked manually.
`CHROMIUM_PATH` overrides `/usr/bin/chromium`; `TEST_URL` overrides localhost:8080.

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

`data/unmatched.json` provides YouTube search links for unpaired songs. Verify
the artist/song and visual quality, then add the best available video or live
performance. `python3 scripts/verify_catalog.py` checks oEmbed title and creator.

```sh
npm run collect
git add data public/data
git commit -m 'Update video programming'
git push
```

On first collection, today's edition is seeded. Later changes affect tomorrow,
not the currently airing edition. To explicitly rebuild an unpublished preview,
remove the preview edition from `public/data/channel.json` before collecting;
do not reset a live edition while viewers are watching it.

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

## Project continuation

See `HANDOFF.md` for exact implementation/deployment status and remaining work.
