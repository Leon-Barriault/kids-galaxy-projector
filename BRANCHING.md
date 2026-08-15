# Branching and Release Workflow

This repository uses a lightweight GitFlow-style branching model to keep day-to-day development separate from release stabilization and production-ready code.

## Branch roles

### `main`

`main` represents production-ready, field-ready code.

- Do not use `main` for normal development.
- Merge into `main` only from a `release/x.y.z` branch or, for an urgent production correction, a `hotfix/x.y.z` branch.
- A merge to `main` should represent a version that is safe to deploy.
- Tag released versions on `main`, for example `v1.2.0`.
- Keep `main` protected and require successful CI before merge.

### `develop`

`develop` is the integration branch for the next release.

- Normal features, fixes, documentation work, and approved experiments are integrated here first.
- Short-lived branches normally start from `develop` and merge back into `develop` through a pull request.
- `develop` may contain completed work that has not yet passed release/field validation.
- Keep `develop` protected and require successful CI before merge.

### `feature/*`, `fix/*`, `docs/*`, and `experiment/*`

These are short-lived working branches based on `develop`.

Examples:

```text
feature/planet-labels
fix/stl-export-timeout
docs/server-deployment
experiment/polar-magnet-projection
```

Rules:

1. Branch from the current `develop`.
2. Keep the change focused.
3. Run the relevant local validation.
4. Open a pull request into `develop`.
5. Require green CI before merge.
6. Delete the branch after merge.

Experiments do not become release work merely because they compile. An experiment should be selected, cleaned up, tested, and merged into `develop`; abandoned alternatives should be deleted.

### `release/x.y.z`

A release branch is temporary and is created from `develop` when the intended feature set for a version is complete.

Example:

```text
release/1.2.0
```

Only stabilization work belongs on a release branch:

- release-blocking bug fixes;
- version numbers and release metadata;
- documentation corrections;
- deployment validation;
- physical tablet, server-side, projector, print, and STL verification.

Do not add new features during release stabilization.

When validation is complete:

1. Merge `release/x.y.z` into `main`.
2. Tag the resulting `main` commit as `vX.Y.Z`.
3. Merge the release branch back into `develop` so release-only fixes are retained.
4. Delete the release branch.

### `hotfix/x.y.z`

Use a hotfix branch only for an urgent defect in the currently released version.

- Branch from `main`.
- Apply the smallest safe correction.
- Run the full relevant validation.
- Merge into `main` and tag the corrected release.
- Merge the same fix back into `develop`.
- Delete the hotfix branch.

## Normal lifecycle

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

The important distinction is:

- **CI-green development code** belongs in `develop`.
- **Release-candidate code under stabilization** belongs in `release/x.y.z`.
- **Field-ready released code** belongs in `main`.

## Pull-request targets

| Work | Branch from | Pull request into |
|---|---|---|
| Feature | `develop` | `develop` |
| Normal bug fix | `develop` | `develop` |
| Documentation | `develop` | `develop` |
| Experiment | `develop` | `develop` |
| Release stabilization | `develop` | `release/x.y.z` or commit on the active release branch according to team policy |
| Completed release | `release/x.y.z` | `main` |
| Release fixes backflow | `release/x.y.z` | `develop` |
| Urgent production hotfix | `main` | `main` |
| Hotfix backflow | `hotfix/x.y.z` | `develop` |

## Quality gates

A branch name does not make code safe. The same automated and manual quality gates still apply.

At minimum:

- lint and architecture checks must pass;
- server-side unit and integration tests must pass;
- Android builds and JVM tests must pass;
- projector/WebGL checks must pass when projector behavior changes;
- certificate/security checks must pass when transport or deployment changes;
- release candidates must receive the required physical-device and deployment validation before merging to `main`.

A red pipeline blocks integration or release promotion.

## Server-side terminology

The backend is platform-neutral and is referred to in documentation as the **server side**, **server-side application**, or **server**. It is not a Raspberry Pi-specific server.

The repository path `pi-server/` is a historical directory name retained for compatibility with existing scripts, CI, Docker configuration, and tooling. Treat it as a path name only; it does not define the deployment platform or architecture.
