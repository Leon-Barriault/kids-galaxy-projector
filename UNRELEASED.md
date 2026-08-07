# Unreleased

## Added
- Distinct **unit** and **integration** test suites (`tests/unit` vs `tests/integration`)
- End-to-end integration flow: upload → /api/current-planet → serve texture
- **Mock isolation for unit tests**: rate-limit + client-IP helpers use `unittest.mock` (no real time / no shared state leakage)
- Separate confests: unit suite does not load FastAPI TestClient; integration-only fixtures hold the app
- CI has two separate jobs: `unit-tests` and `integration-tests`
- requirements-dev.txt, .dockerignore, pytest.ini markers
- Makefile targets: `test-unit`, `test-integration`

## Changed
- CI workflow: clear separation of unit vs integration, coverage artifacts, Docker smoke test
- Dockerfile installs runtime deps only
- pytest.ini: `pythonpath = .` so `import main` resolves under nested test dirs
- CI env: `PYTHONPATH=${{ github.workspace }}/pi-server` as a belt-and-suspenders path fix

## Fixed
- **CI ModuleNotFoundError: No module named 'main'** — unit and integration jobs failed on GitHub Actions because pytest collected tests from nested packages without putting `pi-server/` on `sys.path`. Fixed by:
  1. Setting `pythonpath = .` in `pytest.ini`
  2. Setting workflow-level `PYTHONPATH` to the pi-server directory
  3. Removing `tests/unit/__init__.py` and `tests/integration/__init__.py` so those directories are not treated as import packages
- Codecov / coverage path handling for working-directory jobs

## Verified
- Local: 23 tests green (unit + integration) with `PYTHONPATH=.`
- CI runs #14 and #15: **success** (unit, integration, Docker smoke, Android sources)
