# AGENTS.md — handoff for the next agent

Features 1–3 from the original tablet/projector handoff are implemented and
on main. A fourth slice (brighter planets + manager app + delete API) is
**mostly on main but not finished** — see §4 for the exact remaining work.
Read this whole file before touching anything.

---

## 1. What this project is

Children draw a planet on an Android tablet. It appears, live, in a projected
3D galaxy running on a Raspberry Pi. Local network only, no accounts, mTLS in
the field.

Four deployable pieces:

| Piece | Where | Stack |
|---|---|---|
| Drawing tablet app | `android/app` | Kotlin, Jetpack Compose, AGP 9 |
| **Manager app (new)** | `android/manager` | Separate `applicationId` `com.kidsgalaxy.manager` |
| Server | `pi-server/` | FastAPI, Pillow, SSE |
| Projector page | `pi-server/static/` | Three.js r185, vendored, offline |

`README.md` covers setup, `ARCHITECTURE.md` the layering, `DEVELOPMENT.md` the
workflow, `android/ANDROID_STUDIO.md` how to run the drawing app.

---

## 2. Features 1–3 (complete on main)

Settled owner decisions — do not re-litigate:

- **Polar wrapping**: disc centre → north pole, rim → south pole.
- **Guide circle**: outline only, fixed, not a stroke; clips drawing + mapping.
- **Gallery size 12**: oldest disposed; store keeps up to 30 on disk.

Implemented:

- `PlanetGuide` + `SphericalProjection` + `TextureProjection.mapGuide` (domain, TDD).
- Two-stage Android texture renderer (disc clip → polar equirectangular PNG).
- Projector `kidPlanets` Map, SSE arrivals, `disposeOldestIfNeeded`.
- Server `GET /api/planets`, payload shape `{has_planet, id, url, name, timestamp}`.

---

## 3. Session four: repair pass

The brighter-planets / manager-app / delete-API slice landed across eight
commits that were all red in CI (#70 to #77, each failing inside twenty
seconds at the lint gate). This section records what was wrong and what was
done, because two of the causes are the kind that recur.

### 3.1 Main was red for eight commits — fixed

`pi-server/tests/integration/test_api_e2e.py` had been overwritten with the
literal text `PLACEHOLDER_WILL_FAIL`, destroying 446 lines and twelve test
classes. Recovered verbatim from commit `7d70397` rather than rewritten, so the
coverage is provably the same coverage.

Separately, `NotFoundError` was imported out of alphabetical order in
`use_cases.py`, tripping ruff `I001`. That alone kept the whole pipeline red:
**the lint job gates every other job**, which makes it the cheapest place to
fail and the most expensive place to be careless.

### 3.2 Delete API and manager app — kept, with fixes

The clean-architecture shape of the delete work was sound and is unchanged:
`PlanetRepository.delete`, `DeletePlanetUseCase` publishing
`{has_planet: false, id, removed: true}` on the arrivals channel,
`DELETE /api/planets/{id}` mapping `NotFoundError` to 404, list ceiling raised
from gallery size to retention so the manager can see everything stored.

Added the test coverage that had never been pushed: `TestDelete` against a real
temp directory, `DeletePlanetUseCase` tests, and `TestDeletePlanet` over HTTP.
Two of those assert things only the unit layer can see — that a *failed* delete
publishes nothing, and that the removal rides the `planet` channel rather than
a channel of its own.

Manager app fixes: wrapped in a `MaterialTheme` (its dialogs were rendering
with the default *light* palette inside a dark app), `safeDrawingPadding` for
the edge-to-edge window, the OkHttp logging interceptor gated on
`BuildConfig.DEBUG`, and a guard on the `ViewModelProvider.Factory` cast. The
release variant now uses HTTP rather than pretending to do HTTPS it cannot do:
there is no mTLS here and the Pi's certificate is project-CA-signed, so every
release request would have failed on a trust anchor.

