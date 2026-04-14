# Leopar App - Project Management Tool

## Overview
Leopar is a project management application designed to handle complex R&D projects (like those in the `projetretd` POC). It aims to replace the legacy Python-based configuration approach with a modern, interactive web application using FastAPI and Angular.

## Legacy Features (from `projetretd` POC)
The original Proof of Concept (`tierces/edf-projetretd`) provided the following capabilities via Python scripts:

### Data Modeling (`types.py`)
- **Projects & Structure:** Hierarchical organization: `Projet` -> `Lot` (Batch) -> `Activité` (Activity).
- **Resources:** 
  - **Contributors (`Contributeur`):** Agents with specific categories (A-E) determining daily cost rates.
  - **Facilities (`MoyenDEssai`, `MoyenTransverse`):** Testing and cross-functional facilities with associated costs.
- **Deliverables (`Livrable`):** Tangible outputs with start/end dates, linked to clients and technical referents.
- **Financials:**
  - Automatic calculation of **"Coût Environné"** (Loaded Cost) applying a global overhead coefficient (1.38).
  - Tracking of contributions (days worked), purchases (`Achat`), and facility usage.

### Visualization & Reporting (`chiffrage.py`)
- **Timeline/Gantt:** Automated generation of HTML Gantt charts using Plotly, visualizing activity schedules and costs.
- **Budget Analysis:**
  - **Pie Charts:** Cost distribution by Lot.
  - **Yearly Histograms:** Bar charts showing cost evolution over years, globally or detailed per Lot.
- **Exports:** Generation of reports in HTML, PNG, and potentially PPTX formats.

---

## Migration Plan: Opus Architecture

We will migrate the features from the offline Python scripts to the Opus platform (FastAPI + Angular).

### Backend (FastAPI + SQLModel)
1.  **Domain Modeling**:
    -   Create dedicated libraries in `backend/libs/` for: `projects`, `activities`, `resources` (contributors/facilities), and `deliverables`.
    -   Convert Pydantic models from `types.py` into **SQLModel** database tables.
    -   Persist the "Category" logic (A, B, C...) and daily rates in a configuration or database table to avoid hardcoding.

2.  **Business Logic (`methods.py`)**:
    -   Port the **Cost Calculation Engine** (`coût_environné`). This needs to be dynamic, aggregating costs from child activities up to Lots and Projects.
    -   Implement API endpoints to serve data for charts (e.g., "expenses per year", "Gantt data structure").

3.  **API Structure**:
    -   Use `libs.projects` to manage the high-level Project entities.
    -   Use `libs.activities` for granular task management.
    -   Expose REST APIs consumed by the Angular frontend.

### Frontend (Nx + Angular)
1.  **Project Management GUI**:
    -   Replace the "Project defined in Python code" approach with interactive **Forms** (Angular Reactive Forms).
    -   **Project/Lot Editor**: Create, rename, and organize Lots.
    -   **Activity Planner**: specific interface to add activities, assign contributors (with auto-complete), and set dates.

2.  **Dashboards & Visualization**:
    -   **Gantt View**: Implement an interactive Gantt chart (using a library like `ngx-gantt` or similar) consuming the API data.
    -   **Financial Dashboard**: Recreate the Plotly visualizations (Pie charts, Histograms) using **Ngx-Charts** or **Chart.js**, fetching aggregated financial data from the backend.

3.  **Reporting**:
    -   Generate PDF/PPTX exports on the server side (using the logic from `presentations/`) triggered by frontend actions.

### Key Differences
-   **Interactivity**: Real-time editing vs. static script execution.
-   **Persistence**: Data stored in Postgres instead of ephemeral Python objects.
-   **User Management**: Integrate with Opus authentication to manage who can edit estimates or view sensitive cost data.
