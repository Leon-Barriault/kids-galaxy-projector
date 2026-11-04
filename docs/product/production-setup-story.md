# User story: production room setup

Status: ready for review on `cursor/production-setup-a8b6`.
Parent: `cursor/release-readiness-i18n-e58d` (PR #42).

## Story

As a grown-up who runs a Kids Galaxy room, I can follow one English page and one matching Canadian French page to put the room into service, keep it running, and replace a kid tablet, without reading the programmer guide.

## Scope

In:

- Hardware, network, ports, and a paper address plan.
- Host packages, the secure compose stack, and image names used for rollback.
- Room CA, server renewal, per-tablet cards, expiry, and cancellation of one lost tablet.
- App signing key created on the computer and left out of git.
- Kid tablet case, screen protector, device-owner lock, hidden stores and browsers, charging, drops, and replacement.
- Minimum tablet facts taken from the Android build.
- First-run check, safety copy, restore, update, rollback, and a go-live list.
- Scripts with `--help` for the repeated commands.
- A parity check so the English and French pages keep the same sections.

Out:

- A paid mobile-device manager.
- A promise that every Fire tablet can be locked.
- A script that can power on a tablet that is fully off.
- Publishing images to a public registry.
- Changing planet art, gallery size, or manager export rules.

## Acceptance criteria

1. `docs/user/en/production-setup.md` and `docs/user/fr/production-setup.md` use the same section and step markers, and each step says what to look for and what to do if that is missing.
2. `docs/user/en/kid-tablet.md` and `docs/user/fr/kid-tablet.md` do the same for the child tablet, including specs, case, lock limits, charging, damage, and replacement.
3. `make i18n` fails if those markers diverge or a required section disappears.
4. `scripts/production_certs.sh` can be run twice without replacing the room CA, can cancel one tablet, and can renew the server card.
5. `scripts/check_room.sh`, backup, restore, update, and rollback have `--help` and are idempotent where a second run is safe.
6. `scripts/replace_kid_tablet.sh` revokes the old card, installs the signed app, and turns on device-owner lock mode. It prints elapsed seconds.
7. Real certificates, the p12 password, and the release keystore are gitignored.
8. The secure gateway reads a CRL so a cancelled card is rejected.
9. Steps that need a real tablet, projector, or router are named as room checks. Lab checks are the certificate script, and any Docker or emulator run recorded in the pull request.
