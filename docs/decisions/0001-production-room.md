# Production room topology

Status: accepted for the production procedure on this branch.
Date: 2026-10-27.

The repository did not have an ADR folder. This is the first one.
It records the room shape used by the operating pages.

## Context

A room has one galaxy computer, one projector, one kid tablet, and one manager tablet.
Tablets must prove who they are. Children must not leave the drawing app.
The computer may be rebuilt, and a tablet may be lost.

## Decision

1. The field path is `docker-compose.secure.yml`.
   FastAPI listens on `127.0.0.1:8000`.
   nginx is the tablet door on port `8443` with host networking.
   The projector browser uses `http://127.0.0.1:8000/` and has no client certificate.
   `ssl_verify_client optional` stays, because that browser must load.
   Authorization stays on, so a caller with no certificate gets no role.

2. The server image is tagged `kids-galaxy-pi-server:room`.
   The computer builds it. There is no public registry.
   Before an update, that tag is also saved as `kids-galaxy-pi-server:previous`.
   Rollback retags `previous` back to `room` and recreates the container without a rebuild.

3. `scripts/production_certs.sh` owns room cards.
   The CA is kept across runs.
   The server certificate is renewed in place when the address changes or it is inside 30 days of expiry.
   Each tablet gets its own certificate. The OU is `kid` or `manager`, which is what nginx already maps to a role.
   Default names are `kid-1` and `manager-1`.
   Lifetime defaults to 825 days, matching `generate_certs.sh`.
   A lost tablet is revoked into `ca.crl`. nginx reads that CRL.
   `generate_certs.sh` remains the lab reset used by CI. It writes an empty CRL so the door can start, and it does not keep a per-tablet database.

4. The drawing app embeds one PKCS12 in its assets.
   Replacing a tablet copies that tablet's card into the assets and rebuilds the kid app.
   The p12 password is generated once and stored in `pi-server/certs/p12-password` with mode `0600`.
   An older room that already has `client.p12` and no password file keeps the historical install password `KidsGalaxy`.

5. Release APKs are signed when `android/keystore.properties` exists.
   `scripts/create_tablet_keystore.sh` creates `android/release.keystore`.
   Both files are gitignored. Debug and CI builds do not need them.

6. Kid lock mode is device owner plus Lock Task, started by `scripts/provision_kid_tablet.sh`.
   There is no paid MDM.
   `KidTabletPolicy` blocks installs, accounts, factory reset from the settings UI, and hides store and browser packages when they exist.
   USB debugging is left on so a grown-up with the cable can recover the tablet.
   Wi-Fi configuration is not forbidden at the policy layer. Lock Task is what keeps children out of Settings.
   The app pins itself as the home activity and starts again after boot.
   The screen is not forced to stay on while charging. A bright screen all night is a poor fit for a closet shelf.
   "Start when the charger is plugged in" is not a standard Android API. The operating page tells the adult to look for the maker's switch and to press power if it is missing.

7. Fire OS is not a supported locked tablet.
   The app has no Google Play Services dependency, so the drawing app can install.
   Device-owner lock is not promised there.

8. Safety copies include uploads, state, `pi-server/certs`, and the keystore when it exists.
   They are mode `0600` and are meant for a USB stick in a locked drawer.

## Open risks for the owner

These are not fixed by this procedure. They need a decision or a room test.

- The hotspot password in `scripts/setup_hotspot.sh` is a shared default published in the install guide. A public event should not use it.
- `nginx:stable-alpine` is a moving tag. A pinned digest would be more stable and harder to refresh offline.
- Export routes for print and STL stay open on purpose. Destructive routes stay role-gated.
- USB debugging on the kid tablet is a physical-access path. The case must leave the port usable, and the cable must stay with the adult.
- A child who gets out of Lock Task can still open Settings, because Wi-Fi changes were not forbidden. Android 8 is weaker on the shade than Android 9.
- CRL reload depends on the gateway running. A cancelled card is enforced at the next gateway start if reload cannot run.
- The p12 password and the keystore password appear in local files. Backup files contain them. They must not be emailed.
- Boot-on-charge cannot be scripted. A dead tablet may sit on the charger until someone presses power.
- Certificate lifetime is 825 days until the owner picks another number.
- The computer name `kids-galaxy` and the example address `192.168.1.50` are placeholders. The room router must reserve the real address.
- Per-tablet cards require a rebuild of the kid app, because the PKCS12 is an asset. A warm Gradle build is what makes a replacement short.
- Manager tablets are not locked. That is intentional.
