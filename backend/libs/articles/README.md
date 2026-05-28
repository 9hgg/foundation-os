# Articles Library

The `articles` library supplies one resource model for several article-backed
workflows:

- editorial content such as blog posts, guides, tutorials, and knowledge-base
  entries;
- backlog requests;
- private support tickets;
- assistant conversation containers.

These records share content, ACL, folder, and conversation capabilities. They
do not need separate models, and their classification, access, publication,
and collection placement are independent concerns.

## Model

`Article` is defined in `libs.articles.models` and is a
`ResourceWithConfig`. Its main fields are:

| Field | Purpose |
| --- | --- |
| `title`, `slug`, `summary`, `content` | Article text and routing identity |
| `author_id` | Optional creator or owner |
| `kind` | Semantic classification of the article |
| `draft` | Publication state used by public folder-backed article lists |
| `featured` | Whether a public collection should highlight the article |
| `time_published` | Publication timestamp maintained when draft state changes in the editor |
| `tags` | Content categorization |
| `config.comments_enabled` | Whether a default attached conversation is displayed |
| `config.images`, `config.deltas` | Rich editor and image metadata |

The backend uses snake_case fields. Frontend API payloads use the configured
camelCase aliases, for example `authorId`, `timePublished`, and
`commentsEnabled`.

### Independent dimensions

| Dimension | Meaning |
| --- | --- |
| `kind` | Why the article exists: content, support, backlog, or assistant. |
| Folder membership | In which configured collection an article may appear. |
| `draft` | Whether public folder presentation treats it as published. |
| Anonymous `READ` ACL | Whether anonymous visitors may read it. |
| `featured` | Whether it should be highlighted in lists. |
| Attached conversation | Discussion or comments associated with it. |

Changing one dimension must not silently change another:

- Changing `kind` does not change access, draft status, featured status, or
  folder membership.
- Adding an article to a folder does not make it editorial content or publish
  it.
- Toggling anonymous access does not publish or unpublish it.
- A `backlog` or `assistant` article may be presented by a public folder when
  its folder membership, publication state, and access permit that.

### Article kinds

| `kind` | Meaning | Common convention |
| --- | --- | --- |
| `default` | Documentation, blog, guide, knowledge-base, or authored article | Often folder-backed public content |
| `backlog` | Tracked request or feature proposal | Often created for public discussion |
| `support` | Support ticket | Usually private |
| `assistant` | Conversation-backed assistant item | Visibility depends on its use |

`kind` is filterable workflow metadata. It is not itself an access-control or
publication rule.

## Publication And Visibility

An article is directly readable by a visitor only when that visitor has
`READ` permission on it. For an unauthenticated visitor this means an
anonymous read ACL.

Public article collection pages are more selective. An article loaded from a
public folder is displayed only when all of the following are true:

1. It belongs to that folder.
2. `draft` is `false`.
3. It has an anonymous `READ` ACL.

This keeps access and editorial readiness distinct:

| `draft` | Anonymous `READ` ACL | Result in a public folder route |
| --- | --- | --- |
| `true` | Missing | Private unpublished article |
| `true` | Present | Readable by direct authorization, but not listed as published content |
| `false` | Missing | Not publicly readable or listed |
| `false` | Present | Visible in any configured folder containing it |

The article editor and admin tooling therefore expose separate controls for:

- draft/published state;
- public/private anonymous access;
- featured state;
- kind.

`time_published` is useful presentation metadata; the editor sets or clears it
when the draft state is explicitly toggled.

## Conversations And Comments

Articles may have a conversation attached to:

```text
resource_kind = "article"
resource_id   = <article id>
key           = "default"
```

`config.comments_enabled` determines whether an article page displays the
conversation as comments. Conversation-backed use cases include:

- comments on editorial content;
- discussion of a backlog request;
- private support exchanges;
- assistant conversation review.

The conversation remains attached when an administrator changes the article's
kind or adds the article to a content folder. Conversation creation itself
does not change the article's visibility, draft state, or kind.

## Workflow Flows

### Editorial content

A typical knowledge-base or blog workflow is:

```text
create article
  -> add it to a configured content folder
  -> edit while draft=true
  -> optionally enable comments
  -> set draft=false when editorially ready
  -> enable anonymous READ when it should be public
  -> appears in the public folder-backed route
```

An authored article will commonly use `kind="default"`, but public folder
rendering does not require that kind.

### Backlog request

A backlog request commonly starts as:

```text
kind = "backlog"
conversation key = "default"
```

The user-facing backlog creation flow may explicitly grant anonymous read
access because that surface represents public suggestions. That is a creation
policy of that UI, not an invariant of `kind="backlog"`.

If a backlog discussion becomes useful content, administration does not run a
conversion workflow. The administrator independently chooses to:

```text
add the existing article to a configured folder
  -> edit its content
  -> publish it and/or make it public
  -> optionally change kind separately
```

The existing conversation is preserved throughout.

### Support ticket

A support ticket commonly uses `kind="support"` and remains private. If the
same content later becomes a public backlog discussion or a knowledge-base
entry, an administrator explicitly updates only the relevant dimensions:

- `kind`, when its semantic classification changes;
- public ACL, when audience access changes;
- `draft`, when it should be published;
- folder membership, when it belongs in a public collection.

