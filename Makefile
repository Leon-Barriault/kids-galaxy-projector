.PHONY: test test-unit test-integration lint lint-python lint-docker lint-shell lint-kotlin docker-up docker-down certs help install-dev

help:
	@echo "Kids Galaxy Projector - common targets"
	@echo "  make install-dev      - install runtime + test dependencies"
	@echo "  make lint             - lint all layers (Python, Docker, shell, Kotlin)"
	@echo "  make test-unit        - run pure unit tests only"
	@echo "  make test-integration - run end-to-end integration tests"
	@echo "  make test             - run both suites"
	@echo "  make docker-up        - start local stack (no hardware needed)"
	@echo "  make docker-down"
	@echo "  make certs            - generate mTLS certificates"

install-dev:
	cd pi-server && pip install -r requirements-dev.txt

lint: lint-python lint-docker lint-shell lint-kotlin

lint-python:
	cd pi-server && ruff check . --config ruff.toml

lint-docker:
	hadolint --config .hadolint.yaml pi-server/Dockerfile

lint-shell:
	shellcheck -x scripts/setup_hotspot.sh scripts/start_kiosk.sh pi-server/certs/generate_certs.sh

lint-kotlin:
	@command -v ktlint >/dev/null 2>&1 || { echo "Install ktlint: https://github.com/pinterest/ktlint"; exit 1; }
	cd android && ktlint --relative --editorconfig=.editorconfig "app/src/main/kotlin/**/*.kt"

test-unit:
	cd pi-server && python -m pytest tests/unit/ -v --cov=main --cov-report=term-missing

test-integration:
	cd pi-server && python -m pytest tests/integration/ -v --cov=main --cov-report=term-missing

test: test-unit test-integration

docker-up:
	docker compose up --build

docker-down:
	docker compose down

certs:
	cd pi-server/certs && chmod +x generate_certs.sh && ./generate_certs.sh
