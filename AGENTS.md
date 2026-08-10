# AGENTS.md — current handoff

Read this file before changing the repository. It records current contracts,
owner decisions, validation gates, and failure modes that have already caused
regressions.

---

## 1. What this project is

Children draw a planet on an Android tablet. It appears live in a projected 3D
galaxy running on a Raspberry Pi. The field deployment is local-network only
and uses mTLS at the tablet-facing gateway.

Deployable pieces:

| Piece | Where | Stack |
|---|---|---|
| Drawing tablet app | `android/app` | Kotlin, Jetpack Compose, AGP 9 |
| Manager app | `android/manager` | Separate `applicationId` `com.kidsgalaxy.manager` |
| Shared tablet connection | `android/connection` | Discovery, target parsing, mTLS |
| Server | `pi-server/` | FastAPI, Pillow, SSE |
| Projector page | `pi-server/static/` | Three.js r185, vendored, offline |

`README.md` covers setup, `ARCHITECTURE.md` the layering and projector
composition rules, `DEVELOPMENT.md` local/field workflow, and
`android/ANDROID_STUDIO.md` Android Studio usage.

---

## 2. Settled owner decisions

Do not re-litigate these unless the owner explicitly asks to change them.

- Gallery size is 12; server retention is up to 30 planets.
- Kid-authored shape and colour composition must remain recognizable on the
  rendered planet. The projector owns the spherical interpretation.
- New tablet uploads keep the original authored drawing and send an explicit
  body/background colour when available.
- Manager and kid tablets are separate applications.
- Print/STL actions are exposed only by the manager APK. The export endpoints
  intentionally do **not** require a manager role; app separation is the chosen
  access boundary for those two non-destructive export actions.
- Delete, clear-all, and other authority-bearing manager operations remain
  protected by the role/auth layer in secure deployments.
- STL v1 is one slicer-friendly radial planet mesh. Rings and orbiting
  companions are intentionally omitted; kid artwork becomes raised relief.

---

## 3. Architecture and security

### 3.1 Clean architecture

The Python and Android application code use inward dependencies:

- domain: rules/entities, framework-free
- application/use cases: orchestration through ports
- infrastructure/data: adapters
- API/UI: transport and presentation

`make arch` and main CI enforce the important boundaries.

### 3.2 Field transport and manager mTLS

The manager **does have mTLS support**. Do not repeat the historical claim that
it is an HTTP-only field app.

Current release path:

1. `pi-server/certs/generate_certs.sh` creates role-specific kid and manager
   identities (`client.p12` and `manager.p12`).
2. Release Android builds set `USE_MTLS=true` and HTTPS server URLs.
3. Shared `MutualTls` installs the client identity and project CA trust.
4. Secure deployment advertises `https` on port `8443` over mDNS.
5. nginx is the tablet-facing mTLS gateway; FastAPI listens on loopback `8000`.
6. The gateway overwrites trusted role headers and derives `kid` / `manager`
   from the verified client-certificate OU.

Network-security resources are split by source set:

- debug: cleartext permitted for bench/LAN development
- release (`src/main`): cleartext rejected

A secure release configuration must fail loudly rather than silently downgrade
to HTTP.

### 3.3 Projector composition

The projector is a first-class subsystem. `galaxy.js` is its composition root.
Active planet-render stages are declared once, by name and order, in
`PLANET_RENDER_STAGES` and installed by `PlanetRenderPipeline`.

Some legacy stages still extend `PlanetEntity` at runtime. That is known
technical debt. Do **not** add another scattered installer call or hidden global
patch. Prefer explicit collaborators/context transforms for new work and
migrate an existing legacy stage when touching it if that migration can be
proven by the browser/WebGL acceptance suite.

The stage order is part of the visual contract. Preserve it unless a deliberate
visual change has matching acceptance coverage.

Superseded renderer experiments should be deleted rather than left dormant
beside the live path.

---

## 4. Validation gates

Run these before considering a change complete:

```bash
cd pi-server && ruff check . --config ruff.toml
hadolint --config .hadolint.yaml pi-server/Dockerfile
shellcheck -x scripts/setup_hotspot.sh scripts/start_kiosk.sh \
    scripts/dev-up.sh pi-server/certs/generate_certs.sh
cd android && ktlint --relative --editorconfig=.editorconfig \
    "app/src/**/*.kt" "manager/src/**/*.kt" "connection/src/**/*.kt"
make arch
cd pi-server && python -m pytest tests/ -q
cd android && ./gradlew testDebugUnitTest assembleDebug
```

