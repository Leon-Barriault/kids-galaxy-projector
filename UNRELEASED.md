# Unreleased

## Fixed (field-blocking)

- **Projector no longer needs the internet.** `static/index.html` loaded Three.js
  from unpkg and its font from Google Fonts, but the deployment is an offline Pi
  hotspot — the galaxy page could not render in the field. Three.js 0.170.0 and
  `OrbitControls` are now vendored into `static/vendor/` (MIT licence included)
  and the page uses a system font stack. A CI check fails the build if any remote
  URL reappears in the projector assets.
- **Projector showed the internal id in the planet name.** `/api/current-planet`
  rebuilt the name from the stored filename (`<uuid>_<name>.png` →
  `"f31fc218ce My Planet"`), so the tablet and the projector disagreed. The
  display name is now persisted verbatim in a sidecar JSON file and returned
  as-is; unicode and punctuation survive (`Alice's World!`). Legacy images
  without a sidecar fall back to de-prefixing the filename.
- **Drawings were scaled by a hard-coded guess and squashed.**
  `renderStrokesToBitmap` mapped points with `* size / 800f` while the Compose
  canvas was `fillMaxSize()` — neither 800px nor square. The new
  `TextureProjection` derives a single scale from the *measured* canvas size and
  letterboxes the result, so a circle the child drew stays a circle.

## Fixed

- **CI was red on a fresh checkout.** `ruff` reported 6 errors (an unused
  `pytest` import, two import-order issues, three ambiguous en dashes), and the
  `lint` job gates every other job. Lint is now clean.
- **The error dialog could not be dismissed.** Its OK button and
  `onDismissRequest` were empty stubs and no `clearError()` existed, so a network
  error stayed on screen until the next launch attempt.
- **ViewModel was hand-constructed inside `setContent`**, bypassing lifecycle
  retention — an in-progress drawing could be discarded on recomposition and
  `initApi` re-ran each time. It is now obtained through a `ViewModelProvider.Factory`.
- **White flash on cold start**: the launch theme was
  `android:Theme.Material.Light.NoActionBar` while the Compose theme is dark.
  Replaced with a dark base theme matching `#0A0E2A`.
- Upload size is now rejected **before** the body is buffered (Content-Length
  check plus a bounded read), instead of after the whole payload was in memory.
- `uploads/` no longer grows without bound: the newest `MAX_STORED_PLANETS`
  (default 30) are kept and older drawings are pruned with their sidecars.
- The rate-limit map now evicts stale entries, and a throttled attempt no longer
  extends its own cooldown window.
- Path-traversal defence hardened: basename plus a containment check on the
  resolved path, so a symlink cannot escape the upload directory either.

## Added

- **mTLS is now actually implemented on the tablet.** `ApiClient` presents
  `client.p12` from app assets and pins trust to the project CA; previously the
  README advertised certificate authentication while the app sent cleartext HTTP
  with no client certificate configured.
- **Certificates now validate on Android.** `generate_certs.sh` issues
  `subjectAltName` entries (IP + DNS) and explicit CA `basicConstraints`/
  `keyUsage`; modern Android ignores the Common Name, so the previous
  CN-only certificates could not have completed a handshake. CI generates and
  verifies the chain on every run.
- **Server-Sent Events (`GET /api/events`)** push each new planet the instant it
  is stored, replacing a 2.5s poll — the celebration is now immediate. The
  front-end falls back to polling automatically if the stream is unavailable.
- **Gradle wrapper** (`android/gradlew`), so builds are reproducible.
- **CI now builds the Android app and runs its unit tests.** The previous
  `android-sources` job only asserted that files existed, so a Kotlin compile
  error could not turn the pipeline red.
- **Per-build-type configuration**: `SERVER_BASE_URL`, `USE_MTLS` and the
  certificate password are injected via `buildConfigField` and overridable with
  Gradle properties. Debug = HTTP for the lab, release = HTTPS + mTLS.
- **Scoped network security config**: cleartext is permitted only for the hotspot
  host (plus emulator loopback); everything else is HTTPS-only. Replaces a
  blanket `usesCleartextTraffic="true"`.
