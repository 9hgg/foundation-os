class MLError(ValueError):
    default_message = "ML library error"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.default_message)


class EmptyRulesError(MLError):
    default_message = "KeywordClassifier requires at least one label rule"


class EmptyLabelsError(MLError):
    default_message = "At least one label is required"


class ServiceUnavailableError(MLError):
    def __init__(self, *, provider: str, base_url: str, model: str):
        super().__init__(
            f"{provider} is not reachable at {base_url} for model '{model}'. "
            "Check the service availability and credentials."
        )


class InvalidStructuredOutputError(MLError):
    def __init__(self, *, model: str, details: str | None = None):
        message = f"Model '{model}' returned structured output that did not match the expected schema."
        if details:
            message = f"{message} {details}"
        super().__init__(message)


class InvalidLabelSelectionError(MLError):
    default_message = "The classifier response referenced an unknown label rank"