`io.coil-kt:coil-compose:2.7.0` is the final Coil 2 release and could not be
verified against Compose BOM 2026.06 offline. Left as-is deliberately — CI
builds `:manager`, so it answers definitively, and switching to Coil 3 blind
would introduce two new failure modes (`coil3.compose.AsyncImage` and a
required `coil-network-okhttp`). **If the Android job fails on Coil, that is
the fix.**

### 3.3 The projector had eight real bugs — fixed

`galaxy.js` had been rewritten rather than edited, and the rewrite dropped
OrbitControls, the 3200-star coloured field, the fog, the orbit rings and the
sparkle bursts. All restored, on top of the multi-planet work and the
brightness changes.

The correctness bugs shared one root cause: **the dedupe check ran before the
async texture load, but the Map was only written after it.** Every entry is now
inserted synchronously — mesh and orbit ring built immediately with a plain
material, the drawing swapped in when it arrives. That single change is what
makes dedupe, removal-while-loading and eviction all work, because each of them
needs something concrete to act on.

The rest: eviction now picks the oldest by arrival order rather than whichever
PNG decoded first; orbits are derived from a hash of the planet id, so a reload
or an earlier deletion no longer reshuffles the whole sky; the polling fallback
was restored (it had been deleted, leaving a projector behind a
stream-buffering proxy frozen forever); the fallback reconciles against
`/api/planets` so it handles deletions as well as arrivals; celebrations no
longer fire for planets restored on load.

### 3.4 A pre-existing bug worth knowing

**`manifestPlaceholders` are substituted into `AndroidManifest.xml` only, never
into resource XML.** `network_security_config.xml` had carried a
`${serverHost}` since the file was created; it was always literal text and
always matched no host. The symptom is that a debug build pointed at a LAN
address — the physical-tablet case — fails every request with an opaque
`CLEARTEXT communication not permitted` that reads like a server fault.

Now split by source set: `src/debug/res/xml` permits cleartext, `src/main`
(release) is HTTPS-only. The dead placeholder is gone from both modules.

### 3.5 New: a projector smoke test

`scripts/check_projector.py`, wired as `make check-projector`. It starts a real
server, uploads real planets and drives the real page in headless Chromium via
Playwright, asserting dedupe, live arrival, deletion, the gallery cap, eviction
order, orbit determinism across a reload, and a clean console.

`galaxy.js` is the one part of this project with no unit tests — it needs WebGL,
a live server and a real EventSource, so there is nothing to fake it with. This
is how it gets verified now. Running it against the previous version reproduces
three of the bugs above, which is the point.

**Not a CI gate**: CI has no browser installed, and adding one to lint a
projector is a poor trade. Run it locally before pushing anything that touches
`static/`. It needs `pip install playwright httpx` and a Chromium.

## 3.6 Session five: clear-all and surface blending

**Clear all** (`DELETE /api/planets`). `PlanetRepository.clear`,
`ClearPlanetsUseCase`, and a confirmed full-width button in the manager. One
broadcast (`{"has_planet": false, "cleared": true}`) rather than a loop over
the single delete: thirty round trips would make the projector flicker through
a cascade of disposals instead of emptying in one frame. The clear event
carries no `id`, so `galaxy.js` checks `cleared` *before* its `!data.id` guard.
The collection route is registered before `/{planet_id}` because Starlette
matches in order.

**Surface blending** (`SurfaceStyler` port, `PillowSurfaceStyler`). A drawing
is marker on white paper; wrapped onto a sphere that is what it looks like.
The styler diffuses the child's own colours outwards until the paper is gone,
then lays the strokes back at 80% so they still recognise it, then adds
multi-octave grain. Applied in `SubmitPlanetUseCase` strictly *after* the
security re-encode - the styler must only ever see bytes the image processor
has already vouched for. `SURFACE_BLEND=0` turns it off and returns the raw
drawing byte for byte.

Three things about it that are easy to undo by accident:

- The diffusion is **coarse to fine** - radius starts at a quarter of the
  texture and halves. A fixed small radius cannot cross a large empty region,
  so a child who draws one small shape gets a mostly white planet; a fixed
  large one turns the strokes to mud.
