.PHONY: test
test: ## Run tests for the ml lib
	@echo "🚀 Testing ml lib with pytest"
	@uv run python -m pytest libs/ml/tests

.PHONY: coverage
coverage: ## Run coverage for the ml lib and refresh coverage.md
	@echo "🚀 Running coverage for ml lib"
	@mkdir -p coverage/libs/ml
	@COVERAGE_FILE=coverage/libs/ml/.coverage uv run python -m pytest libs/ml/tests \
		--cov=libs/ml \
		--cov-config=pyproject.toml \
		--cov-report=term-missing \
		--cov-report=xml:coverage/libs/ml/coverage.xml \
		--cov-report=json:coverage/libs/ml/coverage.json \
		--cov-report=html:coverage/libs/ml/html \
		--cov-report=markdown:libs/ml/coverage.md
	@echo "📊 HTML report: coverage/libs/ml/html/index.html"

.PHONY: ruff
ruff: ## Run Ruff on the ml lib excluding tests and demos
	@echo "🚀 Linting ml lib with Ruff"
	@uv run ruff check libs/ml --exclude libs/ml/tests --exclude libs/ml/demos

.PHONY: demo-keyword
demo-keyword: ## Run the keyword classification demo
	uv run python libs/ml/demos/demo_keyword_classification.py

.PHONY: demo-linguistic
demo-linguistic: ## Run the linguistic (stemming-based) keyword classification demo
	uv run python libs/ml/demos/demo_linguistic_keyword_classification.py

.PHONY: demo-fit-classify
demo-fit-classify: ## Run the trainable text classifiers demo (SVM, LR, RF, MLP, AdaBoost…)
	uv run python libs/ml/demos/demo_text_fit_classify.py

.PHONY: demo-smart
demo-smart: ## Run the smart classifiers demo (auto-tuning via CV grid search — slow)
	uv run python libs/ml/demos/demo_smart_classifiers.py

.PHONY: demo-multilabel
demo-multilabel: ## Run the multi-label classification demo
	uv run python libs/ml/demos/demo_multilabel_classification.py

.PHONY: demo-zero-shot
demo-zero-shot: ## Run the zero-shot LLM classification demo (Ollama + OpenAI + IAG)
	uv run python libs/ml/demos/demo_zero_shot_classification.py

.PHONY: demo-regression
demo-regression: ## Run the regression demo (linear, polynomial)
	uv run python libs/ml/demos/demo_regression.py

.PHONY: demo-openturns
demo-openturns: ## Run the OpenTURNS regression demo
	uv run python libs/ml/demos/demo_openturns_regression.py

.PHONY: demo-edf-iag
demo-edf-iag: ## Run the EDF IAG LLM client demo (requires EDF_IAG_API_KEY or use --dry-run)
	uv run python libs/ml/demos/demo_edf_iag_llm_client.py

.PHONY: demo-benchmark
demo-benchmark: ## Run the full benchmark across all formalisms and methods
	uv run python libs/ml/demos/demo_benchmark.py

.PHONY: demos
demos: ## Run all ml demos
	@$(MAKE) -f libs/ml/ml.Makefile demo-keyword
	@$(MAKE) -f libs/ml/ml.Makefile demo-linguistic
	@$(MAKE) -f libs/ml/ml.Makefile demo-fit-classify
	@$(MAKE) -f libs/ml/ml.Makefile demo-smart
	@$(MAKE) -f libs/ml/ml.Makefile demo-multilabel
	@$(MAKE) -f libs/ml/ml.Makefile demo-regression
	@$(MAKE) -f libs/ml/ml.Makefile demo-openturns
	@$(MAKE) -f libs/ml/ml.Makefile demo-zero-shot
	@$(MAKE) -f libs/ml/ml.Makefile demo-edf-iag
	@$(MAKE) -f libs/ml/ml.Makefile demo-benchmark
