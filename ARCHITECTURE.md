# Architecture

The server and Android applications follow clean-architecture layering: dependencies
point inwards, and the innermost layer knows nothing about frameworks. The projector
is a browser runtime with a different shape, but its composition rules and offline
boundary are also explicit and enforced.

```
        ┌──────────────────────────────────────────┐
        │  api / ui          (FastAPI, Compose)    │  ← transport, rendering
        ├──────────────────────────────────────────┤
        │  application       (use cases)           │  ← orchestration
        ├──────────────────────────────────────────┤
        │  domain            (rules, entities)     │  ← no framework imports
        └──────────────────────────────────────────┘
                     ▲
        ┌────────────┴─────────────────────────────┐
        │  infrastructure / data  (adapters)       │  implements the ports
        └──────────────────────────────────────────┘
```

The rule that makes this real: **the domain imports nothing outward.** It is
enforced in CI (`architecture` job) and locally with `make arch`, so the
boundary cannot erode quietly.

## Pi server (`pi-server/`)

| Path | Responsibility | May import |
|------|----------------|------------|
| `app/domain/` | Planet entity, naming rules, image acceptance rules, error types | stdlib only |
| `app/application/` | Use cases for submit/read/delete/export orchestration | domain, ports |
| `app/ports.py` | Abstract repositories, publishers, rate limiting, image/export services | domain |
| `app/infrastructure/` | Filesystem storage, Pillow processing/export, in-memory pub/sub and rate limiting | domain, ports, libraries |
| `app/api/` | FastAPI routing; maps domain errors to HTTP status codes | everything inward |
| `app/factory.py` | Composition root: chooses adapters and wires them together | everything |
| `main.py` | ASGI entry point (`app = create_app()`) | factory |

Why it is shaped this way:

- **The domain is framework-free**, so the rules that matter are tested without
  HTTP, disk, or Pillow.
- **Use cases depend on ports, not adapters.** Application behavior is tested
  against fakes, including ordering guarantees.
- **The API layer is thin.** It reads the request, calls a use case, and
  translates domain/application outcomes into HTTP responses.

### Request flow for an upload

```
POST /api/upload
  → api/routes         size guard, read bounded body
  → SubmitPlanetUseCase
      rate_limiter.check()          (cheapest rejection first)
      domain rules                  content type, magic bytes, size
      image_processor               re-encode → strips hostile metadata
      repository.save()             image + sidecar JSON
      repository.prune()            bound disk usage
      publisher.publish()           push to connected projectors
  → 200 with the planet payload
```

## Android drawing app (`android/app/src/main/kotlin/com/kidsgalaxy/`)

| Path | Responsibility | May import |
|------|----------------|------------|
| `domain/model/` | `Drawing`, `StrokePath`, `Point`, `CanvasSize`, planet design choices | Kotlin stdlib only |
| `domain/render/TextureProjection.kt` | Canvas → texture coordinate mathematics | Kotlin stdlib only |
| `domain/repository/`, `domain/render/PlanetTextureRenderer.kt` | Ports | domain |
| `domain/usecase/` | Send-planet orchestration | domain |
| `data/remote/` | Retrofit API + mTLS-capable OkHttp client | domain, libraries |
| `data/render/` | Android texture renderer | domain, Android |
| `data/repository/` | Retrofit repository adapter | domain, libraries |
| `presentation/` | ViewModel and UI state | domain |
| `ui/` | Compose screens and Android-facing value conversion | presentation, domain |
| `di/ServiceLocator.kt` | Composition root | everything |

Two deliberate choices:

- **The domain uses `Point` and an ARGB `Int`** rather than Compose's `Offset`
  and `Color`, keeping it independent of the UI toolkit.
- **The ViewModel receives use cases** rather than building transport objects,
  so its state machine is testable without Android networking.

A hand-rolled `ServiceLocator` is used rather than Hilt because the graph is
small and explicit.

## Manager and shared connection modules

