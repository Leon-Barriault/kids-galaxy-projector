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

## Fixed
- Codecov / coverage path handling for working-directory jobs
