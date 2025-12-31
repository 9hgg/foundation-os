# Design Systems Library

## Description
The `design_systems` library manages design tokens and assets such as color palettes, fonts, and images. It enables the creation of consistent UI themes across the application.

## Key Components

### Models
`libs.design_systems.models`
- **`DesignSystem`**: The main entity representing a design system.
    - `name`, `description`: Basic metadata.
    - `thumbnail_id`: Preview image.
    - `config`: Contains lists of palettes, fonts, and images.
- **`DesignSystemConfig`**: Configuration holding the actual design tokens.
- **`Palette`**: A collection of colors.
- **`Color`**: A single color definition (name, value).
- **`Font`**: Font definition (family, size, URL).
- **`ThemeDetails`**: Helper for default theme settings (background, text color).

### API
`libs.design_systems.api`
- **CRUD Endpoints**: Standard endpoints to manage design systems.

## Usage Overview
1.  **Define Tokens**: Create a `DesignSystem` with palettes and fonts.
2.  **Apply Theme**: Use `ThemeDetails` or reference `DesignSystem` IDs to apply styles in the frontend or generated content.

## Dependencies
- `sqlalchemy`
- `sqlmodel`
- `libs.resource`
- `libs.endpoints`
