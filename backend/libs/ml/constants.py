"""Official built-in ML method registry.

This module owns the shared catalogue of methods provided by ``libs.ml``.
Demos and applications should build from this registry instead of keeping
local method lists.
"""

from __future__ import annotations

from typing import Any

from libs.ml.llm import (
    EDFIAGLLMClient,
    LLMClient,
    OllamaEmbeddingClient,
    OllamaLLMClient,
    OpenAILLMClient,
)
from libs.ml.methods.keyword_classifier import (
    KeywordJsonClassifier,
    KeywordMultiLabelJsonClassifier,
    KeywordMultiLabelTextClassifier,
    KeywordTextClassifier,
)
from libs.ml.methods.linguistic_keyword_classifier import (
    LinguisticKeywordJsonClassifier,
    LinguisticKeywordMultiLabelJsonClassifier,
    LinguisticKeywordMultiLabelTextClassifier,
    LinguisticKeywordTextClassifier,
)
from libs.ml.methods.llm import (
    LLMZeroShotJsonClassifier,
    LLMZeroShotJsonMultiLabelClassifier,
    LLMZeroShotTextMultiLabelClassifier,
    LLMZeroShotTextClassifier,
)
from libs.ml.methods.llm_few_shot import (
    LLMFewShotJsonClassifier,
    LLMFewShotTextClassifier,
    LLMFewShotTextMultiLabelClassifier,
)
from libs.ml.methods.random_classifier import TextRandomClassifier
from libs.ml.methods.sklearn import (
    AdaBoostTextClassifier,
    GradientBoostingFeatureVectorRegressor,
    GradientBoostingJsonClassifier,
    GradientBoostingTextClassifier,
    LassoFeatureVectorRegressor,
    LinearFeatureVectorRegressor,
    LinearSVMJsonClassifier,
    LogisticRegressionFeatureVectorClassifier,
    LogisticRegressionJsonClassifier,
    LogisticRegressionMultiLabelJsonClassifier,
    LogisticRegressionMultiLabelTextClassifier,
    LogisticRegressionTextClassifier,
    MLPFeatureVectorClassifier,
    MLPJsonClassifier,
    MLPMultiLabelJsonClassifier,
    MLPMultiLabelTextClassifier,
    MLPTextClassifier,
    PolynomialFeatureVectorRegressor,
    RandomForestFeatureVectorClassifier,
    RandomForestFeatureVectorRegressor,
    RandomForestJsonClassifier,
    RandomForestMultiLabelJsonClassifier,
    RandomForestMultiLabelTextClassifier,
    RandomForestTextClassifier,
    RidgeFeatureVectorRegressor,
    SGDJsonClassifier,
    SmartAdaBoostTextClassifier,
    SmartGradientBoostingTextClassifier,
    SmartLogisticRegressionFeatureVectorClassifier,
    SmartLogisticRegressionJsonClassifier,
    SmartLogisticRegressionMultiLabelJsonClassifier,
    SmartLogisticRegressionMultiLabelTextClassifier,
    SmartLogisticRegressionTextClassifier,
    SmartMLPFeatureVectorClassifier,
    SmartMLPJsonClassifier,
    SmartMLPMultiLabelJsonClassifier,
    SmartMLPMultiLabelTextClassifier,
    SmartMLPTextClassifier,
    SmartRandomForestFeatureVectorClassifier,
    SmartRandomForestJsonClassifier,
    SmartRandomForestMultiLabelJsonClassifier,
    SmartRandomForestMultiLabelTextClassifier,
    SmartRandomForestTextClassifier,
    SmartSVMFeatureVectorClassifier,
    SmartSVMJsonClassifier,
    SmartSVMMultiLabelJsonClassifier,
    SmartSVMMultiLabelTextClassifier,
    SmartSVMTextClassifier,
    SVMFeatureVectorClassifier,
    SVMJsonClassifier,
    SVMMultiLabelJsonClassifier,
    SVMMultiLabelTextClassifier,
    SVMTextClassifier,
    SVRFeatureVectorRegressor,
)
from libs.ml.methods.semantic_centroid import SemanticCentroidJsonClassifier
from libs.ml.models import Label
from libs.ml.processing.json import StructuredJsonVectorizer
from libs.ml.registry import (
    MethodSpec,
    MLRegistry,
    ParameterSpec,
)

_UNKNOWN_LLM_PROVIDER_ERROR = "Unknown LLM provider."

PROMPT_PARAM = ParameterSpec(
    name="prompt",
    label="Classification prompt",
    type="text",
    description="Custom prompt for LLM-based classification.",
)
TEMPERATURE_PARAM = ParameterSpec(
    name="temperature",
    label="Temperature",
    type="number",
    description="Sampling temperature for LLM-based classification.",
    default=0.0,
)
LLM_PROVIDER_PARAM = ParameterSpec(
    name="provider",
    label="LLM provider",
    type="string",
    description="Provider used by one-shot LLM methods: openai, ollama, or edf_iag.",
    default="openai",
)
LLM_MODEL_PARAM = ParameterSpec(
    name="model",
    label="LLM model",
    type="string",
    description="Model name passed to the selected LLM provider.",
    default="gpt-5.4-nano",
)
RULES_PARAM = ParameterSpec(
    name="rules",
    label="Rules (JSON)",
    type="json",
    required=False,
    description='Mapping of label id/name to keyword list, e.g. {"positive": ["good", "great"]}.',
)
DEFAULT_LABEL_PARAM = ParameterSpec(
    name="default_label",
    label="Default label",
    type="string",
    required=False,
    description="Optional label assigned when no rule matches.",
    default="",
)
IGNORED_KEYWORDS_PARAM = ParameterSpec(
    name="ignored_keywords",
    label="Ignored keywords (JSON)",
    type="json",
    required=False,
    description='List of words to exclude from keyword matching, e.g. ["maintenance", "control"].',
)
MAX_LABELS_PARAM = ParameterSpec(
    name="max_labels",
    label="Max predicted labels",
    type="number",
    required=False,
    description="Maximum number of labels to predict per sample. Labels with the most keyword matches are kept first.",
)


def create_default_ml_registry(
    *,
    include_llm: bool = False,
    include_sentence_transformers: bool = False,
) -> MLRegistry:
    """Return an ``MLRegistry`` populated with all built-in ML methods."""

    registry = MLRegistry()
    _register_rules_methods(registry)
    _register_text_single_label_methods(registry)
    _register_text_multi_label_methods(registry)
    _register_json_single_label_methods(registry)
    _register_json_multi_label_classifier_methods(registry)
    _register_feature_vector_classifier_methods(registry)
    _register_regression_methods(registry)
    if include_llm:
        _register_llm_methods(registry)
    if include_sentence_transformers:
        _register_sentence_transformer_methods(registry)
    return registry


