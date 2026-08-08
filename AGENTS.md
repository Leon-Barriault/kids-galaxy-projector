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

## 3. What was added in this session (mostly on main)

### 3.1 Brighter planets (projector) — **on main**

`pi-server/static/galaxy.js`:

- Kid planet material: lower roughness, `emissive` + `emissiveMap` +
  `emissiveIntensity: 0.55` so drawings stay vivid under the projector.
- Stronger sun point light, brighter ambient, camera-side fill light.
- Slightly larger spheres (`1.05` radius).

Hard-refresh the projector page (or restart the kiosk) to pick this up.

### 3.2 Delete API + live sky removal — **on main**

Server (clean architecture, same ports pattern as the rest):

- `PlanetRepository.delete(planet_id) -> Planet | None`
- `FileSystemPlanetRepository.delete` (image + sidecar)
- `DeletePlanetUseCase` → publishes `{has_planet: false, id, removed: true}` on the
  existing SSE channel
- `DELETE /api/planets/{planet_id}` → 200 `{status, planet_id, name}` or 404
- `NotFoundError` → HTTP 404
- CORS allows `DELETE`
- List ceiling is **retention** (`max_stored_planets`, default 30), not gallery
  size 12, so the manager can list everything stored. Projector still requests
  `limit=12`.

Projector (`galaxy.js`):

- `removeKidPlanet(id)` disposes mesh/materials
- SSE `onPlanet` treats `removed: true` / `has_planet: false` as removal
- Optional `planet-removed` listener kept as a fallback

### 3.3 Manager Android app — **sources on main, not fully CI-green yet**

Separate module `android/manager` (`include(":manager")` in `settings.gradle.kts`):

| Path | Role |
|---|---|
| `ManagerApi` / `ApiFactory` | Retrofit: `GET api/planets?limit=30`, `DELETE api/planets/{id}` |
| `ManagerViewModel` | List + delete state |
| `ManagerScreen` | Thumbnails (Coil), name, confirm dialog, delete |
| `MainActivity` | Compose host |

Same host settings as the drawing app (`kidsGalaxyDebugServerHost` /
`kidsGalaxyServerHost` via `local.properties`). Debug uses cleartext HTTP to
the local server; no mTLS on the manager yet (event LAN only).

Build (once Android SDK is available):

```bash
cd android && ./gradlew :manager:assembleDebug
```

---

## 4. What must be done next (priority order)

### 4.1 CRITICAL — restore integration tests (main is broken)

**`pi-server/tests/integration/test_api_e2e.py` on main is currently the
literal string `PLACEHOLDER_WILL_FAIL`.** That was an accidental bad push.
CI integration tests cannot pass until this file is restored.

The local working tree under `kids-galaxy-projector-live` has the correct full
content, including:

- Clamp assertion updated to `<= 30` (retention, not gallery size 12)
- New class `TestDeletePlanet` (delete success, 404, texture 404 after delete)

**Action:** replace the remote file with the local good version and push.
Do **not** push a placeholder. Verify with:

```bash
cd pi-server && PYTHONPATH=. python -m pytest tests/integration/ -q
```

### 4.2 Push remaining local test + CI updates

Still only local (or incomplete on main) last time this was written:

- Unit tests: `FakePlanetRepository.delete`, `TestDeletePlanet` in
  `tests/unit/application/test_use_cases.py`
- Unit tests: `TestDelete` in
  `tests/unit/infrastructure/test_filesystem_repository.py`
- CI ktlint path should include manager sources:

```yaml
/tmp/ktlint --relative --editorconfig=.editorconfig \
  "app/src/**/*.kt" "manager/src/**/*.kt"
```

(remote still only has `"app/src/**/*.kt"`).

### 4.3 Verify CI green end-to-end

After 4.1–4.2:

```bash
cd pi-server && ruff check . --config ruff.toml
# ... hadolint, shellcheck ...
cd android && ktlint --relative --editorconfig=.editorconfig \
  "app/src/**/*.kt" "manager/src/**/*.kt"
make arch
cd pi-server && PYTHONPATH=. python -m pytest tests/ -q
cd android && ./gradlew testDebugUnitTest assembleDebug
# also: ./gradlew :manager:assembleDebug
```

Confirm the GitHub Actions run on main is fully green (lint, arch, unit,
integration, Android, Docker).

### 4.4 Optional polish (not blocking)

- Manager mTLS for field use (today: cleartext debug / simple HTTPS release).
- Document the manager app in `README.md` / `DEVELOPMENT.md` (how to install
  the second APK on a volunteer phone/tablet).
- Per-planet labels on the projector, richer arrival animations.
- Dependency versions stay pinned to the set from `7d70397` unless the owner
  asks to bump them.

---

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
cd android && ./gradlew testDebugUnitTest assembleDebug
cd android && ./gradlew :manager:assembleDebug
```

**ktlint must be exactly 1.5.0.**

### 5.3 Environment notes

- Gradle often cannot run in constrained cloud agents; Kotlin changes are
  verified by CI. Review Gradle Kotlin DSL carefully before pushing.
- Owner preference: **push straight to main** when the tree is green. Small
  CI-green commits.
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
- Never push placeholder content to a real source file on main.
- List `max_limit` is retention (30) for the API ceiling; projector still uses 12.

---

## 7. Suggested first actions for the next agent

1. **Restore** `pi-server/tests/integration/test_api_e2e.py` from the local good
   copy (see §4.1). Run the integration suite.
2. Push unit-test updates for `delete` and the CI ktlint manager path (§4.2).
3. Confirm Actions green on main (§4.3).
4. Optionally document and smoke-test `:manager:assembleDebug` against a running
   `docker compose` server.

Stop and hand off again if anything above is still red before starting new
feature work.
