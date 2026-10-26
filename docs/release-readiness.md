# Release readiness

Audit date: 2026-10-26. Branch base: `develop`.

This review covers the kid tablet (`android/app`), the manager tablet
(`android/manager`), the shared connection module, the server in `pi-server/`,
and the projector page. It is a code and documentation review plus the
automated gates. It is not a physical field trial.

**Verdict:** the bilingual product path and the issues fixed below are in the
tree, but this is not yet a tagged field release. A `release/x.y.z` branch
should wait until the remaining blockers are exercised on the real tablets,
gateway, and projector.

## What changed in this pass

- Kid, manager, server, and projector user-facing copy is externalized in
  English and Canadian French. `make i18n` (part of `make verify` and CI)
  fails on missing keys, extra keys, placeholder mismatches, and French
  `:`, `?`, or `!` that is not preceded by a non-breaking space.
- The language toggle already persisted. It now defaults to the device locale
  when nothing has been saved. French devices (`fr`, `fr-CA`, `fr-FR`) open
  in French. The applied locale is `fr-CA`, and Android resolves
  `values-fr/`.
- Tablet HTTP clients send `Accept-Language`. Server `detail` and the upload
  success sentence follow that header. English stays the default when the
  header is absent, so existing clients do not change.
- The shared projector language remains the manager control. One room keeps
  one sky even if two tablets disagree. That is deliberate.
- The device-owner kid app now enters Lock Task, disables the keyguard, and
  hides the system bars. A normal debug install is not pinned.
- The device-admin receiver no longer requests wipe, password reset, or login
  watching.
- README field instructions no longer recommend exposing uvicorn with TLS on a
  public interface as the secure deployment. Role checks belong to the nginx
  gateway.
- Print sheets take their labels from the same catalogs. `Accept-Language`
  selects French. The sheet no longer says it was rendered by a Pi. The
  projector HTML no longer shows English copy before the catalog loads.

## Findings

Severity is blocker, major, or minor. "Fixed" means this change addresses it.
"Open" means it still stands.

### Blockers

| Item | Status | Notes |
|---|---|---|
| No physical release validation | Open | CI cannot prove mTLS enrollment, Lock Task on a factory-reset tablet, HDMI projection, print, or STL. Cut `release/x.y.z` only after that checklist in DEVELOPMENT.md. |
| Secure field path was documented as uvicorn TLS on `0.0.0.0` | Fixed | That path requires a client certificate but does not derive kid/manager roles. Operators are now pointed at `docker-compose.secure.yml` and DEVELOPMENT.md. |
| Kid launch errors ignored the language toggle | Fixed | The ViewModel now emits a failure code. The screen maps it to `strings.xml` / `values-fr`. |
| Device-admin policy allowed wipe and password reset on a children's tablet | Fixed | Only `force-lock` remains, and the app does not call wipe. |

### Major

| Item | Status | Notes |
|---|---|---|
| Language default ignored the device locale | Fixed | Unset preference uses `Locale.getDefault()`. A saved choice still wins. |
| French copy missed the non-breaking space before `: ? !` | Fixed | Catalogs and `values-fr` were corrected. The parity gate keeps it that way. |
| Server messages were English only | Fixed | `pi-server/messages/en.json` and `fr.json`. Domain errors carry a stable key. |
| Galaxy probe and discovery errors were English sentences inside the shared module | Fixed | The connection module returns codes. Each app maps them to resources. |
| Projector celebration string was outside the catalog | Fixed | `messages.js` is the only projector copy. The page applies it on startup. |
| Rejected projector snapshots could return `str(error)` | Fixed | Failures use catalog keys. An OSError during store returns a fixed sentence instead of a path. |
| Print sheet labels were English only and named a Pi | Fixed | Headings, style, and footer come from the catalogs. The English footer says galaxy server. |
| Kiosk manifest never started Lock Task | Fixed | `startLockTask()` runs only when this package is device owner. |
| Manager ViewModel has little JVM coverage | Open | AGENTS.md already tracks this. The language and export work here is covered at the connection and server layers, not by a new manager ViewModel suite. |
| Legacy projector stages still patch `PlanetEntity` | Open | Do not rewrite `galaxy.js` to chase this. Migrate a stage only with the browser suite. |
| Pydantic validation errors stay in English | Open | Behavior updates that fail schema checks still return framework text. Domain failures on upload and delete are localized. |
| `ssl_verify_client optional` on the gateway | Open, accepted | The projector browser has no client certificate. Authorization must stay enabled in the secure compose file, which it is. An unverified tablet gets no role. Do not turn authorization off on a field network. |
| Debug cleartext is network-wide, not host-scoped | Open, accepted | Release network security rejects cleartext. Debug allows it so a bench tablet can use whatever LAN address was configured that day. The old README sentence that said cleartext was host-scoped was wrong and has been corrected. |

### Minor

| Item | Status | Notes |
|---|---|---|
| `style_spiky_help` is an empty string | Fixed | The style step no longer reserves a blank line for it. |
| `tab_export` / `export_title` strings are unused | Open | Print and STL actions live on each planet row. The strings are harmless. Remove them when the export screen is deleted or wired. |
| `docker-compose.yml` still says "On the Pi" in a comment | Open | The runtime is platform-neutral. The comment is historical. |
| Connection fallbacks `Kids Galaxy` and `Manual Galaxy` | Open | Both apps now pass a localized name. The fallback remains if a future caller omits it. |
| No Compose screenshot test for the toggle | Open | JVM tests cover the locale decision, the Accept-Language header, and the failure codes. See below for how to look at both languages by hand. |

## How to test English and French

1. `make i18n` and `make verify`.
2. On a tablet or emulator, set the system language to English, clear app
   storage, and launch the kid app. The UI is English. Tap **EN ●  FR**. The
   activity restarts in French, including a failed launch ("draw something
   first") and the galaxy picker.
3. Force-stop, set the device language to Français (Canada), clear storage,
   and launch again. The first screen is French without tapping the toggle.
4. In the manager app, set **Projector language** to Français. Reload the
   projector page. The badge, waiting line, and arrival line are French.
   Setting it back to English restores the English sky. Two kid tablets can
   keep different UI languages; the projector follows the manager.
5. Upload a non-image with `Accept-Language: fr-CA`. The JSON `detail` is the
   French catalog sentence. The same request without the header stays English.

## Recommendation before a release tag

1. Generate deployment certificates for the real LAN address and install
   `client.p12` / `manager.p12` only in the release assets, never in Git.
2. Enrol one kid tablet as device owner and confirm Lock Task survives reboot.
3. Run the secure compose stack and confirm a kid certificate cannot delete
   or clear, and a manager certificate can.
4. Project one English planet and one French arrival on the field GPU.
5. Print one PDF and export one STL from the manager app.
6. Only then branch `release/x.y.z` from `develop`.