- It runs at **quarter resolution** and scales back up. The wash is
  low-frequency, and full-size blurs took the better part of two seconds.
- The noise is a **seeded** RNG, not `Image.effect_noise`, which cannot be
  seeded and made the same drawing style differently every time. The seed is a
  hash of the drawing, so a planet is stable but two planets differ.

Also dropped `optimize=True` from both PNG saves: it was ~700ms of zlib
strategy search per upload for a few percent of size, on the one path where a
child is watching a spinner. Styling now costs ~170ms total.

## 3.7 Session six: terrain

The eight tablet colours now become eight kinds of surface, chosen by the
owner: blue water, green forest, orange lava, red volcanic rupture, purple gas
bands, pink cloud pockets, plus yellow desert and black basalt for the two the
request did not name.

**It is built, tested and on main, but it is not the default.** Seen on an
actual projector the owner preferred the plain blend: terrain reads as
generated, the blend reads as the child's own drawing wrapped onto a world.
That is a judgement about a room full of children looking at a wall, and it is
not one the code can make - so `DEFAULT_SURFACE_STYLE` is `blend`, a test pins
it, and it should not be quietly "tidied" back.

Keeping both was what made that reversal a one-line change rather than a
revert, which is the argument for having built it as a second `SurfaceStyler`
rather than a replacement. `SURFACE_STYLE` picks between `blend`, `terrain`
and `off`. An unrecognised value falls back rather than raising: a typo in a
systemd unit should not stop the projector serving planets.

How it works, and what not to break:

- It **composes the blend's diffusion** rather than reimplementing it. That
  pass is what turns a few strokes into regions of colour; classify a raw
  scribble and you get white paper with thin ribbons of terrain on it.
- Classification is nearest-palette in plain RGB. A perceptual space would
  handle the in-between pixels better, but they sit on a boundary either way
  and the ink line drawn along it hides the difference.
- **The ink outline does most of the cartoon work.** Remove it and the whole
  thing reads as an airbrush again.
- Lava's hot channels have to be genuinely bright *in the albedo*, because the
  projector reuses the albedo as its emissive map. There is no second texture
  carrying the glow. A test pins this.
- Terrain is generated at **half resolution** and scaled up: 750ms became
  225ms, and at projector distance nobody can tell.

This needs **numpy** (pinned in requirements.txt). Classifying every texel and
generating eight procedural surfaces is array work; Pillow alone does it
slowly and at roughly triple the code. Standard aarch64 wheel, so it installs
on a Pi without a build.

### Not done: the separate emissive and cloud layers

The demo that got this approved had three textures per planet - albedo, an
emissive map, and a translucent cloud sphere floating above the surface. What
shipped bakes all of it into one texture, because the extra maps need
`Planet`, the payload, the repository and `prune`/`delete`/`clear` to all learn
about companion files. Worth doing; nothing depends on it.

Before starting, measure on the actual Pi: three textures times twelve planets
is 36 live on a GPU that also has to composite a star field.

## 4. What is left

Nothing is broken. In rough order of value:

- **Manager app in CI.** `:manager` is built by `./gradlew assembleDebug` (no
  module qualifier), and its sources are now under ktlint, but it has no unit
  tests at all. `ManagerViewModel` is a plain `ViewModel` and is the obvious
  first target.
- **mTLS for the manager**, so it can be a genuine field build rather than a
  closed-hotspot tool. `app/.../ApiClient.kt` already has the pattern.
- **Document the manager** in `README.md` and `DEVELOPMENT.md`: how to install
  the second APK on a volunteer's phone, and that it is LAN-only today.
- Per-planet labels on the projector; richer arrival animations.
- Dependency versions stay pinned to the set from `7d70397` unless asked.


## 5. How to work in this repository

### 5.1 Method

TDD and clean architecture, explicitly. Domain first, then application, then
infrastructure, then UI. Dependencies point inwards. `make arch` fails the
build if boundaries are violated.