def _make_tfidf(**kwargs: Any):
    from sklearn.feature_extraction.text import TfidfVectorizer

    return TfidfVectorizer(**kwargs)


def _make_structured_json_vectorizer(**kwargs: Any) -> StructuredJsonVectorizer:
    return StructuredJsonVectorizer(**kwargs)


def _make_sentence_transformer_vectorizer(
    model_name: str = "paraphrase-multilingual-MiniLM-L12-v2",
):
    from libs.ml.processing.text.embeddings import SentenceTransformerVectorizer

    return SentenceTransformerVectorizer(model_name=model_name)


def _label_ids_from_config(config: dict[str, Any]) -> list[str]:
    labels = config.get("labels", [])
    if isinstance(labels, dict):
        return [str(label_id) for label_id in labels]
    label_ids: list[str] = []
    for label in labels or []:
        if isinstance(label, Label):
            label_ids.append(label.id)
        elif isinstance(label, dict) and "id" in label:
            label_ids.append(str(label["id"]))
        else:
            label_ids.append(str(label))
    return label_ids


def _llm_client_from_config(config: dict[str, Any]) -> LLMClient:
    client = config.get("client")
    if client is not None:
        return client

    provider = str(config.get("provider", "openai")).lower()
    model = str(config.get("model") or "")
    timeout_seconds = float(config.get("timeout_seconds", 120.0))
    if provider == "openai":
        return OpenAILLMClient(
            model=model or "gpt-5.4-nano",
            base_url=config.get("base_url", OpenAILLMClient.base_url),
            api_key_env=config.get("api_key_env", "OPENAI_API_KEY"),
            api_key=config.get("api_key", ""),
            timeout_seconds=timeout_seconds,
        )
    if provider == "ollama":
        return OllamaLLMClient(
            model=model or "gemma4:e2b",
            base_url=config.get("base_url", "http://localhost:11434/api/chat"),
            timeout_seconds=timeout_seconds,
        )
    if provider == "edf_iag":
        return EDFIAGLLMClient(
            model=model or "C2-Cloud-Gemini-2.5-Flash",
            base_url=config.get("base_url", "https://llm.iag.edf.fr/v1/"),
            api_key=config.get("api_key"),
            api_key_env=config.get("api_key_env", "EDF_IAG_API_KEY"),
            timeout_seconds=timeout_seconds,
            verify_ssl=bool(config.get("verify_ssl", True)),
            ca_bundle_path=config.get("ca_bundle_path"),
        )
    raise ValueError(_UNKNOWN_LLM_PROVIDER_ERROR)


def _embedding_client_from_config(config: dict[str, Any]) -> OllamaEmbeddingClient:
    return OllamaEmbeddingClient(
        model=str(config.get("embedding_model", "nomic-embed-text")),
        base_url=str(config.get("embedding_base_url", "http://localhost:11434/api/embed")),
        timeout_seconds=float(config.get("embedding_timeout_seconds", 120.0)),
    )


def _register_rules_methods(registry: MLRegistry) -> None:
    registry.register(
        MethodSpec(
            key="keyword_classifier",
            formalisms=[KeywordTextClassifier.get_formalism()],
            name="Keyword Classifier",
            trainable=False,
            zero_shot=False,
            rule_based=True,
            parameters=[RULES_PARAM, DEFAULT_LABEL_PARAM, IGNORED_KEYWORDS_PARAM],
            description="Rule-based classifier for explicit keyword matching.",
        ),
        factory=lambda config: KeywordTextClassifier(
            rules=config.get("rules", {}),
            default_label=config.get("default_label") or "",
            ignored_keywords=config.get("ignored_keywords", []),
        ),
    )
    registry.register(
        MethodSpec(
            key="linguistic_keyword_classifier",
            formalisms=[LinguisticKeywordTextClassifier.get_formalism()],
            name="Linguistic Keyword Classifier",
            trainable=False,
            zero_shot=False,
            rule_based=True,
            parameters=[RULES_PARAM, DEFAULT_LABEL_PARAM, IGNORED_KEYWORDS_PARAM],
            description="Keyword classifier with stemming-based matching.",
        ),
        factory=lambda config: LinguisticKeywordTextClassifier(
            rules=config.get("rules", {}),
            language=config.get("language", "english"),
            default_label=config.get("default_label") or "",
            ignored_keywords=config.get("ignored_keywords", []),
        ),
    )
    registry.register(
        MethodSpec(
            key="random_classifier",
            formalisms=[TextRandomClassifier.get_formalism()],
            name="Random Classifier",
            trainable=False,
            zero_shot=False,
            description="Random baseline classifier.",
        ),
        factory=lambda config: TextRandomClassifier(
            labels=_label_ids_from_config(config),
            seed=int(config.get("seed", 42)),
        ),
    )


def _register_text_single_label_methods(registry: MLRegistry) -> None:
    registry.register(
        MethodSpec(
            key="svm_classifier",
            formalisms=[SVMTextClassifier.get_formalism()],
            name="SVM Classifier",
            trainable=True,
            zero_shot=False,
            description="Trainable support vector machine classifier for text inputs.",
        ),
        factory=lambda config: SVMTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="logistic_regression_classifier",
            formalisms=[LogisticRegressionTextClassifier.get_formalism()],
            name="Logistic Regression Classifier",
            trainable=True,
            zero_shot=False,
            description="Trainable logistic regression classifier for text inputs.",
        ),
        factory=lambda config: LogisticRegressionTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="random_forest_classifier",
            formalisms=[RandomForestTextClassifier.get_formalism()],
            name="Random Forest Classifier",
            trainable=True,
            zero_shot=False,
            description="Trainable random forest classifier for text inputs.",
        ),
        factory=lambda config: RandomForestTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="gradient_boosting_classifier",
            formalisms=[GradientBoostingTextClassifier.get_formalism()],
            name="Gradient Boosting Classifier",
            trainable=True,
            zero_shot=False,
            description="Trainable gradient boosting classifier for text inputs.",
        ),
        factory=lambda config: GradientBoostingTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="adaboost_classifier",
            formalisms=[AdaBoostTextClassifier.get_formalism()],
            name="AdaBoost Classifier",
            trainable=True,
            zero_shot=False,
            description="Trainable AdaBoost classifier for text inputs.",
        ),
        factory=lambda config: AdaBoostTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="mlp_classifier",
            formalisms=[MLPTextClassifier.get_formalism()],
            name="MLP Classifier",
            trainable=True,
            zero_shot=False,
            description="Trainable neural-network classifier for text inputs.",
        ),
        factory=lambda config: MLPTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_svm_classifier",
            formalisms=[SmartSVMTextClassifier.get_formalism()],
            name="Smart SVM",
            trainable=True,
            zero_shot=False,
            description="SVM classifier with automatic hyperparameter tuning.",
        ),
        factory=lambda config: SmartSVMTextClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_logistic_regression_classifier",
            formalisms=[SmartLogisticRegressionTextClassifier.get_formalism()],
            name="Smart Logistic Regression",
            trainable=True,
            zero_shot=False,
            description="Logistic regression classifier with automatic hyperparameter tuning.",
        ),
        factory=lambda config: SmartLogisticRegressionTextClassifier(
            feature_extractor=_make_tfidf()
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_random_forest_classifier",
            formalisms=[SmartRandomForestTextClassifier.get_formalism()],
            name="Smart Random Forest",
            trainable=True,
            zero_shot=False,
            description="Random forest classifier with automatic hyperparameter tuning.",
        ),
        factory=lambda config: SmartRandomForestTextClassifier(
            feature_extractor=_make_tfidf()
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_gradient_boosting_classifier",
            formalisms=[SmartGradientBoostingTextClassifier.get_formalism()],
            name="Smart Gradient Boosting",
            trainable=True,
            zero_shot=False,
            description="Gradient boosting classifier with automatic hyperparameter tuning.",
        ),
        factory=lambda config: SmartGradientBoostingTextClassifier(
            feature_extractor=_make_tfidf()
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_adaboost_classifier",
            formalisms=[SmartAdaBoostTextClassifier.get_formalism()],
            name="Smart AdaBoost",
            trainable=True,
            zero_shot=False,
            description="AdaBoost classifier with automatic hyperparameter tuning.",
        ),
        factory=lambda config: SmartAdaBoostTextClassifier(
            feature_extractor=_make_tfidf()
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_mlp_classifier",
            formalisms=[SmartMLPTextClassifier.get_formalism()],
            name="Smart MLP",
            trainable=True,
            zero_shot=False,
            description="Neural-network classifier with automatic hyperparameter tuning.",
        ),
        factory=lambda config: SmartMLPTextClassifier(feature_extractor=_make_tfidf()),
    )


