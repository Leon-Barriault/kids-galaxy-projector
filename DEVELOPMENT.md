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
pip install -r requirements-dev.txt
pytest tests/ -v --cov=app --cov=main --cov-report=term-missing
```

From the repository root, `make verify` runs everything CI runs: lint,
architecture boundaries, both Python suites, and the Android JVM tests.

The suites are separated by cost and purpose (see [ARCHITECTURE.md](ARCHITECTURE.md)):

| Suite | What it covers |
|-------|----------------|
| `tests/unit/domain/` | Business rules in isolation — no I/O, no framework |
| `tests/unit/application/` | Use-case orchestration, driven entirely by fakes |
| `tests/unit/infrastructure/` | Real disk, real Pillow, injected clock |
| `tests/integration/` | The HTTP contract, end to end |

### Android tests

The domain and presentation layers are plain Kotlin, so they run on the JVM with
no emulator:

```bash
cd android && ./gradlew testDebugUnitTest
```

This covers the texture-projection mathematics, the drawing/undo rules, and the
whole ViewModel state machine including error wording per HTTP status.

CI runs all of the above on every push/PR (see `.github/workflows/ci.yml`).

## Architecture boundaries

The layering is enforced, not merely documented:

```bash
make arch
```

It fails the build if the Kotlin domain imports `android`/`androidx`, if either
domain layer reaches outward, if the Python domain imports FastAPI or Pillow, or
if the projector's assets reference a remote URL (which would break the offline
deployment). Read [ARCHITECTURE.md](ARCHITECTURE.md) before adding a layer.

## Offline assets

The projector runs on a Pi hotspot with **no internet access**, so Three.js is
vendored into `pi-server/static/vendor/` and served locally; the page uses a
system font stack rather than a web font. To update the pinned version:

```bash
make vendor-three
```

Never reintroduce a CDN `<script>` or `@import` — `make arch` will fail, and the
projector would render a black screen in the field.

## Certificate-based authentication (mTLS)

We use **mutual TLS** between the tablet and the server. This is:

- Passwordless
- Tokenless
- Certificate-based (exactly what you asked for)

### Generate certificates

```bash
cd pi-server/certs
chmod +x generate_certs.sh
SERVER_IP=10.42.0.1 ./generate_certs.sh          # bake the Pi's address in
# Optional overrides:
#   SERVER_DNS=kids-galaxy.local
#   CLIENT_P12_PASSWORD=<install-time secret>
#   DAYS=825
```

The server certificate carries `subjectAltName` entries for the IP **and** the
DNS name. This is not optional: modern Android and OkHttp ignore the certificate
Common Name entirely, so a certificate without a matching SAN fails the handshake
— and because the tablet connects to `10.42.0.1`, an IP SAN is what it needs. The
CA is also issued with explicit `basicConstraints=CA:TRUE`, which strict clients
require before they will treat it as an issuer.

Verify what you generated:

```bash
openssl verify -CAfile ca.crt server.crt
openssl x509 -in server.crt -noout -ext subjectAltName
```

### Run the server with mTLS enforced

```bash
uvicorn main:app --host 0.0.0.0 --port 8443 \
  --ssl-keyfile certs/server.key \
  --ssl-certfile certs/server.crt \
  --ssl-ca-certs certs/ca.crt \
  --ssl-cert-reqs 2
```

### Give the app its client certificate

The app presents its certificate from its own assets (it does not read the system
credential store), so copy both files in before building a release APK:

```bash
cp pi-server/certs/client.p12 pi-server/certs/ca.crt \
   android/app/src/main/assets/
cd android && ./gradlew assembleRelease
```

Both files are gitignored — certificates are per-deployment and must never be
committed.

How the transport is chosen: `app/build.gradle.kts` injects `SERVER_BASE_URL`,
`USE_MTLS` and `CLIENT_CERT_PASSWORD` per build type. **Debug** builds talk
cleartext HTTP to `http://<host>:8000` for lab work; **release** builds talk
HTTPS + mTLS to `https://<host>:8443`. Override per site without touching source:

```bash
./gradlew assembleRelease \
  -PkidsGalaxyServerHost=10.42.0.1 \
  -PkidsGalaxyCertPassword=<install-time secret>
```

`ApiClient` pins trust to the project CA (the Pi's certificate is self-signed, so
the system trust store would reject it) and presents `client.p12` as the client
identity. If either asset is missing, it raises a clear
`CertificateSetupException` rather than silently falling back to an
unauthenticated connection.

For a full production deployment you would issue one client certificate per
tablet (or per batch) and revoke as needed.

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
