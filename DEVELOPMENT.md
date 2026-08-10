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

From the repository root, `make verify` runs the normal application gates: lint,
architecture boundaries, both Python suites, and Android JVM tests.

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

This covers the texture-projection mathematics, drawing/undo rules, ViewModel
state, and the shared connection module.

### Projector tests

The projector requires a real browser/WebGL runtime. Run the core smoke contract
locally with:

```bash
make check-projector
```

Projector CI installs Chromium/Playwright and runs that core contract plus the
focused sculpted-artwork, coverage, ring-color and explicit-body-color checks.
These are required CI gates, not documentation-only manual steps.

## Architecture boundaries

The layering is enforced, not merely documented:

```bash
make arch
```

It fails the build if the Kotlin domain imports `android`/`androidx`, if either
domain layer reaches outward, if the Python domain imports FastAPI or Pillow, or
if any active projector module references a remote URL (which would break the
offline deployment). Read [ARCHITECTURE.md](ARCHITECTURE.md) before adding a layer.

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

We use **mutual TLS** for field/release tablet traffic. The kid and manager apps
have separate role-specific client identities.

### Generate certificates

```bash
cd pi-server/certs
chmod +x generate_certs.sh
SERVER_IP=10.42.0.1 ./generate_certs.sh
# Optional overrides:
#   SERVER_DNS=kids-galaxy.local
#   CLIENT_P12_PASSWORD=<kid-install-secret>
#   MANAGER_P12_PASSWORD=<manager-install-secret>
#   DAYS=825
```

The generator creates:

- `server.crt` / `server.key` — gateway identity
- `client.crt` / `client.p12` — drawing tablet identity (`OU=kid`)
- `manager.crt` / `manager.p12` — manager identity (`OU=manager`)
- `ca.crt` / `ca.key` — deployment CA

The server certificate carries `subjectAltName` entries for the IP **and** DNS
name. Modern Android/OkHttp validate SANs rather than relying on Common Name.

Verify what you generated:

```bash
openssl verify -CAfile ca.crt server.crt
openssl verify -CAfile ca.crt client.crt
openssl verify -CAfile ca.crt manager.crt
openssl x509 -in server.crt -noout -ext subjectAltName
```

### Run the field gateway with mTLS enforced

The production deployment is intended to sit behind the local mTLS gateway so
verified certificate information can be translated into the trusted role marker
used by the FastAPI auth layer. Do not expose the authority-bearing API directly
on an untrusted event network.

For direct TLS testing, a server can be started with a required client
certificate:

```bash
uvicorn main:app --host 0.0.0.0 --port 8443 \
  --ssl-keyfile certs/server.key \
  --ssl-certfile certs/server.crt \
  --ssl-ca-certs certs/ca.crt \
  --ssl-cert-reqs 2
```

### Give each app its client certificate

Both apps read their certificate from application assets rather than the Android
system credential store. Copy the deployment-specific material before release
builds:

```bash
mkdir -p android/app/src/main/assets android/manager/src/main/assets
cp pi-server/certs/client.p12 pi-server/certs/ca.crt \
   android/app/src/main/assets/
cp pi-server/certs/manager.p12 pi-server/certs/ca.crt \
   android/manager/src/main/assets/
```

These files are gitignored and must never be committed.

Build release APKs with the matching password properties:

```bash
cd android
./gradlew :app:assembleRelease \
  -PkidsGalaxyServerHost=10.42.0.1 \
  -PkidsGalaxyCertPassword=<kid-install-secret>

./gradlew :manager:assembleRelease \
  -PkidsGalaxyServerHost=10.42.0.1 \
  -PkidsGalaxyCertPassword=<manager-install-secret>
```

Both modules inject `SERVER_BASE_URL`, `USE_MTLS` and the certificate password by
build type. **Debug** builds use cleartext HTTP for lab work and their debug-only
network-security policy permits it. **Release** builds use HTTPS + mTLS and their
main network-security policy rejects cleartext fallback.

The kid app presents `client.p12`; the manager app presents `manager.p12`. The
shared `MutualTls` implementation pins trust to the project CA and installs the
client identity. Missing or invalid deployment assets fail setup rather than
silently downgrading to unauthenticated transport.

For production deployments, issue distinct certificates per tablet or batch and
rotate/revoke them as operational needs require.

> **Note on Wi-Fi itself**: A full EAP-TLS (WPA2-Enterprise) hotspot on the Pi is possible with hostapd + FreeRADIUS, but it is significantly more operationally heavy for a portable kids setup. mTLS protects the application path, which is the critical trust boundary. An optional EAP-TLS guide can be added later if required.

## Android kiosk / single-app mode

The kid app is intended to be the **only** application on its tablet
(Corporate-Owned Single-Use / COSU style).

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
- Every change should keep the CI green (unit + integration + projector gates).
- Update `UNRELEASED.md` (or CHANGELOG) when the project adopts changelog-driven releases.
- A red pipeline blocks merge / release candidate creation.