def _register_text_multi_label_methods(registry: MLRegistry) -> None:
    registry.register(
        MethodSpec(
            key="keyword_multilabel_classifier",
            formalisms=[KeywordMultiLabelTextClassifier.get_formalism()],
            name="Keyword Classifier (Multi-Label)",
            trainable=False,
            zero_shot=False,
            rule_based=True,
            parameters=[RULES_PARAM, IGNORED_KEYWORDS_PARAM, MAX_LABELS_PARAM],
            description="Rule-based multi-label classifier — returns all labels with at least one keyword hit.",
        ),
        factory=lambda config: KeywordMultiLabelTextClassifier(
            rules=config.get("rules", {}),
            ignored_keywords=config.get("ignored_keywords"),
            max_labels=config.get("max_labels"),
        ),
    )
    registry.register(
        MethodSpec(
            key="linguistic_keyword_multilabel_classifier",
            formalisms=[LinguisticKeywordMultiLabelTextClassifier.get_formalism()],
            name="Linguistic Keyword Classifier (Multi-Label)",
            trainable=False,
            zero_shot=False,
            rule_based=True,
            parameters=[RULES_PARAM, IGNORED_KEYWORDS_PARAM, MAX_LABELS_PARAM],
            description="Stemming-based multi-label classifier — returns all labels with at least one keyword hit.",
        ),
        factory=lambda config: LinguisticKeywordMultiLabelTextClassifier(
            rules=config.get("rules", {}),
            language=config.get("language", "french"),
            ignored_keywords=config.get("ignored_keywords"),
            max_labels=config.get("max_labels"),
        ),
    )
    registry.register(
        MethodSpec(
            key="svm_multilabel_classifier",
            formalisms=[SVMMultiLabelTextClassifier.get_formalism()],
            name="SVM (Multi-Label)",
            trainable=True,
            zero_shot=False,
            description="Trainable support vector machine classifier for text multi-label targets.",
        ),
        factory=lambda config: SVMMultiLabelTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="random_forest_multilabel_classifier",
            formalisms=[RandomForestMultiLabelTextClassifier.get_formalism()],
            name="Random Forest (Multi-Label)",
            trainable=True,
            zero_shot=False,
            description="Trainable random forest classifier for text multi-label targets.",
        ),
        factory=lambda config: RandomForestMultiLabelTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="logistic_regression_multilabel_classifier",
            formalisms=[LogisticRegressionMultiLabelTextClassifier.get_formalism()],
            name="Logistic Regression (Multi-Label)",
            trainable=True,
            zero_shot=False,
            description="Trainable logistic regression classifier for text multi-label targets.",
        ),
        factory=lambda config: LogisticRegressionMultiLabelTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="mlp_multilabel_classifier",
            formalisms=[MLPMultiLabelTextClassifier.get_formalism()],
            name="MLP (Multi-Label)",
            trainable=True,
            zero_shot=False,
            description="Trainable neural-network classifier for text multi-label targets.",
        ),
        factory=lambda config: MLPMultiLabelTextClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_svm_multilabel_classifier",
            formalisms=[SmartSVMMultiLabelTextClassifier.get_formalism()],
            name="Smart SVM (Multi-Label)",
            trainable=True,
            zero_shot=False,
            description="SVM multi-label classifier with cross-validation diagnostics.",
        ),
        factory=lambda config: SmartSVMMultiLabelTextClassifier(
            feature_extractor=_make_tfidf()
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_random_forest_multilabel_classifier",
            formalisms=[SmartRandomForestMultiLabelTextClassifier.get_formalism()],
            name="Smart Random Forest (Multi-Label)",
            trainable=True,
            zero_shot=False,
            description="Random forest multi-label classifier with cross-validation diagnostics.",
        ),
        factory=lambda config: SmartRandomForestMultiLabelTextClassifier(
            feature_extractor=_make_tfidf()
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_logistic_regression_multilabel_classifier",
            formalisms=[
                SmartLogisticRegressionMultiLabelTextClassifier.get_formalism()
            ],
            name="Smart Logistic Regression (Multi-Label)",
            trainable=True,
            zero_shot=False,
            description="Logistic regression multi-label classifier with cross-validation diagnostics.",
        ),
        factory=lambda config: SmartLogisticRegressionMultiLabelTextClassifier(
            feature_extractor=_make_tfidf()
        ),
    )
    registry.register(
        MethodSpec(
            key="smart_mlp_multilabel_classifier",
            formalisms=[SmartMLPMultiLabelTextClassifier.get_formalism()],
            name="Smart MLP (Multi-Label)",
            trainable=True,
            zero_shot=False,
            description="Neural-network multi-label classifier with cross-validation diagnostics.",
        ),
        factory=lambda config: SmartMLPMultiLabelTextClassifier(
            feature_extractor=_make_tfidf()
        ),
    )


