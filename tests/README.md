# Tests

This directory contains the full test suite for Power Platform ToolBox.

## Structure

```
tests/
  __mocks__/
    electron.ts          # Manual mock — replaces the Electron runtime in unit tests
    electron-store.ts    # Manual mock — replaces file-backed storage with in-memory Map
  unit/
    main/
      managers/          # Jest unit tests for main-process managers
    common/              # Jest unit tests for shared utility functions
    renderer/            # Jest unit tests for renderer utility functions
  e2e/
    fixtures.ts          # Playwright fixture: launches/tears down the Electron app
    app.spec.ts          # E2E: app launch and basic visibility
    navigation.spec.ts   # E2E: sidebar navigation
```

## Running tests

### Unit tests (Jest)

```bash
pnpm run test:unit          # run once
pnpm run test:unit:watch    # watch mode
pnpm run test:unit:coverage # with coverage report
```

### E2E tests (Playwright)

```bash
pnpm run build              # build the app first (e2e requires a built app)
pnpm run test:e2e           # run all e2e tests
pnpm run test:e2e:ui        # open Playwright UI mode
```

### All tests

```bash
pnpm run test               # unit + e2e
```

## Adding tests

### New unit test

Create a file under `tests/unit/` mirroring the source path, e.g.:

```
src/main/managers/myManager.ts  →  tests/unit/main/managers/myManager.test.ts
```

Import the module under test directly — Jest will automatically apply the
`electron` and `electron-store` mocks via `moduleNameMapper` in `jest.config.ts`.

### New e2e test

Create a `*.spec.ts` file in `tests/e2e/` and import `test` and `expect` from
`./fixtures` (not directly from `@playwright/test`) so that each test gets a
fresh Electron process.

## Mocks

| Mock file                     | What it replaces        | Key behaviour                                                                      |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `__mocks__/electron.ts`       | `electron` module       | `safeStorage` encodes/decodes via base64 Buffer; other APIs are Jest spy functions |
| `__mocks__/electron-store.ts` | `electron-store` module | In-memory `Map`-based store that mirrors the `electron-store` API                  |
