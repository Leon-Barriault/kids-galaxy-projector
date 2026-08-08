# AGENTS.md — handoff for the next agent

Features 1–3 from the original tablet/projector handoff are implemented and
on main. Read this whole file before touching anything: several of the
decisions below were made by the repository owner against explicit
alternatives, and re-deriving them will produce a different and wrong answer.

---

## 1. What this project is

Children draw a planet on an Android tablet. It appears, live, in a projected
3D galaxy running on a Raspberry Pi. Local network only, no accounts, mTLS in
the field.

Three deployable pieces:

| Piece | Where | Stack |
|---|---|---|
| Tablet app | `android/` | Kotlin, Jetpack Compose, AGP 9 built-in Kotlin |
| Server | `pi-server/` | FastAPI, Pillow, SSE with polling fallback |
| Projector page | `pi-server/static/` | Three.js r185, vendored, no CDN |

`README.md` covers setup, `ARCHITECTURE.md` the layering, `DEVELOPMENT.md` the
workflow, `android/ANDROID_STUDIO.md` how to run and debug the tablet app.
Read `android/ANDROID_STUDIO.md` before running anything Android.

---

## 2. The feature in progress

The owner asked for three things, in one sentence each:

1. **A default circle on the tablet.** The kid should find a circle already
   drawn, representing the planet, and colour it in.
2. **Every drawing becomes its own planet.** Sending a planet should add one to
   the galaxy, not repaint the single existing one.
3. **The circle should become the whole sphere.** Currently a drawing lands on
   one side of the sphere only.

### 2.1 Decisions already made — do not re-litigate

Each of these was chosen by the owner from a set of alternatives. They are
settled.

**Wrapping: polar (globe-style).** The centre of the drawn circle becomes the
north pole; the rim of the circle becomes the south pole. Every part of the
drawing appears somewhere on the sphere and the whole sphere is covered. The
owner was offered "front and back, mirrored" (keeps a drawn face recognisable)
and "stretch to fill", and chose polar. It is the most planet-like of the
three; the known cost is that a drawn face smears around the top, and that is
accepted.

**The circle: outline only, fixed.** A circle guide is painted on the canvas
with no fill — the inside stays white until the kid colours it. It is *not* a
stroke: undo and clear must not remove it, and it must not make `canLaunch`
true on its own. It defines the planet's edge, so anything drawn outside it is
ignored. That boundary is also what makes the sphere mapping well-defined.

**Gallery size: 12, oldest fades out.** A new planet joins its own orbit. When
the thirteenth arrives, the oldest shrinks away and is removed from the scene
(not from disk — the server keeps 30, deliberately more than the sky shows, so
raising the limit needs no re-upload).

---

## 3. What is done (committed, green)

**Feature 1 — fixed planet guide on the tablet.**

- `PlanetGuide` in domain (pure JVM): centre + radius from `CanvasSize`
  (radius ≈ 0.42 × min dimension). `contains()` inclusive on the rim.
  Unmeasured canvas yields a degenerate guide (radius 0).
- `DrawingCanvas` paints a soft blue outline (`GUIDE_OUTLINE_COLOR` /
  `GUIDE_STROKE_WIDTH`) and clips all strokes to the guide via `clipPath`.
  The guide is never stored as a stroke — undo / clear / canLaunch stay
  driven by `drawing.isEmpty`.

**Feature 2 — every drawing becomes its own planet.**

Server (already green at 7d70397):

- `Planet.to_payload()` gained `"id"`. Shared payload shape across
  `/api/current-planet`, `/api/planets` and the SSE stream.
- `PlanetRepository.recent(limit)`, `ListRecentPlanetsUseCase`,
  `GET /api/planets?limit=N`, `Settings.gallery_size` (default 12).

Projector (`pi-server/static/galaxy.js`):

- `kidPlanets` Map keyed by id; SSE and gallery load share `addKidPlanet`.
- `loadInitialGallery` fetches `GET /api/planets?limit=GALLERY_SIZE` on start
  (newest first, no celebrate for restored bodies).
- `disposeOldestIfNeeded` when past 12; deterministic `orbitParamsForIndex`.
- Celebrate (scale-in + banner) only for live arrivals.

**Feature 3 — the circle becomes the whole sphere.**

- `SphericalProjection` (domain, pure JVM): polar reverse mapping —
  equirectangular texel samples the source disc so centre = north pole,
  rim = south pole. Property tests for poles, rim, monotonic r, longitude wrap.
- `TextureProjection.mapGuide` so clip path and polar mapping share geometry.
- Two-stage renderer: stage 1 draws strokes into a square disc clipped to
  `PlanetGuide`; stage 2 resamples via `SphericalProjection` into 1024×512
  equirectangular PNG (`IntArray` bulk pixel access).

Architecture boundaries (`make arch`) and ktlint 1.5.0 hold. Domain stays
free of Android/Compose imports.

---

## 4. What is left / known follow-ups

- Keep CI green on every push. The Android job is the long pole; ktlint and
  `make arch` are the fast gates that catch most regressions before Gradle.
- Dependency versions remain pinned to the set introduced at 7d70397 unless
  the owner explicitly asks to bump them.