def _register_json_single_label_methods(registry: MLRegistry) -> None:
    registry.register(
        MethodSpec(
            key="keyword_json_classifier",
            formalisms=[KeywordJsonClassifier.get_formalism()],
            name="Keyword Classifier (JSON)",
            trainable=False,
            zero_shot=False,
            rule_based=True,
            parameters=[RULES_PARAM, DEFAULT_LABEL_PARAM, IGNORED_KEYWORDS_PARAM],
            description="Rule-based keyword classifier for JSON inputs.",
        ),
        factory=lambda config: KeywordJsonClassifier(
            rules=config.get("rules", {}),
            default_label=config.get("default_label", "__unknown__"),
            ignored_keywords=config.get("ignored_keywords"),
        ),
    )
    registry.register(
        MethodSpec(
            key="linguistic_keyword_json_classifier",
            formalisms=[LinguisticKeywordJsonClassifier.get_formalism()],
            name="Linguistic Keyword Classifier (JSON)",
            trainable=False,
            zero_shot=False,
            rule_based=True,
            parameters=[RULES_PARAM, DEFAULT_LABEL_PARAM, IGNORED_KEYWORDS_PARAM],
            description="Stemming-based keyword classifier for JSON inputs.",
        ),
        factory=lambda config: LinguisticKeywordJsonClassifier(
            rules=config.get("rules", {}),
            language=config.get("language", "french"),
            default_label=config.get("default_label", "__unknown__"),
            ignored_keywords=config.get("ignored_keywords"),
        ),
    )
    registry.register(
        MethodSpec(
            key="svm_json_classifier",
            formalisms=[SVMJsonClassifier.get_formalism()],
            name="SVM (JSON)",
            trainable=True,
            zero_shot=False,
            description="Trainable SVM classifier for JSON inputs.",
        ),
        factory=lambda config: SVMJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="linear_svm_json_classifier",
            formalisms=[LinearSVMJsonClassifier.get_formalism()],
            name="Linear SVM (JSON)",
            trainable=True,
            zero_shot=False,
            description="Fast linear SVM classifier for sparse JSON/text features.",
        ),
        factory=lambda config: LinearSVMJsonClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="sgd_hinge_json_classifier",
            formalisms=[SGDJsonClassifier.get_formalism()],
            name="SGD Hinge (JSON)",
            trainable=True,
            zero_shot=False,
            description="Fast SGD hinge-loss classifier for large sparse JSON/text features.",
        ),
        factory=lambda config: SGDJsonClassifier(
            feature_extractor=_make_tfidf(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="logistic_regression_json_classifier",
            formalisms=[LogisticRegressionJsonClassifier.get_formalism()],
            name="Logistic Regression (JSON)",
            trainable=True,
            zero_shot=False,
            description="Trainable logistic regression classifier for JSON inputs.",
        ),
        factory=lambda config: LogisticRegressionJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="random_forest_json_classifier",
            formalisms=[RandomForestJsonClassifier.get_formalism()],
            name="Random Forest (JSON)",
            trainable=True,
            zero_shot=False,
            description="Trainable random forest classifier for JSON inputs.",
        ),
        factory=lambda config: RandomForestJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="mlp_json_classifier",
            formalisms=[MLPJsonClassifier.get_formalism()],
            name="MLP (JSON)",
            trainable=True,
            zero_shot=False,
            description="Trainable neural-network classifier for JSON inputs.",
        ),
        factory=lambda config: MLPJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="gradient_boosting_json_classifier",
            formalisms=[GradientBoostingJsonClassifier.get_formalism()],
            name="Gradient Boosting (JSON)",
            trainable=True,
            zero_shot=False,
            description="Trainable gradient boosting classifier for JSON inputs.",
        ),
        factory=lambda config: GradientBoostingJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_svm_json_classifier",
            formalisms=[SmartSVMJsonClassifier.get_formalism()],
            name="Smart SVM (JSON)",
            trainable=True,
            zero_shot=False,
            description="SVM classifier with automatic hyperparameter tuning for JSON inputs.",
        ),
        factory=lambda config: SmartSVMJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_logistic_regression_json_classifier",
            formalisms=[SmartLogisticRegressionJsonClassifier.get_formalism()],
            name="Smart Logistic Regression (JSON)",
            trainable=True,
            zero_shot=False,
            description="Logistic regression classifier with automatic hyperparameter tuning for JSON inputs.",
        ),
        factory=lambda config: SmartLogisticRegressionJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_random_forest_json_classifier",
            formalisms=[SmartRandomForestJsonClassifier.get_formalism()],
            name="Smart Random Forest (JSON)",
            trainable=True,
            zero_shot=False,
            description="Random forest classifier with automatic hyperparameter tuning for JSON inputs.",
        ),
        factory=lambda config: SmartRandomForestJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_mlp_json_classifier",
            formalisms=[SmartMLPJsonClassifier.get_formalism()],
            name="Smart MLP (JSON)",
            trainable=True,
            zero_shot=False,
            description="Neural-network classifier with automatic hyperparameter tuning for JSON inputs.",
        ),
        factory=lambda config: SmartMLPJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="structured_logistic_regression_json_classifier",
            formalisms=[LogisticRegressionJsonClassifier.get_formalism()],
            name="Structured Logistic Regression (JSON)",
            trainable=True,
            zero_shot=False,
            description="Logistic regression classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: LogisticRegressionJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_linear_svm_json_classifier",
            formalisms=[LinearSVMJsonClassifier.get_formalism()],
            name="Structured Linear SVM (JSON)",
            trainable=True,
            zero_shot=False,
            description="Fast linear SVM classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: LinearSVMJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_sgd_hinge_json_classifier",
            formalisms=[SGDJsonClassifier.get_formalism()],
            name="Structured SGD Hinge (JSON)",
            trainable=True,
            zero_shot=False,
            description="Fast SGD hinge-loss classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SGDJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer(), **config
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_svm_json_classifier",
            formalisms=[SVMJsonClassifier.get_formalism()],
            name="Structured SVM (JSON)",
            trainable=True,
            zero_shot=False,
            description="SVM classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SVMJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_random_forest_json_classifier",
            formalisms=[RandomForestJsonClassifier.get_formalism()],
            name="Structured Random Forest (JSON)",
            trainable=True,
            zero_shot=False,
            description="Random forest classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: RandomForestJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_mlp_json_classifier",
            formalisms=[MLPJsonClassifier.get_formalism()],
            name="Structured MLP (JSON)",
            trainable=True,
            zero_shot=False,
            description="Neural-network classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: MLPJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_gradient_boosting_json_classifier",
            formalisms=[GradientBoostingJsonClassifier.get_formalism()],
            name="Structured Gradient Boosting (JSON)",
            trainable=True,
            zero_shot=False,
            description="Gradient boosting classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: GradientBoostingJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_smart_svm_json_classifier",
            formalisms=[SmartSVMJsonClassifier.get_formalism()],
            name="Structured Smart SVM (JSON)",
            trainable=True,
            zero_shot=False,
            description="Tuned SVM classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SmartSVMJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_smart_logistic_regression_json_classifier",
            formalisms=[SmartLogisticRegressionJsonClassifier.get_formalism()],
            name="Structured Smart Logistic Regression (JSON)",
            trainable=True,
            zero_shot=False,
            description="Tuned logistic regression classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SmartLogisticRegressionJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_smart_random_forest_json_classifier",
            formalisms=[SmartRandomForestJsonClassifier.get_formalism()],
            name="Structured Smart Random Forest (JSON)",
            trainable=True,
            zero_shot=False,
            description="Tuned random forest classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SmartRandomForestJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_smart_mlp_json_classifier",
            formalisms=[SmartMLPJsonClassifier.get_formalism()],
            name="Structured Smart MLP (JSON)",
            trainable=True,
            zero_shot=False,
            description="Tuned neural-network classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SmartMLPJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )


