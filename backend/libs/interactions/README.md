# Interactions Library

## Description
The `interactions` library manages generic "interactions" which can be used to track events, user actions, or data associated with other resources (e.g., guest responses in an interview). It uses a token-based system for secure access to specific interaction records.

## Key Components

### Models
`libs.interactions.models`
- **`Interaction`**: Generic entity with a `key` (often linking to another resource like `item.id`) and a `config` dictionary for storing arbitrary data.

### API
`libs.interactions.api`
- **`POST /api/interactions/by-token/create`**: Creates a new interaction and returns a signed JWT token (`interactionToken`) that grants access to it.
- **`GET /api/interactions/by-token/{interactionToken}`**: Retrieves an interaction using its token.
- **`PUT /api/interactions/by-token/{interactionToken}`**: Updates an interaction using its token. This endpoint also triggers notifications on the linked resource if applicable (e.g., notifying an interview that a guest has responded).
- **`GET /api/interactions/by/{resource_kind}`**: Lists interactions associated with a specific resource type for the current user.

### Methods
`libs.interactions.methods`
- **`get_interaction_by_token`**: Decodes and validates the interaction JWT to retrieve the corresponding `Interaction` record.
- **`_get_interactions_for`**: Helper to find interactions linked to resources the user can access.

## Usage Overview
1.  **Create**: Generate an interaction and get a token.
2.  **Distribute**: Send the token (e.g., via a link) to a user (even anonymous).
3.  **Interact**: The user uses the token to read/write data to the interaction record.
4.  **React**: The system can trigger side effects (notifications) when the interaction is updated.

## Dependencies
- `python-jose` (for JWT handling)
- `sqlalchemy`
- `sqlmodel`
- `libs.resource`
- `libs.endpoints`
- `libs.acl`
