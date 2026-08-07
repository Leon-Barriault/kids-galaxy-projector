# Kids Galaxy Projector 🌍🚀

A complete, kid-friendly system where children draw a planet on an Android tablet and watch it appear live in a projected 3D galaxy on a Raspberry Pi connected to a projector.

**Target age**: 4–10 years  
**Hardware**: Android tablet (kiosk / single-app) + Raspberry Pi 4/5 + HDMI projector  
**Network**: Local only  
**Auth**: Certificate-based (mTLS) – no password, no user, no token at runtime

---

## Highlights (production-oriented, SDLC-aligned)

| Concern | Approach |
|---------|----------|
| Local development without hardware | Docker Compose (`docker compose up --build`) |
| Certificate authentication | Mutual TLS between tablet and server |
| Android as the only app | Lock Task Mode + Device Owner / COSU support |
| Code quality | Unit + integration tests (17+), GitHub Actions CI |
| SDLC alignment | Automated tests gate every change; UNRELEASED.md; clear DoD-style checks; changelog-driven |

See **[DEVELOPMENT.md](DEVELOPMENT.md)** for local testing, certificates, kiosk setup, and project Definition of Done.

---

## Project Structure

```
kids-galaxy-projector/
├── android/                 # Native Android app (Kotlin + Jetpack Compose, kiosk-ready)
├── pi-server/               # FastAPI backend + Three.js galaxy
│   ├── main.py
│   ├── Dockerfile
│   ├── tests/               # Unit + integration tests
│   ├── certs/               # mTLS certificate generation
│   ├── static/              # Galaxy web page
│   └── uploads/
├── scripts/                 # Hotspot + Chromium kiosk helpers
├── docker-compose.yml       # Full local stack (hardware-free)
├── .github/workflows/ci.yml # CI pipeline (tests + Docker build)
├── UNRELEASED.md            # Changelog staging (keep-a-changelog style)
└── DEVELOPMENT.md           # Local + SDLC guidance
```

---

## 1. Local development (no hardware)

```bash
docker compose up --build
# → http://localhost:8000
```

Run tests:

```bash
cd pi-server && pip install -r requirements.txt && pytest tests/ -v --cov=.
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
cd pi-server/certs && ./generate_certs.sh
```

Install `client.p12` + `ca.crt` on each tablet.  
**No passwords or tokens are exchanged at runtime.** The PKCS#12 import password is used only during installation.

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

- Upload size limit, magic-byte validation, re-encoding with Pillow
- Filename sanitization + UUID storage
- Path-traversal protection
- Rate limiting
- Optional (recommended) mTLS – certificate-based tablet authentication
- Local network only by design

---

## 6. CI / Quality gates (Test Phase principle)

Every push and pull request runs:

- Python unit + integration tests with coverage
- Docker image build check

A red pipeline blocks merge / release candidate creation.

---

## License

MIT License – free for personal and commercial use. See [LICENSE](LICENSE).

**Repository**: https://github.com/Leon-Barriault/kids-galaxy-projector
