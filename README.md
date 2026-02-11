# foundation-os

A shared open-source monorepo of reusable building blocks for product development.

`foundation-os` is a **subset extracted from multiple larger repositories** and grouped in one place.
This subset is synchronized/merged through [`arboribus`](https://github.com/lakodo/arboribus) so common code can be shared across different activities (generic SaaS products and web apps).

## Main idea

Extract, sync, and reuse common resources across projects.

This repository provides:
- backend libraries (API, data, auth, files, tasks, infra helpers)
- frontend libraries (networking, state, UI primitives, media, tables, folders, notifications)
- cross-cutting conventions so modules can be combined consistently

The goal is not to ship one app, but to maintain a **foundation layer** shared between bigger codebases.

## Design principles

- App-agnostic by default: libraries should avoid hardcoded product/domain strings.
- Modular architecture: each domain lives in its own library (`libs/<domain>`).
- Predictable APIs: shared endpoint patterns, typed responses, and reusable methods.
- Practical over theoretical: prioritize useful primitives that remove repeated work.
- Open evolution: modules can grow independently as needs emerge.

## Repository structure

```text
foundation-os/
├── backend/
│   └── libs/
│       ├── endpoints/      # CRUD endpoint generator, filters, pagination patterns
│       ├── db/             # DB settings, session lifecycle, dependency helpers
│       ├── users/          # user model and user-oriented methods/endpoints
│       ├── auth/           # authentication provider management
│       ├── files/          # upload flow, storage abstraction, file processing
│       ├── tasks/          # background task orchestration
│       ├── mails/          # email providers and messaging routines
│       ├── interactions/   # token-based interaction flows
│       ├── cache/          # Redis cache abstraction
│       └── ...             # additional reusable backend modules
└── frontend/
    └── libs/
        ├── network/        # API services/interceptors/store
        ├── notifications/  # models, state, UI
        ├── interactions/   # models, state, modals, UI
        ├── folders/        # models, state, modals, UI
        ├── media/          # playback/recording building blocks
        ├── table/          # table UI and state primitives
        └── ...             # additional reusable frontend modules
```

## How to think about this monorepo

Use `foundation-os` as a toolbox:
1. Pick the modules needed by your app.
2. Compose them in your app layer.
3. Keep improvements inside reusable libraries when possible.
4. Sync back and forth with source repositories via `arboribus` when shared modules evolve.

If a feature is generic, it belongs here.
If a feature is product-specific, keep it in the consuming app.

## Current status

`foundation-os` is actively evolving as an engineering base.
Some libraries are mature, some are exploratory, but all aim at the same outcome: faster and cleaner product delivery through reuse.

## License

see [`LICENSE`](./LICENSE).