def _register_json_multi_label_classifier_methods(registry: MLRegistry) -> None:
    registry.register(
        MethodSpec(
            key="keyword_multilabel_json_classifier",
            formalisms=[KeywordMultiLabelJsonClassifier.get_formalism()],
            name="Keyword Classifier (Multi-Label JSON)",
            trainable=False,
            zero_shot=False,
            rule_based=True,
            parameters=[RULES_PARAM, IGNORED_KEYWORDS_PARAM, MAX_LABELS_PARAM],
            description="Rule-based multi-label classifier for JSON inputs.",
        ),
        factory=lambda config: KeywordMultiLabelJsonClassifier(
            rules=config.get("rules", {}),
            ignored_keywords=config.get("ignored_keywords"),
            max_labels=config.get("max_labels"),
        ),
    )
    registry.register(
        MethodSpec(
            key="linguistic_keyword_multilabel_json_classifier",
            formalisms=[LinguisticKeywordMultiLabelJsonClassifier.get_formalism()],
            name="Linguistic Keyword Classifier (Multi-Label JSON)",
            trainable=False,
            zero_shot=False,
            rule_based=True,
            parameters=[RULES_PARAM, IGNORED_KEYWORDS_PARAM, MAX_LABELS_PARAM],
            description="Stemming-based multi-label classifier for JSON inputs.",
        ),
        factory=lambda config: LinguisticKeywordMultiLabelJsonClassifier(
            rules=config.get("rules", {}),
            language=config.get("language", "french"),
            ignored_keywords=config.get("ignored_keywords"),
            max_labels=config.get("max_labels"),
        ),
    )
    registry.register(
        MethodSpec(
            key="svm_multilabel_json_classifier",
            formalisms=[SVMMultiLabelJsonClassifier.get_formalism()],
            name="SVM (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Trainable SVM multi-label classifier for JSON inputs.",
        ),
        factory=lambda config: SVMMultiLabelJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="logistic_regression_multilabel_json_classifier",
            formalisms=[LogisticRegressionMultiLabelJsonClassifier.get_formalism()],
            name="Logistic Regression (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Trainable logistic regression multi-label classifier for JSON inputs.",
        ),
        factory=lambda config: LogisticRegressionMultiLabelJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="mlp_multilabel_json_classifier",
            formalisms=[MLPMultiLabelJsonClassifier.get_formalism()],
            name="MLP (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Trainable neural-network multi-label classifier for JSON inputs.",
        ),
        factory=lambda config: MLPMultiLabelJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="random_forest_multilabel_json_classifier",
            formalisms=[RandomForestMultiLabelJsonClassifier.get_formalism()],
            name="Random Forest (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Random forest multi-label classifier for JSON inputs.",
        ),
        factory=lambda config: RandomForestMultiLabelJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_svm_multilabel_json_classifier",
            formalisms=[SmartSVMMultiLabelJsonClassifier.get_formalism()],
            name="Smart SVM (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="SVM multi-label classifier with automatic hyperparameter tuning for JSON inputs.",
        ),
        factory=lambda config: SmartSVMMultiLabelJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_logistic_regression_multilabel_json_classifier",
            formalisms=[SmartLogisticRegressionMultiLabelJsonClassifier.get_formalism()],
            name="Smart Logistic Regression (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Logistic regression multi-label classifier with automatic hyperparameter tuning for JSON inputs.",
        ),
        factory=lambda config: SmartLogisticRegressionMultiLabelJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_random_forest_multilabel_json_classifier",
            formalisms=[SmartRandomForestMultiLabelJsonClassifier.get_formalism()],
            name="Smart Random Forest (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Random forest multi-label classifier with automatic hyperparameter tuning for JSON inputs.",
        ),
        factory=lambda config: SmartRandomForestMultiLabelJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="smart_mlp_multilabel_json_classifier",
            formalisms=[SmartMLPMultiLabelJsonClassifier.get_formalism()],
            name="Smart MLP (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Neural-network multi-label classifier with automatic hyperparameter tuning for JSON inputs.",
        ),
        factory=lambda _: SmartMLPMultiLabelJsonClassifier(feature_extractor=_make_tfidf()),
    )
    registry.register(
        MethodSpec(
            key="structured_logistic_regression_multilabel_json_classifier",
            formalisms=[LogisticRegressionMultiLabelJsonClassifier.get_formalism()],
            name="Structured Logistic Regression (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Multi-label logistic regression classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: LogisticRegressionMultiLabelJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_svm_multilabel_json_classifier",
            formalisms=[SVMMultiLabelJsonClassifier.get_formalism()],
            name="Structured SVM (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Multi-label SVM classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SVMMultiLabelJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_random_forest_multilabel_json_classifier",
            formalisms=[RandomForestMultiLabelJsonClassifier.get_formalism()],
            name="Structured Random Forest (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Multi-label random forest classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: RandomForestMultiLabelJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_mlp_multilabel_json_classifier",
            formalisms=[MLPMultiLabelJsonClassifier.get_formalism()],
            name="Structured MLP (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Multi-label neural-network classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: MLPMultiLabelJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_smart_svm_multilabel_json_classifier",
            formalisms=[SmartSVMMultiLabelJsonClassifier.get_formalism()],
            name="Structured Smart SVM (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Tuned multi-label SVM classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SmartSVMMultiLabelJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_smart_logistic_regression_multilabel_json_classifier",
            formalisms=[SmartLogisticRegressionMultiLabelJsonClassifier.get_formalism()],
            name="Structured Smart Logistic Regression (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Tuned multi-label logistic regression classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SmartLogisticRegressionMultiLabelJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_smart_random_forest_multilabel_json_classifier",
            formalisms=[SmartRandomForestMultiLabelJsonClassifier.get_formalism()],
            name="Structured Smart Random Forest (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Tuned multi-label random forest classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SmartRandomForestMultiLabelJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="structured_smart_mlp_multilabel_json_classifier",
            formalisms=[SmartMLPMultiLabelJsonClassifier.get_formalism()],
            name="Structured Smart MLP (Multi-Label JSON)",
            trainable=True,
            zero_shot=False,
            description="Tuned multi-label neural-network classifier using structured JSON field vectorization.",
        ),
        factory=lambda config: SmartMLPMultiLabelJsonClassifier(
            feature_extractor=_make_structured_json_vectorizer()
        ),
    )


