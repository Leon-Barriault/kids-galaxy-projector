# Kids Galaxy Projector 🌍🚀

A complete, kid-friendly system where children draw a planet on an Android tablet and watch it appear live in a projected 3D galaxy on a Raspberry Pi connected to a projector.

**Target age**: 4–10 years  
**Hardware**: Android tablet (kiosk / single-app) + Raspberry Pi 4/5 + HDMI projector  
**Network**: Local only  
**Auth**: Certificate-based (mTLS) – no password, no user, no token

---

## Highlights (production-oriented)

| Concern | Approach |
|---------|----------|
| Local development without hardware | Docker Compose (`docker compose up --build`) |
| Certificate authentication | Mutual TLS between tablet and server |
| Android as the only app | Lock Task Mode + Device Owner / COSU support |
| Code quality | Unit + integration tests, GitHub Actions CI |
| SDLC alignment | Automated tests gate every change; clear DoD-style checks |

See **[DEVELOPMENT.md](DEVELOPMENT.md)** for local testing, certificates, and kiosk setup.

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
├── docker-compose.yml       # Full local stack
└── .github/workflows/ci.yml # CI pipeline
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
sudo bash scripts/setup_hotspot.sh
```

Default SSID `KidsGalaxy`, IP usually `10.42.0.1`.

### Server

```bash
cd pi-server
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
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

Run the server with client-certificate requirement (see DEVELOPMENT.md).  
Install `client.p12` + `ca.crt` on each tablet. No passwords or tokens are exchanged at runtime.

---

## 4. Android app (core / kiosk)

1. Open `android/` in Android Studio.
2. Build and install.
3. For single-app mode (Device Owner):

```bash
adb shell dpm set-device-owner com.kidsgalaxy/.DeviceAdminReceiver
```

The app is designed to be the only foreground experience on the tablet.

---

## 5. Security

- Upload size limit, magic-byte validation, re-encoding with Pillow
- Filename sanitization + UUID storage
- Path-traversal protection
- Rate limiting
- Optional mTLS (certificate-based tablet authentication)
- Local network only by design

---

## 6. CI / Quality gates

Every push and pull request runs:

- Python unit + integration tests with coverage
- Docker image build check

A red pipeline blocks merge (SDLC Test Phase principle).

---

## License

MIT License – free for personal and commercial use.

**Repository**: https://github.com/Leon-Barriault/kids-galaxy-projector
