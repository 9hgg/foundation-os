# i18n Library

## Description
The `i18n` library provides internationalization and translation support for the application. It handles dynamic translation of content, placeholder replacement, and language detection.

## Key Components

### Models
`libs.i18n.models`
- **`Translation`**: Stores cached translations (`source_content`, `language_target`, `translated_content`, `hash`).
- **`SimpleTranslator`**: Wrapper class for the translation function.

### API
`libs.i18n.api`
- **`POST /api/translations/translate/multiple`**: Translates a list of sentences in batch.
- **`GET /api/translations/translate/test`**: Test endpoint.

### Methods
`libs.i18n.methods`
- **`translate`**: Core function. Translates a sentence, optionally replacing placeholders (`§key`) with values from a dictionary (`kv`). Supports `replace_placeholders_before_translation` (rpbt) to control when substitution happens.
- **`get_translator`**: Dependency provider that returns a `SimpleTranslator` configured with the detected language (from headers or query params).

### Dependencies
`libs.i18n.deps`
- **`Translator__dep`**: FastAPI dependency to inject the `SimpleTranslator` into endpoints.

## Usage Example
```python
from libs.i18n.deps import Translator__dep

@router.get("/hello")
async def say_hello(translator: Translator__dep):
    return translator.translate("Hello, world!", lang="fr")
```

## Dependencies
- `fastapi`
- `libs.resource`
- `libs.endpoints`