### 5.2 The gates, exactly as CI should run them

```bash
cd pi-server && ruff check . --config ruff.toml
hadolint --config .hadolint.yaml pi-server/Dockerfile
shellcheck -x scripts/setup_hotspot.sh scripts/start_kiosk.sh \
    scripts/dev-up.sh pi-server/certs/generate_certs.sh
cd android && ktlint --relative --editorconfig=.editorconfig \
    "app/src/**/*.kt" "manager/src/**/*.kt"
make arch
cd pi-server && python -m pytest tests/ -q          # PYTHONPATH=.
cd android && ./gradlew testDebugUnitTest assembleDebug   # builds :manager too
```

`assembleDebug` with no module qualifier builds **both** app modules, so a
compile error in `:manager` fails the whole pipeline.

Not a CI gate, but run it before touching `static/`:

```bash
make check-projector
```

**ktlint must be exactly 1.5.0.**

### 5.3 Environment notes

- **Gradle cannot run in the Claude cloud container** - `services.gradle.org` is
  blocked through the proxy. Kotlin and build-script changes are verified by CI
  only. Read Gradle Kotlin DSL twice before pushing it.
- Python tests, ruff, shellcheck, ktlint and the projector smoke test all *do*
  run locally. Playwright and a Chromium are present.
- Owner preference: **push straight to main** when the tree is green. Small
  CI-green commits. Confirm before a push that could break it.
- Conventional commits: prefix + *why*, not only *what*.

### 5.4 Payload / wire contracts (do not drift)

**Planet payload** (REST + SSE):

```json
{ "has_planet": true, "id": "...", "url": "/uploads/....png", "name": "...", "timestamp": 0 }
```

**Gallery:** `{ "planets": [ ... ] }` newest first.

**Removal event (same SSE channel, event type `planet`):**

```json
{ "has_planet": false, "id": "...", "removed": true }
```

**Upload success (tablet):** `{ "status": "success", "message": "...", "planet_id", "name", "url" }`.

**Delete success (manager):** `{ "status": "deleted", "planet_id", "name" }`.

Projector `galaxy.js` must keep matching these field names (`url` / `name`, not
legacy `texture_url` / `display_name` alone — aliases exist only as fallback).

---

## 6. Traps already sprung (do not undo)

- HTML-escaped Kotlin generics (`\u003c`) in pushes — always push real source.
- ktlint `chain-method-continuation`: join `}.pointerInput` after multi-line
  trailing lambdas.
- `StrokePath.strokeWidth` not `.width`.
- Gallery JSON is an object with `planets`, not a bare array.
- SSE uses named event `planet`; listen with `addEventListener('planet', …)`.
- Never push placeholder content to a real source file on main. It cost eight
  red commits and destroyed 446 lines of test coverage; only git history got it
  back.
- List `max_limit` is retention (30) for the API ceiling; projector still uses 12.
- `manifestPlaceholders` never reach resource XML - only `AndroidManifest.xml`.
  Use source-set overrides for per-variant resources.
- In `galaxy.js`, register a planet in the Map **synchronously**, before its
  texture starts loading. Deferring the insert breaks dedupe, delete-while-
  loading and eviction all at once, and each failure looks unrelated.
- Rewriting a file to change one thing loses the rest of it. The projector
  rewrite dropped OrbitControls, the star field, fog, orbit rings and sparkles
  as collateral. Prefer targeted edits; diff against the previous version
  before pushing a file you rewrote.

---

## 7. Suggested first actions for the next agent

1. Run the gates in §5.2 and `make check-projector`. Everything should be
   green; if it is not, fix that before anything else.
2. Check the Actions run on main. If the Android job failed on Coil, see §3.2 -
   the fix is Coil 3 plus `coil3.compose.AsyncImage` and `coil-network-okhttp`.
3. Pick from §4. `ManagerViewModel` unit tests are the highest-value next step:
   the manager is the only module with no tests at all.

Do not start new feature work while anything above is red.