`android/manager` is a separate authority-bearing application. It owns the
volunteer/admin UI and the planet-management API adapter; it does not share UI
or application state with the kid app. `android/connection` contains connection
and certificate plumbing that is shared where appropriate.

Transport policy is build-type specific:

- **Debug manager builds** may use cleartext HTTP for bench development.
- **Release manager builds** use HTTPS and present the role-specific
  `manager.p12` identity through `MutualTls`.
- Release network security does not permit cleartext fallback. A broken secure
  configuration must fail rather than silently downgrade administration calls.

The TLS gateway derives the manager role from the verified client certificate;
request headers alone cannot promote a client into that role.

## Projector runtime (`pi-server/static/`)

The projector is a first-class subsystem rather than an incidental static page.
It is intentionally offline and is exercised in a real Chromium/WebGL runtime
by Projector CI.

| Path | Responsibility |
|------|----------------|
| `galaxy.js` | Browser composition root and render loop |
| `projector/PlanetRenderPipeline.js` | Validates and installs the named, ordered planet-render stages |
| `projector/PlanetEntity.js` | Planet object/lifecycle surface extended by rendering stages |
| `projector/GalaxyScene.js`, `GalaxyEnvironment.js` | Scene, lighting, background/environment composition |
| `projector/CameraController.js` | Camera and OrbitControls behavior |
| `projector/PlanetLoader.js`, `PlanetAnimator.js` | Planet loading, lifecycle and animation |
| `projector/ProjectorBehaviorController.js` | Runtime display/behavior policy |
| `projector/*Artwork*.js`, `*Finish.js`, feature modules | Kid-art projection, geometry, materials and feature stages |

### Projector composition rules

Planet rendering has accumulated specialized stages over time. Some of those
legacy stages still extend `PlanetEntity` at runtime. That mutation is technical
debt, but **the order is no longer implicit**: every active installer is named
and declared once in `PLANET_RENDER_STAGES` in `galaxy.js`, then installed by
`PlanetRenderPipeline`.

Rules for future work:

1. Add/reorder an active planet-render stage only in `PLANET_RENDER_STAGES`.
2. Keep stage names unique and treat their order as part of the visual contract.
3. Prefer new explicit collaborators/context transforms over adding more
   prototype wrappers; migrate legacy installers incrementally when touching
   them rather than performing a high-risk whole-project rewrite.
4. Remove superseded renderer modules instead of leaving alternate dormant
   implementations beside the live path.
5. Keep every projector runtime asset self-hosted. `make arch`, main CI and
   Projector CI scan `index.html`, `galaxy.js`, and `static/projector/` for
   public-network references.
6. Run the browser/WebGL contracts for visual changes. The core
   `check_projector.py` smoke contract is a required Projector CI step.

This gives the projector an enforceable boundary while allowing the remaining
runtime-extension debt to be reduced safely, stage by stage.

## Testing strategy

| Suite | Location | Speed | What it proves |
|-------|----------|-------|----------------|
| Python domain | `pi-server/tests/unit/domain/` | instant | Rules in isolation |
| Python application | `pi-server/tests/unit/application/` | instant | Orchestration, via fakes |
| Python infrastructure | `pi-server/tests/unit/infrastructure/` | fast | Real disk, real Pillow, injected clock |
| Python integration | `pi-server/tests/integration/` | fast | HTTP contract end to end |
| Kotlin domain | `android/app/src/test/.../domain/` | instant | Projection math, drawing rules |
| Kotlin presentation | `android/app/src/test/.../presentation/` | instant | ViewModel state machine |
| Android connection | `android/connection/src/test/` | fast | Shared connection/discovery behavior |
| Projector JavaScript syntax/offline | `projector-ci.yml` | fast | Every active ES module parses and stays self-hosted |
| Projector browser/WebGL | `scripts/check_projector.py` and focused renderer checks | slower | Real scene boot, kid geometry, coverage, ring/body fidelity |

Run the normal application gates with `make verify`. Run the projector contract
locally with `make check-projector`; Projector CI runs the browser contracts on
every push/PR to protected development branches.
