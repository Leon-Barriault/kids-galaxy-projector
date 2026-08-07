.PHONY: test test-unit test-integration docker-up docker-down certs help install-dev

help:
	@echo "Kids Galaxy Projector – common targets"
	@echo "  make install-dev      – install runtime + test dependencies"
	@echo "  make test-unit        – run pure unit tests only"
	@echo "  make test-integration – run end-to-end integration tests"
	@echo "  make test             – run both suites"
	@echo "  make docker-up        – start local stack (no hardware needed)"
	@echo "  make docker-down"
	@echo "  make certs            – generate mTLS certificates"

install-dev:
	cd pi-server && pip install -r requirements-dev.txt

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
