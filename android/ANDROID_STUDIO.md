# Running and debugging the tablet app in Android Studio

Everything here has been reconstructed from what the CI pipeline actually did,
including the failures. The app builds and its unit tests pass on CI, but nobody
has yet run it on a real device — so treat the device sections as the first run,
not a regression check.

---

## 1. What you need installed

| Requirement | Version | Why this exact thing |
|---|---|---|
| Android Studio | **Quail 3 (2026.1.3)** or newer | AGP 9.3 refuses to load in older Studio versions |
| JDK | 17 or 21 — Studio's bundled JBR is fine | Bytecode target is 17 and CI builds on 17; 24+ runs ahead of AGP |
| Android SDK Platform | **API 37** | `androidx.lifecycle` 2.11 requires compiling against 37 |
| Android SDK Platform | API 26 | `minSdk`, needed for the oldest emulator you'll test |
| Gradle | 9.6.1 — **don't install it** | The wrapper downloads it; use `./gradlew`, never a local `gradle` |

Install the SDK platforms via **Settings → Languages & Frameworks → Android SDK
→ SDK Platforms**, ticking *Show Package Details* so you can select API 37
precisely.

There is no Kotlin plugin to install or configure. AGP 9 ships **built-in Kotlin**,
which is why `org.jetbrains.kotlin.android` is deliberately absent from the build
files. If you ever see advice to add it back, that advice predates AGP 9 and will
break the build with a "not compatible with AGP's 9.0 new DSL" error.

## 2. Opening the project

Open the **`android/`** directory, not the repository root. The repo root is not
a Gradle project — it holds the Pi server too — and pointing Studio at it gives a
confusing half-imported state.

```
File → Open → <repo>/android
```

First sync downloads Gradle 9.6.1 and the whole dependency graph; expect a few
minutes. If the sync fails, check that first, before anything else — nearly every
problem in this project so far has been a configuration problem, not a code one.

## 3. Run the unit tests first

Do this before touching a device. These are plain JVM tests — no emulator, no
hardware — and they cover the parts most likely to be wrong.

**From the IDE** (simplest — no environment setup at all): right-click
`app/src/test/kotlin` → **Run 'Tests in kotlin'**. Studio supplies its own JDK
and SDK configuration, so nothing needs to be on your `PATH`.

**From a terminal:**

```bash
cd android
./gradlew testDebugUnitTest      # Windows: .\gradlew.bat testDebugUnitTest
```

### If the terminal run fails before Gradle even starts

Two errors are near-universal on a first terminal run. Neither means anything is
wrong with the project.

**`JAVA_HOME is not set and no 'java' command could be found`**

Gradle needs a JDK. You don't have to install one — Android Studio bundles a
runtime. Find its exact location in Studio under **Settings → Build, Execution,
Deployment → Build Tools → Gradle → Gradle JDK**, then:

```powershell
# Windows (PowerShell), current session
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

# Windows, persist for future sessions (then reopen the terminal)
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
```

```bash
# macOS
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
# Linux
export JAVA_HOME="$HOME/android-studio/jbr"
```

Use JDK 17 or 21. CI builds on 17 and the project targets 17 bytecode; JDK 24+
runs ahead of AGP's supported range and fails in ways that are tedious to
diagnose.

Note that installing a JDK does not update an already-open terminal — reopen it,
or the `java` command will still appear missing.

**`SDK location not found`**

Gradle also needs the Android SDK path, which Studio knows but a bare terminal
does not. Opening the project in Studio once writes `android/local.properties`
for you. Otherwise start from the committed template — it already carries the
local-debug server defaults, so you only have to supply the SDK path:

```powershell
cd android
Copy-Item local.properties.example local.properties   # macOS/Linux: cp
```

Java `.properties` escaping bites on Windows: both the backslashes *and* the
colon after the drive letter need escaping.