def _register_feature_vector_classifier_methods(registry: MLRegistry) -> None:
    # SVMFeatureVectorClassifier
    registry.register(
        MethodSpec(
            key="svm_feature_vector_classifier",
            formalisms=[SVMFeatureVectorClassifier.get_formalism()],
            name="SVM (Feature Vector)",
            trainable=True,
            zero_shot=False,
            description="Support vector machine classifier for generic feature vector inputs.",
        ),
        factory=lambda config: SVMFeatureVectorClassifier(**config),
    )

    # SmartSVMFeatureVectorClassifier
    registry.register(
        MethodSpec(
            key="smart_svm_feature_vector_classifier",
            formalisms=[SmartSVMFeatureVectorClassifier.get_formalism()],
            name="Smart SVM (Feature Vector)",
            trainable=True,
            zero_shot=False,
            description="SVM with hyperparameter tuning for feature vector inputs.",
        ),
        factory=lambda config: SmartSVMFeatureVectorClassifier(**config),
    )
    registry.register(
        MethodSpec(
            key="logistic_regression_feature_vector_classifier",
            formalisms=[LogisticRegressionFeatureVectorClassifier.get_formalism()],
            name="Logistic Regression (FV)",
            trainable=True,
            zero_shot=False,
            description="Logistic regression classifier for feature vector inputs.",
        ),
        factory=lambda config: LogisticRegressionFeatureVectorClassifier(**config),
    )
    registry.register(
        MethodSpec(
            key="random_forest_feature_vector_classifier",
            formalisms=[RandomForestFeatureVectorClassifier.get_formalism()],
            name="Random Forest (FV)",
            trainable=True,
            zero_shot=False,
            description="Random forest classifier for feature vector inputs.",
        ),
        factory=lambda config: RandomForestFeatureVectorClassifier(**config),
    )
    registry.register(
        MethodSpec(
            key="mlp_feature_vector_classifier",
            formalisms=[MLPFeatureVectorClassifier.get_formalism()],
            name="MLP (FV)",
            trainable=True,
            zero_shot=False,
            description="Neural network classifier for feature vector inputs.",
        ),
        factory=lambda config: MLPFeatureVectorClassifier(**config),
    )
    registry.register(
        MethodSpec(
            key="smart_logistic_regression_feature_vector_classifier",
            formalisms=[SmartLogisticRegressionFeatureVectorClassifier.get_formalism()],
            name="Smart Logistic Regression (FV)",
            trainable=True,
            zero_shot=False,
            description="Logistic regression with hyperparameter tuning for feature vector inputs.",
        ),
        factory=lambda config: SmartLogisticRegressionFeatureVectorClassifier(**config),
    )
    registry.register(
        MethodSpec(
            key="smart_random_forest_feature_vector_classifier",
            formalisms=[SmartRandomForestFeatureVectorClassifier.get_formalism()],
            name="Smart Random Forest (FV)",
            trainable=True,
            zero_shot=False,
            description="Random forest with hyperparameter tuning for feature vector inputs.",
        ),
        factory=lambda config: SmartRandomForestFeatureVectorClassifier(**config),
    )
    registry.register(
        MethodSpec(
            key="smart_mlp_feature_vector_classifier",
            formalisms=[SmartMLPFeatureVectorClassifier.get_formalism()],
            name="Smart MLP (FV)",
            trainable=True,
            zero_shot=False,
            description="Neural network with hyperparameter tuning for feature vector inputs.",
        ),
        factory=lambda config: SmartMLPFeatureVectorClassifier(**config),
    )


def _register_regression_methods(registry: MLRegistry) -> None:
    registry.register(
        MethodSpec(
            key="linear_regressor",
            formalisms=[LinearFeatureVectorRegressor.get_formalism()],
            name="Linear Regressor",
            trainable=True,
            zero_shot=False,
            description="Trainable linear regressor for scalar prediction targets.",
        ),
        factory=lambda config: LinearFeatureVectorRegressor(**config),
    )
    registry.register(
        MethodSpec(
            key="polynomial_regressor",
            formalisms=[PolynomialFeatureVectorRegressor.get_formalism()],
            name="Polynomial Regressor",
            trainable=True,
            zero_shot=False,
            parameters=[
                ParameterSpec(
                    name="degree",
                    label="Polynomial degree",
                    type="number",
                    description="Degree of the polynomial features.",
                    default=2,
                )
            ],
            description="Trainable polynomial regressor for nonlinear scalar targets.",
        ),
        factory=lambda config: PolynomialFeatureVectorRegressor(
            degree=int(config.get("degree", 2))
        ),
    )
    registry.register(
        MethodSpec(
            key="ridge_regressor",
            formalisms=[RidgeFeatureVectorRegressor.get_formalism()],
            name="Ridge Regressor",
            trainable=True,
            zero_shot=False,
            description="Ridge (L2-regularized) regressor for feature vector inputs.",
        ),
        factory=lambda config: RidgeFeatureVectorRegressor(**config),
    )
    registry.register(
        MethodSpec(
            key="lasso_regressor",
            formalisms=[LassoFeatureVectorRegressor.get_formalism()],
            name="Lasso Regressor",
            trainable=True,
            zero_shot=False,
            description="Lasso (L1-regularized) regressor for feature vector inputs.",
        ),
        factory=lambda config: LassoFeatureVectorRegressor(**config),
    )
    registry.register(
        MethodSpec(
            key="random_forest_regressor",
            formalisms=[RandomForestFeatureVectorRegressor.get_formalism()],
            name="Random Forest Regressor",
            trainable=True,
            zero_shot=False,
            description="Random forest regressor for feature vector inputs.",
        ),
        factory=lambda config: RandomForestFeatureVectorRegressor(**config),
    )
    registry.register(
        MethodSpec(
            key="gradient_boosting_regressor",
            formalisms=[GradientBoostingFeatureVectorRegressor.get_formalism()],
            name="Gradient Boosting Regressor",
            trainable=True,
            zero_shot=False,
            description="Gradient boosting regressor for feature vector inputs.",
        ),
        factory=lambda config: GradientBoostingFeatureVectorRegressor(**config),
    )
    registry.register(
        MethodSpec(
            key="svr_regressor",
            formalisms=[SVRFeatureVectorRegressor.get_formalism()],
            name="SVR Regressor",
            trainable=True,
            zero_shot=False,
            description="Support vector regression for feature vector inputs.",
        ),
        factory=lambda config: SVRFeatureVectorRegressor(**config),
    )


