# Conversations Library

## Description
The `conversations` library manages conversation threads associated with various resources (like articles or backlog items). It supports features like reactions, rich text, and status management. It also handles access control, ensuring that conversations respect the permissions of the underlying resource.

## Key Components

### Models
`libs.conversations.models`
- **`Conversation`**: The main entity representing a conversation thread.
    - `key`: A unique identifier for the conversation (often scoped to a resource).
    - `resource_kind` / `resource_id`: Links the conversation to another resource.
    - `status`: "active", "hidden", or "disabled".
    - `config`: Configuration for reactions and rich text.
- **`ConversationConfig`**: Configuration model (e.g., `available_reactions`).

### API
`libs.conversations.api`
- **`POST /for/{resource_kind}/{resource_id}/{key}`**: Creates or retrieves a conversation for a specific resource. It automatically handles ACL creation and checks permissions on the parent resource.
- **`GET /for/{resource_kind}/{resource_id}/{key}`**: Retrieves a conversation, ensuring the user has read access to the parent resource.

## Usage Overview
1.  **Link to Resource**: Conversations are typically created "for" a resource (e.g., comments on an article).
2.  **Access Control**: Access to the conversation is inherited from the parent resource (e.g., if you can read the article, you can read the comments).
3.  **Reactions**: Users can react to messages (logic likely handled in a separate `messages` library, but configured here).

## Dependencies
- `sqlalchemy`
- `sqlmodel`
- `libs.resource`
- `libs.acl`
- `libs.endpoints`