```properties
sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

Rather than counting backslashes, let PowerShell generate the line:

```powershell
"sdk.dir=" + ($env:LOCALAPPDATA + "\Android\Sdk").Replace("\", "\\").Replace(":", "\:") |
    Add-Content local.properties
```

**If your Windows username contains an accented or non-ASCII character**, do not
put it in this file. Gradle reads `.properties` as ISO-8859-1, so a UTF-8 `é`
arrives as `Ã©` and the SDK is reported missing with a path that looks correct
in your editor. Two ways round it — either set the environment variable and
leave `sdk.dir` out of the file entirely:

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
```

or use the 8.3 short form of the path, which is pure ASCII (`dir /x %USERPROFILE%\..`
shows it):

```properties
sdk.dir=C\:\\Users\\LONBAR~1\\AppData\\Local\\Android\\Sdk
```

`local.properties` is gitignored on purpose: it is machine-specific and must
never be committed. `local.properties.example` is the committed copy.

Four suites, all fast:

- `domain/TextureProjectionTest` — the canvas→texture mapping: aspect preserved,
  symmetric letterboxing, centre maps to centre, stroke width scales.
- `domain/DrawingTest` — stroke history, undo, clear, taps ignored.
- `domain/SendPlanetUseCaseTest` — upload rules driven by a fake repository.
- `presentation/DrawingViewModelTest` — the whole state machine: double-tap
  suppression, error wording per HTTP status, dialog dismissal.

HTML report: `app/build/reports/tests/testDebugUnitTest/index.html`.

If you want a debugger in these, set a breakpoint and use **Debug** rather than
Run — they're ordinary JVM tests, so stepping works normally.

## 4. Point the app at a server

The app never hard-codes a URL. `ApiClient` reads `BuildConfig.SERVER_BASE_URL`,
which the build generates per variant:

| Variant | URL | Transport |
|---|---|---|
| `debug` | `http://<host>:8000/` | Cleartext, for the lab |
| `release` | `https://<host>:8443/` | HTTPS + mTLS |

`<host>` defaults to `10.42.0.1` — the Pi hotspot, i.e. the *deployed*
configuration, which is not what you want at a desk. Override it without
editing source: copy the template once and you have the local-debug setup
already filled in.

```powershell
cd android
Copy-Item local.properties.example local.properties   # macOS/Linux: cp
```

That sets `kidsGalaxyServerHost=10.0.2.2`. **`10.0.2.2` is how the Android
emulator reaches your development machine's localhost** — so it pairs with a
server running in Docker on the same machine, and cleartext HTTP to it is
already permitted. Nothing else to configure.

On a *physical* tablet 10.0.2.2 means nothing; the tablet is a separate device.
Uncomment the LAN line in the template and put your machine's address there:

```properties
kidsGalaxyServerHost=192.168.1.50
```

`~/.gradle/gradle.properties` works too, if you'd rather set it once for every
checkout on the machine.

One thing to keep in mind: this property feeds **both** variants — debug builds
an `http://` URL from it, release an `https://` one. So a value you set here for
local work would also follow a release build made on this machine. State the
host explicitly when you build anything destined for the field:

```bash
./gradlew assembleRelease -PkidsGalaxyServerHost=10.42.0.1 \
    -PkidsGalaxyCertPassword=<install-time password>
```

Start the server side first:

```bash
docker compose up --build      # from the repo root; serves on :8000
```

Cleartext HTTP is only permitted for the configured host, `10.0.2.2` and
`localhost` — see `res/xml/network_security_config.xml`. If you point the app at
some other address over HTTP it will fail with a cleartext-not-permitted error.
That's deliberate, not a bug.

## 5. Emulators worth creating

The layout adapts, so test both shapes. A small tablet in landscape is the case
that used to be broken — the controls squeezed the drawing area to nothing.

1. **Small tablet, 7–8"** — e.g. Nexus 7 (1200×1920, 320dpi), API 34+.
   Rotate it (`Ctrl`+`F11` / `Cmd`+`←`) and confirm the controls move to the
   *right of the canvas* rather than stacking underneath.
2. **Phone** — e.g. Pixel 7, API 26, to exercise `minSdk` and the narrowest width.
   The eight colour swatches should **wrap onto a second row**, never clip.
3. **Large tablet** — e.g. Pixel Tablet, API 37, for the target device.

What to look for specifically:

- Rotating mid-drawing must **keep the drawing** and the typed planet name.
  That's the ViewModel being lifecycle-scoped and the name being `rememberSaveable`.
- Every colour swatch and button should be comfortably tappable — targets are
  48dp minimum, 56dp when selected.
- On a short screen the controls panel scrolls; the canvas never collapses below
  220dp.

## 6. Debugging the drawing → upload flow

Useful breakpoints, in the order the data moves:

| Where | What you learn |
|---|---|
| `DrawingCanvas.onDragEnd` | Whether the gesture produced points at all |
| `DrawingViewModel.endStroke` | Whether the stroke was committed (taps are dropped by design) |
| `DrawingViewModel.onCanvasSizeChanged` | The measured canvas size — **the value the texture projection depends on** |
| `TextureProjection.map` | Coordinate mapping; pure function, easy to reason about |
| `AndroidPlanetTextureRenderer.renderPng` | The bitmap actually produced |
| `RetrofitPlanetRepository.sendPlanet` | The multipart request and the HTTP result |

If a drawing arrives on the projector distorted or offset, the fault is almost
certainly the canvas size reaching `TextureProjection` — check
`onCanvasSizeChanged` fired with the real dimensions before you suspect the maths,
which is unit-tested.

For network traffic, debug builds attach an OkHttp logging interceptor at BASIC
level; watch **Logcat** filtered to `KidsGalaxyApi`, `KidsGalaxyRepo`, or `okhttp`.
Release builds attach no interceptor at all, by design — don't go looking for
request logs in a release build.

To watch the server end at the same time:

```bash
docker compose logs -f pi-server
```

Then open `http://localhost:8000/` in a browser: that's the projector page, and a
successful upload should appear there within about half a second via Server-Sent
Events.

## 7. Building a release APK with mTLS

Release builds present a client certificate and pin trust to the project CA, so
they need the certificate material in place first:

```bash
cd pi-server/certs
SERVER_IP=10.42.0.1 ./generate_certs.sh
cp client.p12 ca.crt ../../android/app/src/main/assets/
cd ../../android
./gradlew assembleRelease -PkidsGalaxyCertPassword=<install-time password>
```

Both asset files are gitignored — certificates are per-deployment and must not be
committed. If either is missing, `ApiClient` raises `CertificateSetupException`
with a clear message rather than silently dropping to an unauthenticated
connection.

The server certificate must carry an **IP SAN**. Modern Android ignores the
certificate Common Name entirely, and the tablet connects to the Pi by address,
so a CN-only certificate fails the handshake. `generate_certs.sh` handles this;
verify with:

```bash
openssl x509 -in server.crt -noout -ext subjectAltName
```

## 8. Kiosk / single-app mode

On a factory-reset device with no Google account added:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dpm set-device-owner com.kidsgalaxy/.DeviceAdminReceiver
```

Device-owner assignment **fails if any account exists on the device** — that is the
usual reason this step doesn't work.

Note that orientation is intentionally not locked. Tablets get used both ways, and
large-screen Android increasingly ignores `screenOrientation` anyway, so the
layout adapts instead.

## 9. Before you push

CI gates these, and all three run locally in seconds:

```bash
cd android
./gradlew testDebugUnitTest                                     # JVM tests
ktlint --relative --editorconfig=.editorconfig "app/src/**/*.kt" # formatting
cd .. && make arch                                              # layer boundaries
```

**ktlint must be version 1.5.0** — the sources are formatted with exactly that
version and a different one produces spurious diffs. `ktlint --format` fixes
everything it reports.

`make arch` enforces that the `domain` package imports nothing from `android`,
`androidx`, or the outer layers. That constraint is what keeps the domain and
presentation tests runnable on the JVM; if you break it, those tests stop being
cheap to run.

## 10. Things that have already gone wrong here

Worth knowing, because each one cost a CI round-trip:

- **`gradle.properties` was missing entirely.** AGP needs `android.useAndroidX=true`
  for a project that depends on androidx. Don't delete this file.
- **Applying `org.jetbrains.kotlin.android` under AGP 9** fails with a new-DSL
  incompatibility. Built-in Kotlin replaces it.
- **`buildFeatures { buildConfig = true }` is required.** `ApiClient` reads four
  `BuildConfig` fields; turning it off makes the app fail to compile.
- **`manifestPlaceholders["serverHost"]` is required** —
  `network_security_config.xml` interpolates it.
- **`compileSdk` must be at least 37** for `androidx.lifecycle` 2.11.
- A missing launcher icon failed resource linking; the icon is vector XML in
  `res/mipmap*` so the repo needs no binary assets.
