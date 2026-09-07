# Metal Vision — working notes

## User request
Build a separate modern MTV-style app inspired by /home/sean/Projects/metal-radio.
Preserve Metal Radio completely. Name: Metal Vision. Hair Band Radio curates song
order; YouTube official embeds provide complete music videos. Continuous channel,
join anytime. Publish TechSnazzy/metal-vision on GitHub Pages and link it in the
Games menu of seantechguy.com (repo TechSnazzy/TechSnazzy).
User has YouTube Premium; understands other viewers may see YouTube ads.
User wants concise updates and durable notes in case account usage runs out.

## Workspace / authorization
Working in /home/sean/Work/metal-vision (writable sandbox). Existing originals are
in /home/sean/Projects. GitHub CLI works outside sandbox via existing keyring auth;
inside sandbox its misleading auth failure is due to network/keyring access.
Publishing both app and website was explicitly authorized. Network calls need
require_escalated. No subagents authorized. No ancestor AGENTS.md found.

## Verified discovery
- Hair Band Radio stream https://cheetah.streemlion.com:2005/stream
- Public metadata https://cheetah.streemlion.com:2005/status-json.xsl
  icestats.source.title = "Krokus - Midnite Maniac (84)" on initial observation.
  source.metadata_updated is a real UTC song-change timestamp; normalize year suffix.
- Official hairbandradio.com embeds its own player with TEN SONG HISTORY:
  api-url=https://cheetah.streemlion.com:1820/api/v2 server-id=2
  JS https://cheetah.streemlion.com:1820/media/static/js/sc_player/sc_player.js
  Investigate history endpoint next; could allow light scheduled ingestion rather
  than needing an always-on server for every track.
- Website local /home/sean/Projects/seantechguy-site, clean at inspection,
  remote https://github.com/TechSnazzy/TechSnazzy.git, main branch, legacy Pages
  root source, domain seantechguy.com. Games menu index.html lines 32–41.
- Metal Radio also legacy Pages main/root. Do not edit.
- Node v26.7.0, npm 11.19.0, Chromium and ffprobe available.

## Product decisions
Big video player, late-night chrome wordmark + pink/teal synthwave identity,
up-next guide, mobile responsive, native YouTube controls kept visible, tune in
with explicit click. Radio audio never plays. Shared deterministic broadcast
schedule; video completion should not be cut off to chase radio timing. Ads and
pauses can cause drift; a tune-live control can explicitly resync.
Need honest source/freshness and fallback rotation indicators. Do not falsely
claim launch seed songs were captured from radio. No downloaded video/audio.
YouTube API search needs a key; build optional automated matching and a curated
catalogue so launch works without one. Store API data with expiry/refresh, NOT
permanently as previous assistant wrongly suggested. Ads cannot be suppressed.

## Verified official video references so far
- Firehouse All She Wrote: sidL7S09jsc (FirehouseVEVO)
- Warrant Down Boys: 0RHENr6Xe70 (Warrant Official)
- Dokken In My Dreams: locJVSj6jdU (DokkenOfficial)

## Latest user steering — essential
- User explicitly REJECTED pink/teal synthwave. Wants early-80s Sunset Strip,
  Motley Crue Too Fast for Love feel: black leather, blood red, distressed ivory,
  chrome/studs and club-poster typography. Original artwork only, no album copy.
- Live performances welcome! Official video preferred but a great live video is
  valid. Label performance type; no need to skip deep cuts merely lacking MV.
- Account usage reported 25% remaining; abrupt cutoff. Keep this file current.

## Breakthrough: full history API verified
GET https://cheetah.streemlion.com:1820/api/v2/history/?limit=100&offset=0&server=2
returns {count:500,next,results:[{id,ts (UNIX milliseconds),author,title,metadata,
length(milliseconds),album,...}] newest first. Fetch 500 or paginate bounded.
Discard station jingles (<60 sec or author HAIR BAND RADIO/Jillicious).
History contains the actual Firehouse All She Wrote from this conversation.
This permits short scheduled GitHub Actions ingestion every 30 minutes, recovering
missed entries from history. No permanently running server needed for launch.
Actions schedules are best effort and go inactive after 60 days repo inactivity;
replay still runs from saved rotation; expose feed freshness accurately.

## Implementation architecture
Vanilla static PWA on Pages; Python stdlib collector in scripts, curated catalog
maps normalized artist/title to verified YouTube ID and duration/type. Optional
YOUTUBE_API_KEY GitHub Actions secret for new automated matches with strict quality
checks. Track history stores observed broadcasts preserving repeats and order.
Daily editions freeze once their UTC day begins, tomorrow's edition assembled
from latest captured matching songs. Playback uses deterministic shared clock
and loops saved daily rotation 24/7; lets videos finish after tuning in.
YouTube ads/pause cause drift; explicit tune-live resynchronizes. Midnight changes
applied between videos. Need clear product wording daily station-sourced rotation.

## Status
App/collector/workflow/README/tests built in /home/sean/Work/metal-vision.
Local git initialized main; files staged, not committed. No remote/deployment yet.
Initial collection succeeded: 384 real radio plays, 14 catalog matches / ~67 minute
loop in today's daily edition. 294 distinct songs await review; catalogue needs
expansion or YOUTUBE_API_KEY secret for automatic growth. No key available yet.
All 14 video IDs verified through official YouTube oEmbed; full real playback
has not been checked yet (next task). Durations currently marked estimates.
npm test passes (JS + 6 Python tests). Playwright @playwright/test installed.
Browser tests desktop passed; mobile overflow found in screen aspect-ratio;
width:100% fix applied and thumbnail height corrected, rerun browser test next.
Local preview server running exec session 36372 port8080, escalated network.
Use `npm run test:browser` escalated for headless Chromium tests. Screenshots
/tmp/metal-vision-1440.png, /tmp/metal-vision-390.png etc. UI looks good desktop.
Website clone index.html now includes Metal Vision link, not committed/pushed.
Remaining: browser rerun, real YouTube check, commit/create GitHub public repo
TechSnazzy/metal-vision, Pages build_type workflow, push/verify Actions deployment,
fetch website upstream ff-only before commit/push menu, verify live menu/link.
README explains daily editions, skipped unmatched songs, timing estimates,
API key optional automation, YouTube ads, public deployment, source attribution.
Website clean clone prepared /home/sean/Work/metal-vision-site, origin reset to
https://github.com/TechSnazzy/TechSnazzy.git. Original app/site files untouched.
Verified extra video IDs: Autograph Turn Up the Radio j8CcTYsMHYU;
Aerosmith The Other Side zkGfPrst29Y; Joan Jett I Hate Myself for Loving You
bpNw7jYkbVc; Extreme Hole Hearted I-h4A7bF8wQ.
Update this file before handoff/final.

## Resumed September 6, 2026
- Unit tests and browser checks passed at 1440, 390, and 320px; mobile fix verified.
- Real headless Chromium YouTube playback confirmed: Dokken In My Dreams,
  player state 1, advancing time, duration 256.961 seconds.
- Fresh collection: 670 saved plays, 10 matches in latest day, 332 awaiting review.
- Website upstream had five newer commits; integrating them before menu publication.
- Publication in progress; next verify Pages deployment and live website link.
