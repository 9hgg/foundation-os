# Articles Library

## Description
The `articles` library provides functionality for managing articles, which can be used for blogs, knowledge bases, tutorials, or backlog items. It includes support for drafting, publishing, tagging, and rich content management.

## Key Components

### Models
`libs.articles.models`
- **`Article`**: The main entity representing an article.
    - `title`, `slug`, `summary`, `content`: Core content fields.
    - `kind`: Type of article (e.g., "default", "support").
    - `draft`, `featured`, `time_published`: Publication status and metadata.
    - `tags`: List of strings for categorization.
    - `config`: Additional configuration like `images` and `comments_enabled`.
- **`ArticleConfig`**: Configuration model for articles.

### API
`libs.articles.api`
- **CRUD Endpoints**: Standard Create, Read, Update, Delete endpoints for articles.
- **`GET /check-slug/{slug}`**: Checks if a given slug is unique and available.

## Usage Examples

### Creating an Article
```python
from libs.articles.models import Article

article = Article(
    title="My First Post",
    content="Hello World...",
    tags=["intro", "blog"],
    draft=True
)
# Save to DB...
```

## Dependencies
- `sqlalchemy`
- `sqlmodel`
- `libs.resource`
- `libs.endpoints`
- `libs.db`