`assembleDebug` without a module qualifier builds both app modules, so a manager
compile error fails the pipeline.

**ktlint must be exactly 1.5.0.**

### Projector gate

Run locally when changing `pi-server/static/`:

```bash
make check-projector
```

Projector CI also installs Chromium/Playwright and runs the core
`check_projector.py` contract as a required gate, followed by the focused
sculpted-artwork, artwork-coverage, ring-colour, and explicit-body-colour checks.
The syntax job parses every active projector ES module and verifies the runtime
stays offline/self-hosted.

---

## 5. Important runtime contracts

### Planet payload (REST + SSE)

```json
{ "has_planet": true, "id": "...", "url": "/uploads/....png", "name": "...", "timestamp": 0 }
```

Gallery response:

```json
{ "planets": [ ... ] }
```

Removal event, same named SSE event `planet`:

```json
{ "has_planet": false, "id": "...", "removed": true }
```

Clear-all event:

```json
{ "has_planet": false, "cleared": true }
```

Upload success includes `planet_id`, `name`, and `url`.
Delete success includes `planet_id` and `name`.

Projector code must keep matching `url` / `name`; legacy aliases are fallback
compatibility only.

### Export routes

- `GET /api/admin/planets/{planet_id}/print.png`
- `GET /api/admin/planets/{planet_id}/model.stl?diameter_mm=...`

These routes are intentionally not role-gated by owner decision. Do not confuse
that with the destructive manager routes, which are authority-bearing.

---

## 6. Projector-specific rules

- Register a new planet in the Map **synchronously**, before its texture starts
  loading. Deferring insertion breaks dedupe, delete-while-loading, and eviction.
- Eviction is by arrival order, not image decode completion.
- Orbits are deterministic from planet id so reload/deletion does not reshuffle
  the sky.
- Keep the polling fallback alongside SSE; buffering proxies can otherwise leave
  a projector frozen.
- A restored planet must not fire a new-arrival celebration.
- Never replace `galaxy.js` wholesale to make a small change. A historical
  rewrite silently dropped OrbitControls, the star field, fog, orbit rings, and
  sparkle effects.
- Projector runtime assets must never depend on public-network URLs.
- Visual comparison scripts may provide different lighting/reference profiles,
  but they must share contracts through explicit parameters rather than
  monkey-patching imported module globals.

---

## 7. Android/UI rules

- Touch targets are intentionally at least 48dp.
- Color swatches are radio-button semantics and must have localized accessible
  names for TalkBack; keep the shared `ColorAccessibility` mapping in sync when
  adding a palette colour.
- Destructive manager actions require confirmation dialogs and clear action
  labeling.
- Debug and release transport policies differ intentionally. Do not move a
  blanket `usesCleartextTraffic=true` back into the manager manifest.

---

## 8. Traps already sprung

- Never push placeholder content into a real source/test file. One historical
  change replaced 446 lines of integration coverage and left main red across
  multiple commits.
- HTML-escaped Kotlin generics (`\u003c`) in source are invalid; push real source.
- ktlint `chain-method-continuation`: keep chained modifiers formatted exactly
  as the pinned linter expects.
- `StrokePath.strokeWidth`, not `.width`.
- Gallery JSON is an object with `planets`, not a bare array.
- SSE uses named event `planet`; listen with `addEventListener('planet', ...)`.
- `manifestPlaceholders` affect `AndroidManifest.xml`, not resource XML. Use
  source-set resource overrides for build-type-specific network policy.
- Do not infer security state from old comments. Verify build config, mTLS
  setup, discovery advertisement, gateway configuration, and tests together.
- Prefer targeted edits and inspect diffs before pushing. Projector changes are
  especially sensitive to accidental whole-file loss.

---

## 9. Current high-value follow-up work

Nothing here is required to keep the current feature set working, but these are
useful next improvements:

1. Add focused `ManagerViewModel` JVM tests; the manager has less behavioral
   unit coverage than the kid app.
2. Continue migrating legacy projector prototype-extension stages into explicit
   stage collaborators as those modules are changed for real features.
3. Keep accessibility semantics covered as new kid/manager controls are added.
4. Add per-planet projector labels / richer arrival animation only after the
   existing visual contracts stay green.

Dependency versions stay pinned unless a deliberate upgrade is requested.

---

## 10. Working method

TDD and clean architecture are the default. Prefer small, conventional commits.
Do not start or leave unrelated work while CI is red. For projector work, use
the real browser acceptance suite rather than reasoning from screenshots or
module syntax alone.
