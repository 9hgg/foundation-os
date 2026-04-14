.PHONY: test
test: ## Run tests for the files lib
	@echo "🚀 Testing files lib with pytest"
	@UV_CACHE_DIR=/tmp/uv-cache uv run python -m pytest libs/files/tests

.PHONY: coverage
coverage: ## Run coverage for the files lib and refresh coverage.md
	@echo "🚀 Running coverage for files lib"
	@mkdir -p coverage/libs/files
	@UV_CACHE_DIR=/tmp/uv-cache COVERAGE_FILE=coverage/libs/files/.coverage uv run python -m pytest libs/files/tests \
		--cov=libs/files \
		--cov-config=pyproject.toml \
		--cov-report=term-missing \
		--cov-report=xml:coverage/libs/files/coverage.xml \
		--cov-report=json:coverage/libs/files/coverage.json \
		--cov-report=html:coverage/libs/files/html \
		--cov-report=markdown:libs/files/coverage.md

.PHONY: ruff
ruff: ## Run Ruff on the files lib excluding tests
	@echo "🚀 Linting files lib with Ruff"
	@UV_CACHE_DIR=/tmp/uv-cache uv run ruff check libs/files --exclude libs/files/tests
