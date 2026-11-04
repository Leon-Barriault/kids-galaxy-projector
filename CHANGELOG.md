# Changelog

Released versions of Kids Galaxy Projector, in
[Keep a Changelog](https://keepachangelog.com/) form. Work on `develop` that
is not released yet is staged in [UNRELEASED.md](UNRELEASED.md).

## [1.3.0] - 2026-11-04

Components: kid tablet 1.2.0 (versionCode 3), manager tablet 1.2.0
(versionCode 9), server 1.7.0.

Physical release validation is still open in
[docs/release-readiness.md](docs/release-readiness.md). Run that checklist on
the real tablets, gateway and projector before a room is updated to this tag.

### Added

- English and Canadian French on the kid tablet, the manager tablet, the
  server API, the projector page and the print sheets. A persisted language
  toggle, `Accept-Language` on tablet calls, and a `make i18n` parity gate
  in CI.
- Plain-language room guides for parents, teachers and daycare staff in both
  languages, including the guides for the Windows travel-router room.
- The production room procedure and the kid-tablet lock. The device-owner
  kid tablet enters Lock Task and hides the system bars itself.
- One tablet address for daycares and the live WSL PC.
- An adult gate on the kid tablet. Changing the language or the galaxy now
  takes a press-and-hold and a two-digit sum.
- **Before you leave** on the manager tablet clears planet names between
  daycares, and USB backups leave the names out.
- Canadian holiday themes and seasonal visuals.
- `bash scripts/setup_room.sh` and `scripts/build_tablets.sh` for room setup.
- CI: connection checks on `develop`, Windows script lint, the projector
  rendering-maths suite, and a `ruff format` check.

### Changed

- A secure room allows no cross-origin reads by default. `ALLOWED_ORIGINS`
  still overrides.
- Licensing is source-available with commercial terms.
- Kid launch, discovery and probe failures are message codes mapped to string
  resources.
- The device-admin receiver no longer requests wipe, password reset or login
  watching.
- Field deployment docs point at the nginx mTLS gateway for role checks.
  Release builds reject cleartext.
- AGENTS.md and the production-room decision record state that exports
  require the manager role, as the code does.

### Fixed

- The projector wall reconnects its live stream after a server restart.
- PDF planet renders are optically centred, unclipped and on Letter paper.
- Projector snapshots are regenerated and safely framed.
- Preview, print and PDF exports no longer pass an image-mode argument that
  Pillow 13 removes.
- Projector page and celebration copy that skipped the English/French
  catalog.
- The print footer that described the server as a Pi.
- Raw exception text in responses to a rejected projector snapshot.
- A relief-geometry test that had gone stale outside CI.

[1.3.0]: https://github.com/Leon-Barriault/kids-galaxy-projector/compare/v1.2.1...v1.3.0