### Assistant article

An assistant conversation article uses `kind="assistant"`. It can stay private,
or an administrator may place it in a folder and publish it like any other
article. There is no special exclusion based on kind.

## Folders And Public Routes

Public article collections are configured per frontend application. The shared
article library does not know which folders represent a blog, documentation,
tutorials, or a knowledge base.

For a generic application called `sampleapp`, define folder IDs in its
environment:

```typescript
// frontend/apps/sampleapp/src/environments/environment.ts
export const environment = {
	articles: {
		folders: {
			blog: 'BLOG_FOLDER_UUID',
			guides: 'GUIDES_FOLDER_UUID',
			help: {
				articles: 'HELP_FOLDER_UUID',
			},
		},
	},
};
```

The environment type for that application must describe the same shape.
Configuration may be nested when the application's navigation requires nested
collections.

Then connect a public route to a configured folder:

```typescript
// frontend/apps/sampleapp/src/app/app.routes.config.ts
function generateArticleRoutes(path: string, sourceFolderId: string, listName: string, listDescription: string): Route {
	return {
		path,
		loadComponent: () => import('@foundation/articles/ui').then((module) => module.ArticleRootListComponent),
		data: { sourceFolderId, listName, listDescription, segmentPath: path },
	};
}

export const appRoutes: Route[] = [
	generateArticleRoutes(
		'guides',
		environment.articles.folders.guides,
		'Guides',
		'Practical documentation and how-to articles.'
	),
];
```

The route must provide a `sourceFolderId` to `ArticleRootListComponent` for
folder-backed public content.

### Important folder rules

- A public route displays eligible articles from its configured folder, not
  every article in the database.
- Folder membership does not require `kind="default"`.
- Folder membership alone does not publish an article.
- Public folder rendering omits draft articles even if they carry anonymous
  read access.
- An article may belong to more than one collection.
- If an application defines no article folder routes, it simply has no
  folder-backed public article collections.

## Admin Management

The shared admin articles/conversations page uses `ArticleTableComponent` in
admin mode. It lists articles through ordinary paginated article CRUD with
`bypass_acls=true`, so administration benefits from the normal pagination
behavior without adding stored admin ACLs to each article.

Admin mode adds:

- a `kind` column and kind filter;
- draft/published and featured status display;
- actions to change `kind`, draft, public access, and featured independently;
- folder assignment;
- expandable article content and attached conversation moderation.

The same reusable table is used outside administration without those admin
columns or actions.

Adding an article to a folder from the admin table uses a dedicated article
admin operation. Ordinary folder mutation endpoints retain their ordinary ACL
behavior; they do not gain implicit admin exceptions.

All custom article-admin operations require a verified administrator and use
`User.is_admin()`.

## Backend Integration

An application backend exposes the article API by including the shared router:

```python
from libs.articles.api import create_crud_article_router

asgi_app.include_router(create_crud_article_router())
```

Related shared routers are needed when the application uses article
conversations, folder-backed collections, ACL controls, and message moderation:

```python
from libs.acl.api import create_crud_acl_router
from libs.conversations.api import create_crud_conversation_router
from libs.folders.api import create_crud_folder_router
from libs.messages.api import create_crud_message_router

asgi_app.include_router(create_crud_acl_router())
asgi_app.include_router(create_crud_conversation_router())
asgi_app.include_router(create_crud_folder_router())
asgi_app.include_router(create_crud_message_router())
```

## API Reference

Article CRUD is created by `create_crud_endpoints(Article, ...)`:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/articles` | Paginated ACL-aware article list; admin management supplies `bypass_acls=true`. |
| `POST /api/articles` | Create an article. |
| `PUT /api/articles/{id}` | Replace an editable article. |
| `PATCH /api/articles/{id}` | Patch fields such as `kind`, `draft`, or `featured`. |
| `DELETE /api/articles/{id}` | Delete an editable article. |
| `GET /api/articles/check-slug/{slug}` | Check whether an article slug is available. |

Article administration provides:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/articles/admin/{id}/folder` | Add an article to a folder as an administrator without changing kind, ACLs, or publication state. |

Related APIs provide:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/acls/for/article/{id}/toggle-anonymous-read` | Toggle anonymous public read access. |
| `GET /api/folders/{folder_id}/add/article/{id}` | Add an article to a folder under ordinary folder/article ACL rules. |
| `GET /api/folders/{folder_id}/public_resources` | Return anonymous-readable resources in a folder; article public list components omit articles still marked as drafts. |
| `GET /api/conversations/for/article/{id}/default` | Load the article's attached default conversation. |

## Relevant Modules

| Module | Responsibility |
| --- | --- |
| `backend/libs/articles/models.py` | `Article`, its configuration, and article-admin input models |
| `backend/libs/articles/api.py` | Article CRUD options and narrowly scoped article-admin operations |
| `backend/libs/conversations/api.py` | Attach/read article conversations |
| `backend/libs/messages/api.py` | Conversation message operations and admin moderation |
| `backend/libs/folders/api.py` | General folder membership and public folder resource loading |
| `frontend/libs/articles/pages` | Host/editor and support/backlog creation pages |
| `frontend/libs/articles/ui` | Public article display and the reusable article table |
| `frontend/libs/admin/pages` | Administrative article/conversation review |