- `ARCHITECTURE.md` documenting the layering, dependency rules and test strategy.
- Makefile targets: `arch`, `test-android`, `build-android`, `verify`, `vendor-three`.
- UI strings extracted to `strings.xml`; colour swatches are now `selectable`
  with a `RadioButton` role so the selection is announced to accessibility services.

## Changed

- **Both applications restructured into clean architecture**, with dependencies
  pointing inwards and the domain free of framework imports:
  - Server: `app/domain`, `app/application` (use cases), `app/ports.py`,
    `app/infrastructure` (filesystem, Pillow, pub/sub, rate limiting),
    `app/api`, `app/factory.py`. `main.py` is now three lines; `uvicorn main:app`
    is unchanged.
  - Android: `domain` (framework-free model, projection maths, ports, use case),
    `data` (Retrofit, mTLS, Bitmap rendering), `presentation` (ViewModel),
    `ui` (Compose), `di` (composition root).
- **Test suite rebuilt around the layers, test-first**: 123 Python tests (was 23)
  at 96% coverage, split into `unit/{domain,application,infrastructure}` and
  `integration`. The domain and application suites use no I/O and run in ~0.2s.
  New Kotlin JVM suites cover the projection maths, drawing rules and the
  ViewModel state machine — none of which was testable before.
- Integration tests build an app per test via the composition root against a temp
  directory, so suites no longer share upload or rate-limit state.
- `ktlint` now lints the **whole** Kotlin tree, main and test; CI previously
  allowlisted a subset of paths.
- CORS origins, retention, cooldown, dimensions and texture size are all
  configurable via environment; settings are parsed once in `app/config.py` with
  defaults that hold for blank or malformed values.
- API docs (`/docs`) are enabled only when `ENVIRONMENT` is a development value.
- Rendering and network I/O moved to `Dispatchers.IO` inside the repository, so
  neither the ViewModel nor the use case handles dispatchers.
- `UploadResponse` gained the `url` field the server already returned, with
  explicit `@SerializedName` mappings so ProGuard cannot break deserialization.
- Launch button is disabled until something is drawn; undo/clear disabled when the
  canvas is empty; a successful launch clears the canvas for the next planet.
- Double taps on Launch can no longer send two uploads.
- Stroke points are tracked once (the canvas keeps only the in-flight stroke)
  rather than duplicated between the canvas and the ViewModel.
- `HttpLoggingInterceptor` is attached only in debug builds.
- Dead code removed from filename sanitization (the `..` replacement ran after
  dots had already been stripped).
- Docker healthcheck smoke test waits for readiness instead of a fixed `sleep 3`,
  and now also asserts the vendored Three.js is served from the image.

## Verified

- Server: 123 tests green, 96% coverage, `ruff` clean.
- Architecture gates pass: both domain layers framework-free, dependencies inward,
  no remote URLs in projector assets.
- `shellcheck` clean across all three scripts.
- Live end-to-end run: vendored Three.js served locally (HTTP 200), display name
  round-trips as `Alice's World!`, SSE pushed the new planet immediately,
  retention kept exactly 3 of 6 uploads with no orphaned sidecars, oversized
  upload rejected with HTTP 400, traversal attempt returned 404.
- Real mTLS handshake against uvicorn: connection **rejected** without a client
  certificate, **accepted** with one, and the IP SAN verified when connecting to
  `127.0.0.1` by address.
- Certificate chain verified with `openssl verify`; CA has `CA:TRUE`, server has
  `serverAuth` + IP/DNS SANs, client has `clientAuth`.
- Texture-projection mathematics independently validated against every assertion
  in `TextureProjectionTest` (aspect preserved, symmetric letterboxing, centre
  maps to centre, stroke width scales, unmeasured canvas degrades to identity).

## Not verified in this environment

- Kotlin compilation and the Android JVM test run: this sandbox has no Android
  SDK and no access to Maven Central or `dl.google.com`, so `./gradlew` cannot
  resolve dependencies here. The new `android` CI job runs both on every push.
  The Gradle wrapper itself was generated from a real Gradle 8.14.3 distribution
  and contains the correct `GradleWrapperMain`.
