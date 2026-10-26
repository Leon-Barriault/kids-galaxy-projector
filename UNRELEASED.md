# Unreleased

Work integrated on `develop` and not yet promoted through a release branch.
Keep this file in [Keep a Changelog](https://keepachangelog.com/) form.
Move a version section into the release notes when `release/x.y.z` is cut,
then leave a fresh `Unreleased` heading behind.

## Unreleased

### Added

- English and Canadian French catalogs for the kid tablet, the manager tablet,
  the server API, and the projector page.
- A persisted in-app language toggle. The first launch follows the device
  locale (`fr` and `fr-CA` open in French).
- `Accept-Language` on tablet API calls so server messages follow that tablet.
- `make i18n`, included in `make verify` and CI. Missing keys, extra keys,
  placeholder mismatches, and French punctuation without a non-breaking space
  fail the gate.
- [README.fr.md](README.fr.md) and the release-readiness audit in
  [docs/release-readiness.md](docs/release-readiness.md).
- Print-sheet headings, style names, and footers in English and Canadian
  French. The tablet `Accept-Language` header selects them.

### Changed

- Kid launch failures, galaxy discovery failures, and galaxy probe failures are
  message codes mapped to string resources instead of English sentences baked
  into Kotlin.
- The device-owner kid tablet enters Lock Task and hides system bars itself.
  The device-admin receiver no longer requests wipe, password reset, or login
  watching.
- Field deployment docs point at the nginx mTLS gateway for role checks.
  Release builds reject cleartext; debug builds still allow it on the bench.

### Fixed

- Projector page copy that lived only in `index.html`, so a French sky
  flashed English before the script ran.
- Projector celebration copy that was not in the English/French catalog.
- Print footer that described the server as a Pi.
- Server responses that returned raw exception text for a rejected projector
  snapshot.
