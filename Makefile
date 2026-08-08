.PHONY: help install-dev lint lint-python lint-docker lint-shell lint-kotlin \
        arch test test-unit test-integration test-android build-android \
        docker-up docker-down dev-up certs vendor-three verify check-projector

help:
	@echo "Kids Galaxy Projector - common targets"
	@echo "  make install-dev      - install runtime + test dependencies"
	@echo "  make lint             - lint all layers (Python, Docker, shell, Kotlin)"
	@echo "  make arch             - enforce clean-architecture boundaries"
	@echo "  make test-unit        - fast unit tests (domain/application/infrastructure)"
	@echo "  make test-integration - end-to-end API tests"
	@echo "  make test             - both Python suites"
	@echo "  make test-android     - JVM unit tests for the Android app"
	@echo "  make build-android    - assemble the debug APK"
	@echo "  make verify           - lint + arch + all tests (what CI runs)"
	@echo "  make check-projector  - drive static/galaxy.js in headless Chromium"
	@echo "  make dev-up           - full debug environment: server + emulator"
	@echo "  make docker-up        - start local stack (no hardware needed)"
	@echo "  make docker-down"
	@echo "  make certs            - generate mTLS certificates"
	@echo "  make vendor-three     - refresh the vendored Three.js build"

install-dev:
	cd pi-server && pip install -r requirements-dev.txt

# -------------------- linting --------------------

lint: lint-python lint-docker lint-shell lint-kotlin

lint-python:
	cd pi-server && ruff check . --config ruff.toml

lint-docker:
	hadolint --config .hadolint.yaml pi-server/Dockerfile

lint-shell:
	shellcheck -x scripts/setup_hotspot.sh scripts/start_kiosk.sh scripts/dev-up.sh pi-server/certs/generate_certs.sh

lint-kotlin:
	@command -v ktlint >/dev/null 2>&1 || { echo "Install ktlint: https://github.com/pinterest/ktlint"; exit 1; }
	cd android && ktlint --relative --editorconfig=.editorconfig "app/src/**/*.kt" "manager/src/**/*.kt"

# -------------------- architecture --------------------

# These guard the layering. They are cheap and catch the mistake that is easiest
# to make by accident: reaching for a framework type inside the domain.
arch:
	@echo "==> Kotlin domain must not import Android or Compose"
	@! grep -rn "^import \(android\|androidx\)" android/app/src/main/kotlin/com/kidsgalaxy/domain/ \
		|| { echo "FAIL: domain layer is not framework-free"; exit 1; }
	@echo "==> Kotlin dependencies must point inwards"
	@! grep -rn "com\.kidsgalaxy\.\(data\|presentation\|ui\|di\)" android/app/src/main/kotlin/com/kidsgalaxy/domain/ \
		|| { echo "FAIL: domain depends on an outer layer"; exit 1; }
	@echo "==> Python domain/application must not import FastAPI or Pillow"
	@! grep -rn "^\(import\|from\) \(fastapi\|starlette\|PIL\)" pi-server/app/domain/ pi-server/app/application/ \
		|| { echo "FAIL: domain/application depends on a framework"; exit 1; }
	@echo "==> Projector assets must not reference the public internet"
	@! grep -rnE "https?://" pi-server/static/index.html pi-server/static/galaxy.js \
		|| { echo "FAIL: static assets reference remote resources"; exit 1; }
	@echo "All architecture boundaries hold."

# -------------------- tests --------------------

test-unit:
	cd pi-server && python -m pytest tests/unit/ -v --cov=app --cov=main --cov-report=term-missing

test-integration:
	cd pi-server && python -m pytest tests/integration/ -v --cov=app --cov=main --cov-report=term-missing

test: test-unit test-integration

test-android:
	cd android && ./gradlew testDebugUnitTest

build-android:
	cd android && ./gradlew assembleDebug

verify: lint arch test test-android

# static/galaxy.js is the one part of the project with no unit tests - it
# needs WebGL, a live server and a real EventSource, so there is nothing to
# fake it with. This drives the real page instead. Not a CI gate: CI has no
# browser installed, and adding one to lint a projector is a poor trade.
check-projector:
	@command -v python3 >/dev/null || { echo "python3 required"; exit 1; }
	python3 scripts/check_projector.py

# -------------------- local stack --------------------

# Everything a debugging session needs, in one step: the server container
# built and healthy, then an emulator if no device is attached. This is what
# Android Studio runs as a before-launch step of "App (local debug)".
dev-up:
	./scripts/dev-up.sh

docker-up:
	docker compose up --build

docker-down:
	docker compose down

certs:
	cd pi-server/certs && chmod +x generate_certs.sh && ./generate_certs.sh

# Refresh the vendored Three.js build. Pinned so the offline projector and the
# import map cannot drift apart.
# Three.js version vendored into pi-server/static/vendor. Bump here only.
THREE_VERSION ?= 0.185.1

# NOTE: since r16x, three.module.js is NOT self-contained - it imports from
# three.core.js. Both must be vendored or the projector fails to load offline.
vendor-three:
	cd pi-server/static/vendor && npm pack three@$(THREE_VERSION) \
		&& tar -xzf three-$(THREE_VERSION).tgz \
		&& cp package/build/three.module.js three.module.js \
		&& cp package/build/three.core.js three.core.js \
		&& mkdir -p jsm/controls \
		&& cp package/examples/jsm/controls/OrbitControls.js jsm/controls/OrbitControls.js \
		&& cp package/LICENSE THREE_LICENSE.txt \
		&& rm -rf package three-$(THREE_VERSION).tgz
	@echo "Vendored Three.js $(THREE_VERSION) refreshed."
	@test -f pi-server/static/vendor/three.core.js \
		|| { echo "ERROR: three.core.js missing - the projector will not load."; exit 1; }
