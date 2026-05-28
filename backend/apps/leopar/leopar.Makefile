
.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

APP_EXTRA := leopar
APP_VENV := .venv-leopar
UV_APP_RUN := UV_PROJECT_ENVIRONMENT=$(APP_VENV) uv run --no-default-groups --extra $(APP_EXTRA)
UV_APP_DEV_RUN := UV_PROJECT_ENVIRONMENT=$(APP_VENV) uv run --extra $(APP_EXTRA)
UV_APP_SYNC := UV_PROJECT_ENVIRONMENT=$(APP_VENV) uv sync --no-default-groups --extra $(APP_EXTRA)

.PHONY: install
install: ## Install the virtual environment with uv
	@echo "🚀 Creating virtual environment using uv"
	@$(UV_APP_SYNC)



.PHONY: run
run: ## Run the server with uvicorn with 1 worker and reload
	@echo "🚀 Running server (color,reload)"
	@clear; reset; $(UV_APP_RUN) uvicorn apps.leopar.app:asgi_app --reload --port 8050


.PHONY: run-worker
run-worker: ## Run the worker
	@echo "🚀 Running worker (color)"
	@clear; reset; $(UV_APP_RUN) uvicorn apps.leopar.worker:asgi_app --reload --port 8150

.PHONY: run-worker-once
run-worker-once: ## Run the worker once
	@echo "🚀 Running worker (color)"
	@clear; reset; $(UV_APP_RUN) python -m libs.tasks.methods



.PHONY: run-with-8-workers
run-with-8-workers: ## Run the server with uvicorn with 8 workers and no reload
	@echo "🚀 Running server"
	@clear; reset; $(UV_APP_RUN) uvicorn apps.leopar.app:asgi_app --port 8150 --workers 8


.PHONY: checkuv 
check: ## Run code quality tools.
	@echo "🚀 Checking lock file consistency with 'pyproject.toml'"
	@$(UV_APP_SYNC) --locked
	@echo "🚀 Linting code: Running pre-commit"
	@$(UV_APP_DEV_RUN) pre-commit run -a
	@echo "🚀 Static type checking: Running mypy"
	@$(UV_APP_DEV_RUN) mypy
	@echo "🚀 Checking for obsolete dependencies: Running deptry"
	@$(UV_APP_DEV_RUN) deptry .

.PHONY: db-set
db-set: ## Set the podman image for the db
	@podman run --name leopar_postgres   -e POSTGRES_USER=postgres   -e POSTGRES_PASSWORD=postgres   -e POSTGRES_DB=postgres   -p 54350:5432   -d postgres:13

.PHONY: db-start
db-start: ## start or restart the podman container with the DB
	@podman start leopar_postgres

.PHONY: redis-set
redis-set: ## Set the podman image for Redis
	@podman run --name redis_server -p 6379:6379 -d redis:7-alpine

.PHONY: redis-start
redis-start: ## start or restart the podman container with the redis server
	@podman start redis_server

.PHONY: test
test: ## Test the code with pytest
	@echo "🚀 Testing code: Running pytest"
	@$(UV_APP_DEV_RUN) python -m pytest --cov --cov-config=pyproject.toml --cov-report=xml

.PHONY: alembic-check
alembic-check: ## Check the current database state compared to the alembic migrations
	@echo "🚀 Running alembic check"
	@echo "🔧 Using postgres/alembic.ini"
	@$(UV_APP_RUN) alembic -c apps/leopar/alembic/postgres/alembic.ini check

.PHONY: alembic-autogenerate
alembic-autogenerate: ## Generate a migration script
	@echo "🚀 Running alembic revision autogenerate with message: '$(message)'."
	@if [ -z "$(message)" ]; then \
		echo "❌ Error: 'message' argument is required. Usage: make alembic-autogenerate message=\"Your message\""; \
		exit 1; \
	fi
	@echo "🔧 Using postgres/alembic.ini"
	@$(UV_APP_RUN) alembic -c apps/leopar/alembic/postgres/alembic.ini revision --autogenerate -m "$(message)"

.PHONY: alembic-upgrade
alembic-upgrade: ## Upgrade the database to the latest version
	@echo "🚀 Running alembic upgrade head"
	@echo "🔧 Using postgres/alembic.ini"
	@$(UV_APP_RUN) alembic -c apps/leopar/alembic/postgres/alembic.ini upgrade head
	

.PHONY: alembic-current
alembic-current: ## Show the current database version
	@echo "🚀 Running alembic current"
	@echo "🔧 Using postgres/alembic.ini"
	@$(UV_APP_RUN) alembic -c apps/leopar/alembic/postgres/alembic.ini current
	

.PHONY: docker-leopar-app-production-build
docker-leopar-app-production-build: ## Build the production-leopar-app image with Docker BuildKit
	@echo "🐳 Building production-leopar-app image with Docker BuildKit"
	@docker buildx build \
		--load \
		-f ../ops/docker/leopar/leopar.Dockerfile \
		--target production-leopar-app \
		--tag leopar:production-leopar-app \
		.

.PHONY: docker-leopar-app-production-run
docker-leopar-app-production-run: ## Run the production-leopar-app container with Docker
	@echo "🚀 Running production-leopar-app container with Docker"
	@docker run --rm -v ~/workspace/leopar/backend:/code \
		-p 8000:8000 \
		-e SQLALCHEMY_DATABASE_URI=postgresql://postgres:postgres@host.docker.internal:54350/postgres \
		-e  REDIS_URL=redis://host.docker.internal:6379 leopar:production-leopar-app


