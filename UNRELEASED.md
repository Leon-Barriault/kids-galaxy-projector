# Unreleased

## Added
- **Lint gate for every layer** in CI and Makefile:
  - Python: `ruff` (`pi-server/ruff.toml`)
  - Docker: `hadolint` (`.hadolint.yaml`)
  - Shell: `shellcheck` (hotspot, kiosk, cert scripts)
  - Android/Kotlin: `ktlint` (`android/.editorconfig`)
- CI `lint` job runs before unit/integration/docker/android jobs
- Distinct **unit** and **integration** test suites (`tests/unit` vs `tests/integration`)
- End-to-end integration flow: upload → /api/current-planet → serve texture
- **Mock isolation for unit tests**: rate-limit + client-IP helpers use `unittest.mock`
- Separate confests: unit suite does not load FastAPI TestClient; integration-only fixtures hold the app
- CI has two separate jobs: `unit-tests` and `integration-tests`
- requirements-dev.txt, .dockerignore, pytest.ini markers
- Makefile targets: `test-unit`, `test-integration`, `lint`

## Changed
- CI workflow: lint first, then unit vs integration, coverage artifacts, Docker smoke test
- Dockerfile installs runtime deps only
- pytest.ini: `pythonpath = .` so `import main` resolves under nested test dirs
- CI env: `PYTHONPATH=${{ github.workspace }}/pi-server` as a belt-and-suspenders path fix

## Fixed
- Python unused imports (`aiofiles`, `JSONResponse`), import order, exception chaining
- Shellcheck SC2035 in `generate_certs.sh` (safe glob)
- Kotlin style: trailing commas, no wildcard imports, ktlint formatting
- **CI ModuleNotFoundError: No module named 'main'** — fixed via pythonpath + PYTHONPATH + removing nested test `__init__.py`
- Codecov / coverage path handling for working-directory jobs

## Verified
- Local: 23 tests green (unit + integration) with `PYTHONPATH=.`
- Local: ruff, hadolint, shellcheck, ktlint all clean
- CI runs #14 and #15: **success** (unit, integration, Docker smoke, Android sources)
