# Kids Galaxy Projector 🌍🚀

A complete, kid-friendly system where children draw a planet on an Android tablet and watch it appear live in a projected 3D galaxy on a Raspberry Pi connected to a projector.

**Target age**: 4–10 years  
**Hardware**: Android tablet (kiosk / single-app) + Raspberry Pi 4/5 + HDMI projector  
**Network**: Local only  
**Auth**: Certificate-based (mTLS) – no password, no user, no token at runtime

**Repository**: https://github.com/Leon-Barriault/kids-galaxy-projector

---

## Getting the code (download)

### Option A — Clone with Git (recommended)

```bash
git clone https://github.com/Leon-Barriault/kids-galaxy-projector.git
cd kids-galaxy-projector
```

### Option B — Download ZIP (no Git required)

1. Open the repository: [https://github.com/Leon-Barriault/kids-galaxy-projector](https://github.com/Leon-Barriault/kids-galaxy-projector)
2. Click the green **Code** button
3. Choose **Download ZIP**
4. Unzip the archive on your machine

You will then have the full project tree (`android/`, `pi-server/`, `docker-compose.yml`, scripts, docs, etc.).

---

## Highlights (production-oriented, SDLC-aligned)

| Concern | Approach |
|---------|----------|
| Local development without hardware | Docker Compose (`docker compose up --build`) |
| Offline operation | Three.js is vendored locally — the projector needs no internet |
| Live updates | Server-Sent Events push each planet instantly (polling fallback) |
| Certificate authentication | Mutual TLS, wired on both server **and** tablet |
| Android as the only app | Lock Task Mode + Device Owner / COSU support |
| Architecture | Clean architecture on both sides; boundaries enforced in CI |
| Code quality | 123 Python tests + Kotlin JVM tests, 96% server coverage, GitHub Actions CI |
| SDLC alignment | Lint, architecture, tests and Android build all gate every change |

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the layering and testing strategy,
and **[DEVELOPMENT.md](DEVELOPMENT.md)** for local testing, certificates, kiosk
setup, and the project Definition of Done.

---

## Project Structure

```
kids-galaxy-projector/
├── android/                     # Native Android app (Kotlin + Compose, kiosk-ready)
│   ├── gradlew                  # Gradle wrapper (reproducible builds)
│   └── app/src/
│       ├── main/kotlin/com/kidsgalaxy/
│       │   ├── domain/          # Rules + entities (no Android imports)
│       │   ├── data/            # Retrofit, mTLS, Bitmap rendering
│       │   ├── presentation/    # ViewModel + UI state
│       │   ├── ui/              # Compose screens
│       │   └── di/              # Composition root
│       └── test/                # JVM unit tests (no emulator needed)
├── pi-server/                   # FastAPI backend + Three.js galaxy
│   ├── main.py                  # ASGI entry point (app = create_app())
│   ├── app/
│   │   ├── domain/              # Rules + entities (no FastAPI imports)
│   │   ├── application/         # Use cases
│   │   ├── ports.py             # Abstractions the use cases depend on
│   │   ├── infrastructure/      # Filesystem, Pillow, pub/sub, rate limiting
│   │   ├── api/                 # Routing + error translation
│   │   └── factory.py           # Composition root
│   ├── tests/                   # unit/{domain,application,infrastructure} + integration
│   ├── certs/                   # mTLS certificate generation (with SANs)
│   ├── static/                  # Galaxy page + vendored Three.js (offline)
│   └── uploads/
├── scripts/                     # Hotspot + Chromium kiosk helpers
├── docker-compose.yml           # Full local stack (hardware-free)
├── Makefile                     # make verify runs everything CI runs
├── .github/workflows/ci.yml     # CI: lint, architecture, tests, Android, Docker
├── ARCHITECTURE.md              # Layering + testing strategy
├── UNRELEASED.md                # Changelog staging (keep-a-changelog style)
└── DEVELOPMENT.md               # Local + SDLC guidance
```

---

## 1. Local development (no hardware)

```bash
docker compose up --build
# → http://localhost:8000
```

Run tests:

```bash
make install-dev
make test-unit          # domain / application / infrastructure (fast)
make test-integration   # end-to-end through the HTTP API
make test-android       # Kotlin JVM tests (no emulator required)
make verify             # everything CI runs: lint + architecture + all tests
```

---

## 2. Raspberry Pi (field deployment)

### Hotspot

```bash
sudo bash scripts/setup_hotspot.sh          # WPA2-PSK (default)
sudo bash scripts/setup_hotspot.sh --open   # open network (controlled local only)
```

Default SSID `KidsGalaxy`, IP usually `10.42.0.1`.

### Server

```bash
cd pi-server
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Without mTLS (dev):
uvicorn main:app --host 0.0.0.0 --port 8000
# With mTLS (recommended):
uvicorn main:app --host 0.0.0.0 --port 8443 \
  --ssl-keyfile certs/server.key \
  --ssl-certfile certs/server.crt \
  --ssl-ca-certs certs/ca.crt \
  --ssl-cert-reqs 2
```

### Projector kiosk

```bash
bash scripts/start_kiosk.sh
```

---

## 3. Certificate authentication (mTLS)

```bash
# The server IP must be baked into the certificate: Android ignores the
# Common Name and requires a subjectAltName.
cd pi-server/certs && SERVER_IP=10.42.0.1 ./generate_certs.sh
```

Then give the app its identity, and build a release APK (which uses HTTPS + mTLS):

```bash
cp pi-server/certs/client.p12 pi-server/certs/ca.crt \
   android/app/src/main/assets/
cd android && ./gradlew assembleRelease
```

Install `client.p12` + `ca.crt` on each tablet.
**No passwords or tokens are exchanged at runtime.** The PKCS#12 import password
is used only during installation.

Full details in [DEVELOPMENT.md](DEVELOPMENT.md).

---

## 4. Android app (core / kiosk)

1. Open `android/` in Android Studio.
2. Build and install.
3. For single-app mode (Device Owner):

```bash
adb shell dpm set-device-owner com.kidsgalaxy/.DeviceAdminReceiver
```

The app is designed to be the only foreground experience on the tablet (HOME category + lockTaskMode).

---

## 5. Security

- Upload size rejected **before** the body is buffered (Content-Length + bounded read)
- Magic-byte validation, then re-encoding with Pillow (drops smuggled metadata)
- Filename sanitization + UUID storage; display name kept in sidecar metadata
- Path-traversal protection (basename + containment check)
- Per-client rate limiting with bounded memory
- mTLS – certificate-based tablet authentication, implemented on both ends, with
  IP/DNS SANs so Android actually accepts the chain
- Cleartext HTTP scoped to the hotspot host only; everything else is HTTPS-only
- Request logging disabled in release builds
- Local network only by design

---

## 6. CI / Quality gates (Test Phase principle)

Every push and pull request runs:

- **Lint** – Python (ruff), Dockerfile (hadolint), shell (shellcheck), Kotlin (ktlint, whole tree)
- **Architecture** – domain layers must stay framework-free, dependencies must
  point inwards, and `static/` must not reference the public internet
- **Unit tests** – domain, application (with fakes), infrastructure
- **Integration tests** – end-to-end: upload → current-planet → serve texture → events
- **Certificates** – the generated chain must validate and carry an IP SAN
- **Android** – the app is compiled and its JVM unit tests run
- **Docker** – image builds, health check passes, vendored Three.js is served

A red pipeline blocks merge / release candidate creation.

---

## License

MIT License – free for personal and commercial use. See [LICENSE](LICENSE).