def _register_sentence_transformer_methods(registry: MLRegistry) -> None:
    registry.register(
        MethodSpec(
            key="st_svm_classifier",
            formalisms=[SVMTextClassifier.get_formalism()],
            name="SVM + Sentence Transformer",
            trainable=True,
            zero_shot=False,
            description="SVM classifier using sentence embeddings for text inputs.",
        ),
        factory=lambda _: SVMTextClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_logistic_regression_classifier",
            formalisms=[LogisticRegressionTextClassifier.get_formalism()],
            name="Logistic Regression + Sentence Transformer",
            trainable=True,
            zero_shot=False,
            description="Logistic regression classifier using sentence embeddings for text inputs.",
        ),
        factory=lambda _: LogisticRegressionTextClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_random_forest_classifier",
            formalisms=[RandomForestTextClassifier.get_formalism()],
            name="Random Forest + Sentence Transformer",
            trainable=True,
            zero_shot=False,
            description="Random forest classifier using sentence embeddings for text inputs.",
        ),
        factory=lambda _: RandomForestTextClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_mlp_classifier",
            formalisms=[MLPTextClassifier.get_formalism()],
            name="MLP + Sentence Transformer",
            trainable=True,
            zero_shot=False,
            description="Neural-network classifier using sentence embeddings for text inputs.",
        ),
        factory=lambda _: MLPTextClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_svm_multilabel_classifier",
            formalisms=[SVMMultiLabelTextClassifier.get_formalism()],
            name="SVM (Multi-Label) + Sentence Transformer",
            trainable=True,
            zero_shot=False,
            description="SVM multi-label classifier using sentence embeddings for text inputs.",
        ),
        factory=lambda _: SVMMultiLabelTextClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_mlp_multilabel_classifier",
            formalisms=[MLPMultiLabelTextClassifier.get_formalism()],
            name="MLP (Multi-Label) + Sentence Transformer",
            trainable=True,
            zero_shot=False,
            description="Neural-network multi-label classifier using sentence embeddings for text inputs.",
        ),
        factory=lambda _: MLPMultiLabelTextClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_svm_json_classifier",
            formalisms=[SVMJsonClassifier.get_formalism()],
            name="SVM + ST (JSON)",
            trainable=True,
            zero_shot=False,
            description="SVM classifier using sentence embeddings for JSON inputs.",
        ),
        factory=lambda _: SVMJsonClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_logistic_regression_json_classifier",
            formalisms=[LogisticRegressionJsonClassifier.get_formalism()],
            name="Logistic Regression + ST (JSON)",
            trainable=True,
            zero_shot=False,
            description="Logistic regression classifier using sentence embeddings for JSON inputs.",
        ),
        factory=lambda _: LogisticRegressionJsonClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_svm_multilabel_json_classifier",
            formalisms=[SVMMultiLabelJsonClassifier.get_formalism()],
            name="SVM (Multi-Label) + ST (JSON)",
            trainable=True,
            zero_shot=False,
            description="SVM multi-label classifier using sentence embeddings for JSON inputs.",
        ),
        factory=lambda _: SVMMultiLabelJsonClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )
    registry.register(
        MethodSpec(
            key="st_mlp_multilabel_json_classifier",
            formalisms=[MLPMultiLabelJsonClassifier.get_formalism()],
            name="MLP (Multi-Label) + ST (JSON)",
            trainable=True,
            zero_shot=False,
            description="Neural-network multi-label classifier using sentence embeddings for JSON inputs.",
        ),
        factory=lambda _: MLPMultiLabelJsonClassifier(
            feature_extractor=_make_sentence_transformer_vectorizer()
        ),
    )


