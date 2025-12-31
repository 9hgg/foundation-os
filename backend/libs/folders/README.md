# Folders Library

## Description
The `folders` library provides a hierarchical file-system-like structure for organizing resources. It supports nesting folders and linking various types of resources (files, tasks, etc.) to them.

## Key Components

### Models
`libs.folders.models`
- **`Folder`**: Represents a folder entity.
    - `name`: Folder name.
    - `parent_id`: ID of the parent folder (for hierarchy).
    - `for_kind`, `for_id`: Optional link to a specific resource context (e.g., a folder "for" a specific project).
- **`FolderToResource`**: Association table linking a folder to any resource (`folder_id`, `resource_kind`, `resource_id`).

### API
`libs.folders.api`
- **CRUD Endpoints**: Standard endpoints for managing folders.
- **`GET /{folder_id}/subfolders`**: Retrieves subfolders and resources within a folder (using CTEs for efficiency).
- **`GET /{folder_id}/add/{resource_kind}/{resource_id}`**: Adds a resource to a folder.
- **`GET /{folder_id}/remove/{resource_kind}/{resource_id}`**: Removes a resource from a folder.

### Methods
`libs.folders.methods`
- **`get_subfolders`**: Uses Recursive Common Table Expressions (CTEs) to fetch the folder tree efficiently.
- **`get_subfolders_and_resources`**: Fetches the folder tree along with contained resources.
- **`add_to_folder` / `remove_from_folder`**: Manages the `FolderToResource` links.

## Usage Overview
Folders act as containers. You can create a folder structure and "place" resources into them. The library handles the recursive retrieval of these structures.

## Dependencies
- `sqlalchemy`
- `sqlmodel`
- `libs.resource`
- `libs.endpoints`
- `libs.acl`
