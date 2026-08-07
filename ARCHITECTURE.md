# Architecture

Both applications follow the same clean-architecture layering: dependencies
point inwards, and the innermost layer knows nothing about frameworks.

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
| `app/application/` | Use cases: `SubmitPlanetUseCase`, `GetCurrentPlanetUseCase` | domain, ports |
| `app/ports.py` | Abstract `PlanetRepository`, `EventPublisher`, `RateLimiter`, `ImageProcessor` | domain |
| `app/infrastructure/` | Filesystem storage, Pillow processing, in-memory pub/sub and rate limiting | domain, ports, libraries |
| `app/api/` | FastAPI routing; maps domain errors to HTTP status codes | everything inward |
| `app/factory.py` | Composition root: chooses adapters and wires them together | everything |
| `main.py` | ASGI entry point, three lines (`app = create_app()`) | factory |

Why it is shaped this way:

- **The domain is framework-free**, so the rules that matter (what counts as a
  valid drawing, what the projector displays) are tested without HTTP, disk, or
  Pillow. That suite runs in well under a second.
- **Use cases depend on ports, not adapters.** `SubmitPlanetUseCase` is tested
  entirely against fakes, which is how ordering guarantees — cooldown before
  image work, storage before notification — are verified.
- **The API layer is thin.** It reads the request, calls a use case, and
  translates `DomainError` into a status code. No business logic.

### Request flow for an upload

```
POST /api/upload
  → api/routes         size guard, read bounded body
  → SubmitPlanetUseCase
      rate_limiter.check()          (cheapest rejection first)
      domain rules                  content type, magic bytes, size
      image_processor               re-encode → strips hostile metadata
      repository.save()             image + sidecar JSON (display name)
      repository.prune()            bound disk usage
      publisher.publish()           push to connected projectors
  → 200 with the planet payload
```

## Android app (`android/app/src/main/kotlin/com/kidsgalaxy/`)

| Path | Responsibility | May import |
|------|----------------|------------|
| `domain/model/` | `Drawing`, `StrokePath`, `Point`, `CanvasSize` | Kotlin stdlib only |
| `domain/render/TextureProjection.kt` | Canvas → texture coordinate mathematics | Kotlin stdlib only |
| `domain/repository/`, `domain/render/PlanetTextureRenderer.kt` | Ports | domain |
| `domain/usecase/` | `SendPlanetUseCase` | domain |
| `data/remote/` | Retrofit API + mTLS-capable OkHttp client | domain, libraries |
| `data/render/` | `AndroidPlanetTextureRenderer` (the only `android.graphics` user) | domain, Android |
| `data/repository/` | `RetrofitPlanetRepository` implements the port | domain, libraries |
| `presentation/` | `DrawingViewModel`, `DrawingUiState` | domain |
| `ui/` | Compose screens; converts `Point`/ARGB ↔ `Offset`/`Color` | presentation, domain |
| `di/ServiceLocator.kt` | Composition root | everything |

Two deliberate choices:

- **The domain uses `Point` and an ARGB `Int`** rather than Compose's `Offset`
  and `Color`. That keeps the layer free of the UI toolkit, which is what lets
  the projection mathematics and the drawing rules be unit-tested on the JVM
  with no emulator.
- **`DrawingViewModel` receives a use case** instead of building its own HTTP
  client from a `Context`. Its whole state machine — double-tap suppression,
  error wording per HTTP status, undo/clear — is therefore testable in
  milliseconds (`DrawingViewModelTest`).

A hand-rolled `ServiceLocator` is used rather than Hilt: the graph is three
objects deep, and the annotation processor would cost more build time than the
indirection saves.

## Testing strategy

| Suite | Location | Speed | What it proves |
|-------|----------|-------|----------------|
| Python domain | `pi-server/tests/unit/domain/` | instant | Rules in isolation |
| Python application | `pi-server/tests/unit/application/` | instant | Orchestration, via fakes |
| Python infrastructure | `pi-server/tests/unit/infrastructure/` | fast | Real disk, real Pillow, injected clock |
| Python integration | `pi-server/tests/integration/` | fast | HTTP contract end to end |
| Kotlin domain | `android/app/src/test/.../domain/` | instant | Projection math, drawing rules |
| Kotlin presentation | `android/app/src/test/.../presentation/` | instant | ViewModel state machine |

Run everything with `make verify` (lint, architecture gates, both Python suites,
Android JVM tests).
