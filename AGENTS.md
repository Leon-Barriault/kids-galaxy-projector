# AGENTS.md — handoff for the next agent

Written mid-feature. Part one of three is committed and green; parts two and
three are specified here but not written. Read this whole file before touching
anything: several of the decisions below were made by the repository owner
against explicit alternatives, and re-deriving them will produce a different
and wrong answer.

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

**The whole server side of feature 2.** 160 tests pass, ruff clean.

- `Planet.to_payload()` gained `"id"`. The projector accumulates planets now,
  so it needs a stable dedupe key. The id is already inside the URL, so this
  leaks nothing new. One payload shape is shared by `/api/current-planet`,
  `/api/planets` and the SSE stream — deliberately, so the projector has one
  code path whether a planet arrives on load or arrives live.
- `PlanetRepository.recent(limit)` — port + filesystem implementation. Newest
  first, same ordering as `latest()`, non-positive limit returns `[]`.
- `ListRecentPlanetsUseCase` — `max_limit` is a hard ceiling, not a default.
  The query parameter behind it is caller-controlled.
- `GET /api/planets?limit=N` — newest first. `limit` is optional, `ge=1`, and
  clamped to the gallery size. Omitting it returns exactly the gallery size.
- `Settings.gallery_size` (env `GALLERY_SIZE`, default 12), wired in the
  factory as `min(gallery_size, max_stored_planets)` — showing more planets
  than the store keeps would leave gaps the moment `prune` runs.

Nothing on the Android side or in `galaxy.js` has been touched yet.

---

## 4. What is left

### 4.1 Android domain — pure, framework-free, test first

Two new types under `android/app/src/main/kotlin/com/kidsgalaxy/domain/`.
Both must import nothing from `android.*` or `androidx.*`; `make arch`
enforces this and the JVM tests depend on it.

**`domain/model/PlanetGuide.kt`** — where the circle is.

Derived from `CanvasSize`, not stored as a stroke. Suggested shape:

```kotlin
data class PlanetGuide(val centreX: Float, val centreY: Float, val radius: Float) {
    fun contains(point: Point): Boolean
    companion object {
        fun forCanvas(size: CanvasSize): PlanetGuide   // radius ≈ 0.42 * min(w, h)
    }
}
```

Tests to write first: centred on any aspect ratio; radius scales with the
smaller dimension so the circle always fits; `contains` is true at the centre
and false outside the rim; an unmeasured canvas yields a degenerate guide that
callers can detect rather than a crash.

**`domain/render/SphericalProjection.kt`** — the polar mapping.

Pure arithmetic mapping an *output* equirectangular texel back to the *source*
disc point to sample. Reverse mapping, not forward — that is what makes it a
simple resample loop with no gaps.

Given output size `W × H` (use 2:1, e.g. 1024 × 512) and a source disc of
centre `(cx, cy)` and radius `R`:

```
v = (y + 0.5) / H          colatitude fraction, 0 at the north pole
u = (x + 0.5) / W          longitude fraction
θ = v · π                  colatitude
φ = u · 2π                 longitude
r = θ / π  ( = v )         distance from the disc centre, 0..1
sourceX = cx + r · R · cos(φ)
sourceY = cy + r · R · sin(φ)
```

Tests to write first: the top row maps to the disc centre; the bottom row maps
to the rim; `r` grows monotonically with `y`; longitude wraps so `u = 0` and
`u = 1` land on the same source point; every returned point lies inside the
disc. Property-style assertions are more useful here than fixed values.

### 4.2 Android renderer

`data/render/AndroidPlanetTextureRenderer.kt` becomes two stages:

1. Render the strokes into a square disc bitmap as today, but with
   `canvas.clipPath(circlePath)` from the `PlanetGuide` so anything drawn
   outside the circle is dropped. Background stays white.
2. Resample that bitmap into a `W × H` equirectangular bitmap through
   `SphericalProjection`, then PNG-encode *that*.

Use `IntArray` pixel access on both bitmaps, not `getPixel` per texel —
1024 × 512 is 524k lookups and the per-call overhead dominates otherwise.
Nearest-neighbour sampling is fine: the source is 1024² so there is plenty of
detail, and the pole region oversamples anyway.

This class is the only place in the app allowed to touch `android.graphics`.
Keep it that way — the coordinate mathematics belongs in the domain, which is
why the domain tests run without an emulator.

### 4.3 Android UI

`ui/DrawingCanvas.kt` paints the guide circle outline beneath the strokes and
clips drawing to it, so the tablet shows exactly what becomes the planet. Use
`PlanetGuide.forCanvas` on the measured size — do not duplicate the geometry.

Watch out: `DrawingUiState.canUndo` and `canLaunch` are both driven by
`drawing.isEmpty`. The guide is not a stroke, so they keep working unchanged.
That is the intended behaviour — the kid must actually draw something before
Launch lights up.

### 4.4 Projector

`pi-server/static/galaxy.js` currently creates one `kidBody` and swaps its
material on every arrival (`applyPlanetTexture`). Replace that with a set:

- On load, `GET /api/planets` and create one body per planet. Remember the
  response is newest first — build orbits in reverse so arrival order matches.
- On each SSE `planet` event, add a body. Dedupe on `payload.id`; the SSE
  stream also emits the current planet on connect, so duplicates are normal
  and must not produce two planets.
- Past 12, shrink the oldest away and dispose its geometry, material *and*
  texture. Three.js does not garbage-collect GPU resources; on a Pi running for
  an afternoon this leak is the difference between working and not.
- Give each planet a distinct orbit — vary semi-major axis, inclination and
  initial mean anomaly deterministically from the index so a reload reproduces
  the same sky rather than reshuffling it.
- Keep the sun, the three decorative planets and the star field.
- Keep `/api/current-planet` working; it is the SSE fallback path.

The existing scale-in animation and the celebration burst should fire for a
newly arrived planet, not for the ones restored on load — otherwise every page
refresh sets off twelve celebrations at once.

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
   clone at `C:\Users\LéonBarriault\AppData\Local\Temp\kg-push`, then
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

Read `ARCHITECTURE.md`, then `android/ANDROID_STUDIO.md` section 4a. Then
write `SphericalProjectionTest` and watch it fail. That single class is the
heart of feature 3, it is pure arithmetic, it needs no emulator, and getting it
right first makes the renderer change mechanical.
