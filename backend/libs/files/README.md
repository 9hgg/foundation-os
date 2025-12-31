# Files Library

## Description
The `files` library provides a comprehensive solution for file management within the application. It handles file uploads (including chunked uploads), storage abstraction (Local, GCP, S3), file processing, and database representation.

## Key Components

### Models
`libs.files.models`
- **`File`**: Represents a file entity in the database, storing metadata like filename, size, mime type, and storage location.
- **`StorageSettings`**: Configuration for different storage backends.
- **`FileAlternative`**: Represents alternative versions of a file (e.g., resized images, transcoded videos).

### API
`libs.files.api`
Provides FastAPI endpoints for file operations:
- **`POST /storage/get-upload-details`**: Initializes a file upload and returns a signed URL or upload instructions.
- **`PUT /storage/upload/...`**: Handles file content upload (for local storage or proxied uploads).
- **`GET /storage/get-chunk-upload-url`**: Supports chunked uploads for large files.
- **`POST /storage/update-after-upload`**: Confirm upload completion and trigger post-processing.

### Storage
`libs.files.storage`
Abstracts the underlying storage system.
- **`LocalStorage`**: Implementation for storing files on the local filesystem.
- **`get_file_storage`**: Factory to retrieve the appropriate storage backend based on settings.

### Processors
`libs.files.processors`
(Inferred) Contains logic for processing files, such as image resizing or format conversion.

## Usage Overview
1.  **Initialize Upload**: Client calls `/storage/get-upload-details` to get an upload URL.
2.  **Upload Content**: Client uploads file data to the returned URL (direct to cloud or via backend).
3.  **Confirm**: Client (or callback) calls `/storage/update-after-upload` to finalize the record and trigger processing tasks.

## Dependencies
- `fastapi`
- `sqlalchemy`
- `sqlmodel`
- `libs.db`
- `libs.acl` (for file access control)
- `libs.tasks` (for background processing)
