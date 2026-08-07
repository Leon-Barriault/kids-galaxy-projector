# Local Development & Testing (no hardware required)

This project is designed so you can develop and test **without a Raspberry Pi or projector**.

## Quick start (Docker)

```bash
# From the repository root
docker compose up --build
```

- API + galaxy page: http://localhost:8000  
- Health: http://localhost:8000/health  
- Optional projector mock: `docker compose --profile full up` → http://localhost:8080

Point the Android emulator or a real tablet (on the same machine network) to `http://<your-host-ip>:8000/`.

## Running tests

```bash
cd pi-server
python -m venv venv
source venv/bin/activate   # or Windows equivalent
pip install -r requirements.txt
pytest tests/ -v --cov=. --cov-report=term-missing
```

CI runs the same suite on every push/PR (see `.github/workflows/ci.yml`).

## Certificate-based authentication (mTLS)

We use **mutual TLS** between the tablet and the server. This is:

- Passwordless
- Tokenless
- Certificate-based (exactly what you asked for)

### Generate certificates

```bash
cd pi-server/certs
chmod +x generate_certs.sh
./generate_certs.sh
```

### Run the server with mTLS enforced

```bash
uvicorn main:app --host 0.0.0.0 --port 8443 \
  --ssl-keyfile certs/server.key \
  --ssl-certfile certs/server.crt \
  --ssl-ca-certs certs/ca.crt \
  --ssl-cert-reqs 2
```

### Install the client certificate on tablets

1. Copy `client.p12` and `ca.crt` to the tablet.
2. Install the PKCS#12 (password: `KidsGalaxy`) into the Android credential store / user certificates.
3. Configure the app (or a Managed Configuration) to use the client certificate for HTTPS.

For a full production deployment you would issue one client certificate per tablet (or per batch) and revoke as needed.

> **Note on Wi-Fi itself**: A full EAP-TLS (WPA2-Enterprise) hotspot on the Pi is possible with hostapd + FreeRADIUS, but it is significantly more operationally heavy for a portable kids setup. mTLS protects the application path, which is the critical trust boundary. An optional EAP-TLS guide can be added later if required.

## Android kiosk / single-app mode

The app is intended to be the **only** application on the tablet (Corporate-Owned Single-Use / COSU style).

### Development / lab (ADB)

```bash
# After factory reset / no Google account
adb install -r app-debug.apk
adb shell dpm set-device-owner com.kidsgalaxy/.DeviceAdminReceiver
```

Then start Lock Task Mode from the app (or set `android:lockTaskMode="if_whitelisted"`).

### Production

Use Android Enterprise (zero-touch or QR enrollment) with a Device Policy Controller that:

- Sets the app as the preferred home / launcher
- Allowlists only this package for Lock Task Mode
- Restricts settings, notifications, and other apps

See `android/.../AndroidManifest.xml` and the Device Admin receiver for the hooks.

## Branching & Definition of Done (SDLC alignment)

- Prefer `main` (production-ready) + short-lived feature branches.
- Every change should keep the CI green (unit + integration).
- Update `UNRELEASED.md` (or CHANGELOG) when the project adopts changelog-driven releases.
- A red pipeline blocks merge / release candidate creation.