- Optional polish (not blocking): richer arrival animations, per-planet labels
  on the projector, or a tablet preview of the equirectangular texture before
  launch. None of these change the domain contracts above.

---

## 5. How to work in this repository

### 5.1 Method

The owner asked for **TDD and clean architecture**, explicitly, and every
commit so far honours it. Write the failing test, watch it fail for the right
reason, then implement. Domain first, then application, then infrastructure,
then UI.

Dependencies point inwards. The domain knows nothing about frameworks. This is
not decoration — it is what makes the Android tests runnable on the JVM and the
Python use cases testable with fakes in microseconds, and `make arch` fails the
build if it is violated.

### 5.2 The gates, exactly as CI runs them

```bash
cd pi-server && ruff check . --config ruff.toml
hadolint --config .hadolint.yaml pi-server/Dockerfile
shellcheck -x scripts/setup_hotspot.sh scripts/start_kiosk.sh \
    scripts/dev-up.sh pi-server/certs/generate_certs.sh
cd android && ktlint --relative --editorconfig=.editorconfig "app/src/**/*.kt"
make arch
cd pi-server && python -m pytest tests/ -q          # PYTHONPATH=.
cd android && ./gradlew testDebugUnitTest assembleDebug
```

`make verify` runs most of it. The lint job gates every other job in CI, so a
formatting error costs a whole round trip.

**ktlint must be exactly 1.5.0.** A different version reports spurious diffs.
`ktlint --format` fixes everything it reports.

### 5.3 Environment notes that will save you an hour

- **Gradle cannot run in the Claude cloud container** — `services.gradle.org`
  is not reachable through the proxy. Kotlin build-script and app changes are
  verified by CI, not locally. Review Gradle Kotlin DSL carefully before
  pushing; a syntax error there fails every job.
- Python tests, ruff, shellcheck and ktlint *do* run locally. ktlint is at
  `/tmp/ktlint` in this container (1.5.0, already downloaded).
- `pip install -r requirements-dev.txt --break-system-packages`.
- Run pytest with `PYTHONPATH=.` from `pi-server/`.

### 5.4 Getting changes to GitHub

Direct `git push` to GitHub is blocked from the container. The working route,
used for every commit so far:

1. `git bundle create <name>.bundle <base>..<branch>` in the container.
2. `SendUserFile` the bundle, then `mcp__remote-devices__device_commit_files`
   with the returned `file_uuid` to write it into the owner's connected folder
   (`.../flyscan-cowork/Leon-Barriault/kids-galaxy-projector`).
3. Via `mcp__remote-devices__Windows-MCP__PowerShell`, copy it into the working
   clone at `C:\\Users\\LéonBarriault\\AppData\\Local\\Temp\\kg-push`, then
   `git fetch <bundle> <branch>` and `git push origin FETCH_HEAD:main`.
4. Confirm the CI run is green through the Chrome connector at
   `github.com/Leon-Barriault/kids-galaxy-projector/actions?query=branch:main`.

The owner's standing preference is **push straight to main** — main is green
and these are additive changes. Confirm before pushing anything that could
break it; do not assume one approval covers the next push.

### 5.5 Commit style

Conventional prefix, then prose explaining *why*, not what. State what was
tried and rejected. Sign off with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## 6. Traps this project has already sprung

Every one of these cost a CI round trip or worse. They are all fixed; do not
undo them.

- **Gradle does not read `local.properties` as project properties.** The
  Android plugin only takes `sdk.dir` from it. `app/build.gradle.kts` loads it
  explicitly. Any advice that says otherwise is wrong for a stock build.
- **`android/local.properties` is committed on purpose** and is *not* in
  `.gitignore`. It carries the local-debug server host and deliberately has no
  `sdk.dir`.
- **Debug and release read different host properties** —
  `kidsGalaxyDebugServerHost` and `kidsGalaxyServerHost`. They used to share
  one, which let a local address follow a release build silently.
- **AGP 9 ships built-in Kotlin.** `org.jetbrains.kotlin.android` must stay
  absent; applying it fails with a new-DSL incompatibility.
- **`buildFeatures { buildConfig = true }` and `manifestPlaceholders`
  ["serverHost"] are load-bearing.** `ApiClient` reads four `BuildConfig`
  fields and `network_security_config.xml` interpolates the placeholder.
- **`compileSdk` must be ≥ 37** for `androidx.lifecycle` 2.11.
- **`three.module.js` is not self-contained** since r16x — it imports
  `three.core.js`. Both are vendored; `make vendor-three` fails loudly if the
  core file goes missing.
- **The projector must never reference the public internet.** `make arch`
  greps `index.html` and `galaxy.js` for `http`. The Pi has no uplink.
- **Starlette ≥ 1.4 stopped exposing `path` on router-included routes.** SSE
  route assertions go through the OpenAPI schema instead; the stream lives in
  `app/api/sse.py` so it can be driven directly without deadlocking TestClient.

---

## 7. Where to start

Features 1–3 are on main. Prefer small, CI-green pushes. If something is red,
fix the failing gate first (ktlint / arch / tests) before adding more surface.