def _register_llm_methods(registry: MLRegistry) -> None:
    registry.register(
        MethodSpec(
            key="llm_text_classifier",
            formalisms=[LLMZeroShotTextClassifier.get_formalism()],
            name="One-Shot LLM Text Classifier",
            trainable=False,
            zero_shot=True,
            parameters=[
                LLM_PROVIDER_PARAM,
                LLM_MODEL_PARAM,
                PROMPT_PARAM,
                TEMPERATURE_PARAM,
            ],
            description="Provider-agnostic one-shot LLM classifier for text inputs.",
        ),
        factory=lambda config: LLMZeroShotTextClassifier(
            client=_llm_client_from_config(config),
            labels=config["labels"],
            prompt=config.get("prompt", ""),
            multi_class=bool(config.get("multi_class", False)),
            temperature=float(config.get("temperature", 0.0)),
        ),
    )
    registry.register(
        MethodSpec(
            key="llm_json_classifier",
            formalisms=[LLMZeroShotJsonClassifier.get_formalism()],
            name="One-Shot LLM JSON Classifier",
            trainable=False,
            zero_shot=True,
            parameters=[
                LLM_PROVIDER_PARAM,
                LLM_MODEL_PARAM,
                PROMPT_PARAM,
                TEMPERATURE_PARAM,
            ],
            description="Provider-agnostic one-shot LLM classifier for JSON inputs.",
        ),
        factory=lambda config: LLMZeroShotJsonClassifier(
            client=_llm_client_from_config(config),
            labels=config["labels"],
            prompt=config.get("prompt", ""),
            multi_class=bool(config.get("multi_class", False)),
            allows_nested=bool(config.get("allows_nested", False)),
            selection_mode=config.get("selection_mode", "rank"),
            temperature=float(config.get("temperature", 0.0)),
        ),
    )
    registry.register(
        MethodSpec(
            key="llm_text_multilabel_classifier",
            formalisms=[LLMZeroShotTextMultiLabelClassifier.get_formalism()],
            name="One-Shot LLM Text Classifier (Multi-Label)",
            trainable=False,
            zero_shot=True,
            parameters=[LLM_PROVIDER_PARAM, LLM_MODEL_PARAM, PROMPT_PARAM, TEMPERATURE_PARAM],
            description="Provider-agnostic one-shot LLM multi-label classifier for text inputs.",
        ),
        factory=lambda config: LLMZeroShotTextMultiLabelClassifier(
            client=_llm_client_from_config(config),
            labels=config["labels"],
            prompt=config.get("prompt", ""),
            allows_nested=bool(config.get("allows_nested", False)),
            temperature=float(config.get("temperature", 0.0)),
        ),
    )
    registry.register(
        MethodSpec(
            key="llm_json_multilabel_classifier",
            formalisms=[LLMZeroShotJsonMultiLabelClassifier.get_formalism()],
            name="One-Shot LLM JSON Classifier (Multi-Label)",
            trainable=False,
            zero_shot=True,
            parameters=[LLM_PROVIDER_PARAM, LLM_MODEL_PARAM, PROMPT_PARAM, TEMPERATURE_PARAM],
            description="Provider-agnostic one-shot LLM multi-label classifier for JSON inputs.",
        ),
        factory=lambda config: LLMZeroShotJsonMultiLabelClassifier(
            client=_llm_client_from_config(config),
            labels=config["labels"],
            prompt=config.get("prompt", ""),
            allows_nested=bool(config.get("allows_nested", False)),
            temperature=float(config.get("temperature", 0.0)),
        ),
    )
    registry.register(
        MethodSpec(
            key="llm_few_shot_text_classifier",
            formalisms=[LLMFewShotTextClassifier.get_formalism()],
            name="Few-Shot LLM Text Classifier",
            trainable=True,
            zero_shot=False,
            parameters=[
                LLM_PROVIDER_PARAM,
                LLM_MODEL_PARAM,
                TEMPERATURE_PARAM,
                ParameterSpec(
                    name="n_samples_per_class",
                    label="Samples per class",
                    type="number",
                    default=3,
                ),
                ParameterSpec(
                    name="n_refinement_rounds",
                    label="Refinement rounds",
                    type="number",
                    default=2,
                ),
            ],
            description="LLM that synthesizes its own classification prompt from labeled examples and refines it iteratively.",
        ),
        factory=lambda config: LLMFewShotTextClassifier(
            client=_llm_client_from_config(config),
            labels=config.get("labels", []),
            n_samples_per_class=int(config.get("n_samples_per_class", 3)),
            n_refinement_rounds=int(config.get("n_refinement_rounds", 2)),
            temperature=float(config.get("temperature", 0.2)),
        ),
    )
    registry.register(
        MethodSpec(
            key="llm_few_shot_json_classifier",
            formalisms=[LLMFewShotJsonClassifier.get_formalism()],
            name="Few-Shot LLM JSON Classifier",
            trainable=True,
            zero_shot=False,
            parameters=[
                LLM_PROVIDER_PARAM,
                LLM_MODEL_PARAM,
                TEMPERATURE_PARAM,
                ParameterSpec(
                    name="n_samples_per_class",
                    label="Samples per class",
                    type="number",
                    default=3,
                ),
                ParameterSpec(
                    name="n_refinement_rounds",
                    label="Refinement rounds",
                    type="number",
                    default=2,
                ),
            ],
            description="LLM that synthesizes its own classification prompt from labeled JSON examples and refines it iteratively.",
        ),
        factory=lambda config: LLMFewShotJsonClassifier(
            client=_llm_client_from_config(config),
            labels=config.get("labels", []),
            n_samples_per_class=int(config.get("n_samples_per_class", 3)),
            n_refinement_rounds=int(config.get("n_refinement_rounds", 2)),
            temperature=float(config.get("temperature", 0.2)),
        ),
    )
    registry.register(
        MethodSpec(
            key="llm_few_shot_text_multilabel_classifier",
            formalisms=[LLMFewShotTextMultiLabelClassifier.get_formalism()],
            name="Few-Shot LLM Text Classifier (Multi-Label)",
            trainable=True,
            zero_shot=False,
            parameters=[
                LLM_PROVIDER_PARAM,
                LLM_MODEL_PARAM,
                TEMPERATURE_PARAM,
                ParameterSpec(
                    name="n_samples_per_class",
                    label="Samples per class",
                    type="number",
                    default=3,
                ),
                ParameterSpec(
                    name="n_refinement_rounds",
                    label="Refinement rounds",
                    type="number",
                    default=2,
                ),
            ],
            description="LLM that synthesizes its own multi-label classification prompt from labeled examples and refines it iteratively.",
        ),
        factory=lambda config: LLMFewShotTextMultiLabelClassifier(
            client=_llm_client_from_config(config),
            labels=config.get("labels", []),
            n_samples_per_class=int(config.get("n_samples_per_class", 3)),
            n_refinement_rounds=int(config.get("n_refinement_rounds", 2)),
            temperature=float(config.get("temperature", 0.2)),
        ),
    )
    registry.register(
        MethodSpec(
            key="semantic_centroid_json_classifier",
            formalisms=[SemanticCentroidJsonClassifier.get_formalism()],
            name="Semantic Centroid JSON Classifier",
            trainable=True,
            zero_shot=False,
            parameters=[
                LLM_PROVIDER_PARAM,
                LLM_MODEL_PARAM,
                ParameterSpec(
                    name="embedding_model",
                    label="Embedding model",
                    type="string",
                    default="nomic-embed-text",
                ),
                ParameterSpec(
                    name="embedding_base_url",
                    label="Embedding base URL",
                    type="string",
                    default="http://localhost:11434/api/embed",
                ),
                ParameterSpec(
                    name="max_samples_per_label",
                    label="Max samples per label",
                    type="number",
                    default=100,
                ),
                ParameterSpec(
                    name="max_centroids_per_label",
                    label="Max centroids per label",
                    type="number",
                    default=8,
                ),
                ParameterSpec(
                    name="refinement_iterations",
                    label="Refinement iterations",
                    type="number",
                    default=0,
                ),
                ParameterSpec(
                    name="max_refinement_samples_per_label",
                    label="Max refinement samples per label",
                    type="number",
                    default=20,
                ),
                ParameterSpec(
                    name="embedding_batch_size",
                    label="Embedding batch size",
                    type="number",
                    default=32,
                ),
                ParameterSpec(
                    name="label_score_aggregation",
                    label="Label score aggregation",
                    type="string",
                    default="max",
                ),
                ParameterSpec(
                    name="contrast_examples_per_other_label",
                    label="Contrast examples per other label",
                    type="number",
                    default=2,
                ),
                ParameterSpec(
                    name="cross_label_similarity_threshold",
                    label="Cross-label similarity threshold",
                    type="number",
                    default=1.0,
                ),
            ],
            description="Nearest-centroid classifier that uses LLM-generated semantic centroid descriptions for JSON inputs.",
        ),
        factory=lambda config: SemanticCentroidJsonClassifier(
            llm_client=_llm_client_from_config(config),
            embedding_client=_embedding_client_from_config(config),
            clustering_model=config.get("model"),
            embedding_model=str(config.get("embedding_model", "nomic-embed-text")),
            max_samples_per_label=int(config.get("max_samples_per_label", 100)),
            max_centroids_per_label=int(config.get("max_centroids_per_label", 8)),
            refinement_iterations=int(config.get("refinement_iterations", 0)),
            max_refinement_samples_per_label=int(config.get("max_refinement_samples_per_label", 20)),
            embedding_batch_size=int(config.get("embedding_batch_size", 32)),
            label_score_aggregation=str(config.get("label_score_aggregation", "max")),
            contrast_examples_per_other_label=int(config.get("contrast_examples_per_other_label", 2)),
            cross_label_similarity_threshold=float(config.get("cross_label_similarity_threshold", 1.0)),
        ),
    )
