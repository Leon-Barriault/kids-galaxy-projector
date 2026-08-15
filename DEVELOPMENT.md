# Local Development & Testing (no dedicated hardware required)

This project is designed so you can develop and test without dedicated server hardware or a projector.

The backend is platform-neutral and is referred to as the **server side**. The repository path `pi-server/` is historical and retained for compatibility with existing scripts and tooling; it does not imply a Raspberry Pi runtime requirement.

## Quick start (Docker)

```bash
# From the repository root
docker compose up --build
```

- API + galaxy page: http://localhost:8000  
- Health: http://localhost:8000/health  
- Optional projector mock: `docker compose --profile full up` → http://localhost:8080

Point the Android emulator or a real tablet on the same network to `http://<your-host-ip>:8000/`.

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
if any active projector module references a remote URL that would break offline
operation. Read [ARCHITECTURE.md](ARCHITECTURE.md) before adding a layer.

## Offline assets

The projector is designed to operate on a local network with no internet access,
so Three.js is vendored into `pi-server/static/vendor/` and served locally; the
page uses a system font stack rather than a web font. To update the pinned version:

```bash
make vendor-three
```

Never reintroduce a CDN `<script>` or `@import` — `make arch` will fail, and the
projector could render a black screen in an offline field deployment.

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

- `server.crt` / `server.key` — server-side gateway identity
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

The application-level mTLS boundary is independent of the Wi-Fi or LAN technology.
The system may run on an existing private LAN, dedicated Wi-Fi, or another local
network topology without changing the server-side architecture.

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

The canonical branching policy is documented in [BRANCHING.md](BRANCHING.md).
The repository uses a lightweight GitFlow-style lifecycle:

```text
feature/*  fix/*  docs/*  experiment/*
                │
                ▼
             develop
                │
                ▼
          release/x.y.z
                │
                ▼
              main
                │
                ▼
             vX.Y.Z
```

### `develop`

`develop` is the integration branch for the next release. Normal features,
fixes, documentation, and approved experimental work branch from `develop` and
return to it through pull requests.

A green `develop` means the integrated development state passes automated gates;
it does **not** by itself mean the version is field-ready.

### `release/x.y.z`

Create a temporary release branch from `develop` when the intended feature set
is complete. During release stabilization, allow only:

- release-blocking fixes;
- version/release metadata;
- documentation corrections;
- deployment and physical-device validation corrections.

Do not add new features to a release branch.

When validation is complete, merge the release branch into `main`, tag the
release, merge the release fixes back into `develop`, and delete the release
branch.

### `main`

`main` is production/field-ready. Normal development must not happen directly on
`main`. A merge to `main` should correspond to a version that is safe to deploy.

Urgent released-version corrections use a temporary `hotfix/x.y.z` branch from
`main`, and the fix must also be merged back into `develop`.

### Definition of Done

- Every change keeps CI green: lint, architecture, unit, integration, Android,
  security, and applicable projector gates.
- Short-lived branches are deleted after merge.
- Release candidates receive the required server-side, tablet, projector,
  print, and STL validation before promotion to `main`.
- Release changes are tagged on `main` using semantic version tags such as
  `v1.2.0`.
- A red pipeline blocks integration or release promotion.