.PHONY: docker-leopar-processor-production-build-amd
docker-leopar-processor-production-build-amd: ## Build the production-leopar-processor image with Docker BuildKit (target: AMD64)
	@echo "🐳 Building production-leopar-processor image with Docker BuildKit"
	@docker buildx build \
		--platform=linux/amd64 \
		--load \
		-f ../ops/docker/leopar/leopar.Dockerfile \
		--target production-process-tasks \
		--tag leopar:production-leopar-processor\
		.

.PHONY: docker-leopar-processor-production-build-arm
docker-leopar-processor-production-build-arm: ## Build the production-leopar-processor image with Docker BuildKit (target: ARM64)
	@echo "🐳 Building production-leopar-processor image with Docker BuildKit"
	@docker buildx build \
		--load \
		-f ../ops/docker/leopar/leopar.Dockerfile \
		--target production-process-tasks \
		--tag leopar:production-leopar-processor-arm \
		.

.PHONY: docker-leopar-processor-production-run
docker-leopar-processor-production-run: ## Run the production-leopar-processor container with Docker
	@echo "🚀 Running production-leopar-processor container with Docker (AMD64)"
	@docker run --rm \
		-v ~/workspace/leopar/backend:/code \
		-e SQLALCHEMY_DATABASE_URI=postgresql://postgres:postgres@host.docker.internal:54350/postgres \
		-e  REDIS_URL=redis://host.docker.internal:6379 \
		leopar:production-leopar-processor

.PHONY: docker-leopar-processor-production-run-arm
docker-leopar-processor-production-run-arm: ## Run the production-leopar-processor container with Docker (ARM64)
	@echo "🚀 Running production-leopar-processor container with Docker (ARM64)"
	@docker run --rm \
		-v ~/workspace/leopar/backend:/code \
		-e SQLALCHEMY_DATABASE_URI=postgresql://postgres:postgres@host.docker.internal:54350/postgres \
		-e  REDIS_URL=redis://host.docker.internal:6379 \
		leopar:production-leopar-processor-arm

.PHONY: docker-leopar-processor-production-tag
docker-leopar-processor-production-tag: ## Tag the production-leopar-processor image for Google Artifact Registry
	@echo "🔖 Tagging production-leopar-processor image for Google Artifact Registry"
	@docker tag leopar:production-leopar-processor us-east1-docker.pkg.dev/leopar-single-prod/leopar/processor

.PHONY: docker-leopar-processor-production-push
docker-leopar-processor-production-push: ## Push the production-leopar-processor image to Google Artifact Registry
	@echo "🚀 Pushing production-leopar-processor image to Google Artifact Registry"
	@docker push us-east1-docker.pkg.dev/leopar-single-prod/leopar/processor

# DEV

.PHONY: docker-leopar-app-development-build
docker-leopar-app-development-build: ## Build the development-leopar-app image with Docker BuildKit
	@echo "🐳 Building development-leopar-app image with Docker BuildKit"
	@docker buildx build \
		--load \
		-f ../ops/docker/leopar/leopar.Dockerfile \
		--target development-leopar-app \
		--tag leopar:development-leopar-app \
		.

.PHONY: docker-leopar-app-development-run
docker-leopar-app-development-run: ## Run the development-leopar-app container with Docker
	@echo "🚀 Running development-leopar-app container with Docker"
	@docker run --rm \
		-v ~/workspace/leopar/backend:/code \
		-p 8000:8000 \
		-e SQLALCHEMY_DATABASE_URI=postgresql://postgres:postgres@host.docker.internal:54350/postgres \
		-e  REDIS_URL=redis://host.docker.internal:6379 \
		leopar:development-leopar-app



# ============================================================================
# Local mail debugging client
# ============================================================================
MAIL_DEBUG_CONTAINER ?= leopar-mailpit
MAIL_DEBUG_IMAGE ?= axllent/mailpit:latest
MAIL_DEBUG_SMTP_PORT ?= 1025
MAIL_DEBUG_HTTP_PORT ?= 8025


.PHONY: mail-local
mail-local: ## Start a local SMTP debug client (Mailpit) that logs all received messages
	@echo "📬 Starting Mailpit on SMTP port $(MAIL_DEBUG_SMTP_PORT) with web UI on http://localhost:$(MAIL_DEBUG_HTTP_PORT)"
	@echo "    Press Ctrl+C to stop. Configure the app to use smtp://localhost:$(MAIL_DEBUG_SMTP_PORT)"
	@podman run --rm \
		--name $(MAIL_DEBUG_CONTAINER) \
		-p $(MAIL_DEBUG_SMTP_PORT):1025 \
		-p $(MAIL_DEBUG_HTTP_PORT):8025 \
		$(MAIL_DEBUG_IMAGE)



.PHONY: translations-db-to-json
translations-db-to-json: ## Export and merge DB translations into app JSON seed file
	@$(UV_APP_RUN) python -m libs.i18n.tools.sync_translation db-to-json --file apps/leopar/i18n/translations.seed.json

.PHONY: translations-json-to-db
translations-json-to-db: ## Import and merge app JSON translations into DB
	@$(UV_APP_RUN) python -m libs.i18n.tools.sync_translation json-to-db --file apps/leopar/i18n/translations.seed.json
