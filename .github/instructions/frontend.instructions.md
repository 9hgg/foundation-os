---
applyTo: "**"
---

# Copilot instructions: frontend (Nx + Angular)

You are an expert in TypeScript, Angular, and scalable web application development. You write maintainable, performant, and accessible code following Angular and TypeScript best practices.

## HTML Best Practices

A label component must be associated with a form element to avoid the "eslint@angular-eslint/template/label-has-associated-control" error.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain
- If possible and pertinent : provide your own typing.
- naming variable must be super explicit (i have no problem with long names). For example :
  - use `userAvatarUrl` instead of `url`
  - use `isFormValid` instead of `valid`
  - use `fetchUserData` instead of `fetchData`
  - don't do `const p = this.parameters();` but `const parameters = this.parameters();`
- **DO NOT** use the `as` type assertion — it is forbidden in this codebase because it can hide typing errors and bypass the compiler's checks.
- For example, the following is forbidden:
  `.pipe(map((res) => res.data as Sample[]));`
- Preferred approaches:
  - Use explicit type guards or narrowing: `.pipe(map((res) => res.data.filter((s): s is Sample => s !== null)));`
  - Or type the response correctly: `.pipe(map((res: ApiResponse<Sample[]>) => res.data));`
  These approaches keep types safe and explicit across the codebase.

## npm vs pnpm

- Use pnpm instead of npm.
- Don't use npx but pnpx if possible.

## Tools and logs

- If you are not responsible for running the serve method you can aux/ps to find processes and read the logs (or propose to kill it and run it yourself).
- Use tools at your disposal to check for warnings, style, linting, etc.
- check which path you are in with the `pwd`command. If you are indeed in the folder containing 'frontend' and 'backend' folder you can tail the frontend/serve.log file. If you are in the frontend frolder you can directly tail 'serve.log'. Don't forget to check for compilation errors through the tail command in this file when editing frontend files.

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Components

- **Consistency**: Before creating a new component, check for alike components that are already designed the right way to improve consistency.
- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- DO NOT use `ngStyle`, use `style` bindings instead

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Template naming convention: template variables (starting with `#`) used for `ng-template` must end with `Tpl` (e.g. `#myMenuTpl`)

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## RxJS & Lifecycle Management

- Use `takeUntilDestroyed()` **ONLY in constructor context** - it automatically captures the injection context at construction time
- **Do NOT** use `takeUntilDestroyed()` in `ngOnInit` or other lifecycle methods - the injection context is not available
- **Do NOT** inject `DestroyRef` and pass it as `takeUntilDestroyed(this._destroyRef)` - this is legacy pattern
- Pattern: Subscribe and add `.pipe(takeUntilDestroyed())` in constructor or in methods called directly from constructor
- For subscriptions in lifecycle hooks like `ngOnInit`, use `DestroyRef` if truly needed, or restructure to use constructor initialization

## Project facts

- nx monorepo with modern angular
- Framework: Angular 20+ (standalone components), TypeScript 5.8
- Apps are in the `apps/*` folder
- Libraries live in `libs/*` and are imported via path aliases (see below)
  - **Standard Library Architecture**: Most frontend libraries follow a consistent pattern. You will typically find:
    - **models**: Data models (typically extending `Resource` with id, createdAt, updatedAt).
    - **repository**: State management and backend communication (e.g., `*.repository.ts`).
    - **list**: Components for listing resources.
    - **tables**: Specific table definitions/components for the resource.
    - **builder/editor**: Components for creating or editing resources.
    - **modals**: Modal components and services (often to select resources).
    - **ui**: Basic reusable UI elements (pills, cards, etc.).
    - **pages**: Feature pages used by the Angular router.
- Styling: **CSS + Tailwind v4 + DaisyUI**.

  - **DaisyUI** should be used on top of Tailwind (and in priority) to take advantage of **automatic dark mode**.

  - When working on UI : don't forget to check both light and dark mode to ensure accessibility and consistency.
  - Tailwind utilities should be used in priority before creating new CSS classes.

- Prefer `rxjs` logic over promise and await stuff.

## How to run/build

- No need to run and build : the human will keep you aware if it does not run.

## Path aliases (import these, don’t use relative deep paths)

- Use `tsconfig.base.json` paths, e.g. `@foundation/*`, `@spoken/*`, `@curiosity/*`, `@edf/*`.
- Examples:
  - `@foundation/utils`, `@foundation/network/services`, `@foundation/network/interceptors`
  - `@spoken/pages`, `@spoken/ui`
  - Prefer these aliases over `../../../...` imports (unless relative imports in the same lib, using relative imports are forbidden)

## Testing & linting

- no need to do unit test for now.
- linting should be fixed most of the time

## Internationalization (i18n)

- Use `TranslationService` for handling translations in TypeScript.
- **Always** use the `prep` method for defining translatable strings that are used in code (e.g., toast messages, prompts, dynamic variables).
- Define prepared translations as private class properties starting with `_i18n_`.
- Access the translated string by calling the property as a function.

Example:

```typescript
private _i18n_success = this._translationService.prep('Action successful');
private _i18n_error = this._translationService.prep('An error occurred');

someMethod() {
    this._notificationService.success(this._i18n_success());
}
```

## ⚠️ CRITICAL: No app-specific strings in libs/

**MANDATORY RULE:** Libraries under `libs/` must be app-agnostic. DO NOT hardcode application-specific values such as:

- Domain names (e.g., "spoken.systems", "curiosity.app", etc.)
- Brand names or app names (e.g., "spOken", "Curiosity", etc.)
- Application URLs or text

Instead:

- **All application-specific configuration MUST be provided via `environment.ts`/`environment.prod.ts`** files per app
- Access config values from the environment object and pass them through services
- Pass configured values through services/components; don't hardcode them
- Each app (spoken, curiosity, etc.) provides its own environment file with app-specific values

This ensures `libs/` can be shared across multiple applications without conflicts.

Some are libs are made for specific apps : this is a pattern allowed only if some components of lib-for-app-A-001 and lib-for-app-A-002 may be shared so we get a lib-for-app-A. Some examples :

- libs/spoken
- libs/curiosity
