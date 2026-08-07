# Unreleased

## Added
- Distinct **unit** and **integration** test suites (tests/unit vs tests/integration)
- End-to-end integration flow: upload → /api/current-planet → serve texture
- CI now has two separate jobs: `unit-tests` and `integration-tests`
- requirements-dev.txt (test deps separated from production image)
- .dockerignore, pytest.ini with markers
- Makefile targets: `test-unit`, `test-integration`

## Changed
- CI workflow: clear separation of unit vs integration, coverage artifacts, Docker smoke test
- Dockerfile installs runtime deps only

## Fixed
- Codecov / coverage path handling for working-directory jobs
