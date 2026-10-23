# Shared validation package

The shared package is implemented as **`@pptb/validate`** in
[`packages/validation`](../packages/validation). It is the source of validation
rules for the developer CLI and the web intake/review platform.

- [`src/validate.ts`](../packages/validation/src/validate.ts) exports
  `validatePackageJson`, `validatePPTBConfig`, and `validateWorkers`.
- [`src/cli.ts`](../packages/validation/src/cli.ts) implements `pptb-validate`.
- [`@pptb/types`](../packages/types/package.json) uses a workspace dependency on
  `@pptb/validate`; pnpm converts it to an exact version when publishing. Its CLI
  wrapper delegates to `@pptb/validate/cli`. Build the validator before using the
  workspace CLI.
- [`packages/lib/validate.js`](../packages/lib/validate.js) is an older, unpublished
  compatibility copy still covered by legacy tests. It is not the shipped CLI
  implementation; new catalog/submission consumers must use the shared package.

## Capabilities

The pure validator accepts a resolved catalog through
`validatePPTBConfig(config, packageJson, { capabilityCatalog })`. It rejects
unapproved discovery tags by default. The CLI resolves a configured public
catalog, with explicitly reported local cache/bundled fallback. Submission
approval requires current catalog verification, not fallback data.

The main package entry point is portable; Node-only fetch/cache/environment
helpers are exported separately from `@pptb/validate/catalog-node`.
Generated types, JSON Schema, and the desktop fallback share the bundled catalog.
See [Approved capability catalog](./CAPABILITY_CATALOG.md) for setup, maintenance,
the HTTP contract, and the implementation prompt for `pptb-web`.

## Changing validation

1. Update the rule and focused tests in this repository.
2. Build and validate `@pptb/validate`.
3. Publish a new package version following the repository's release process.
4. Publish `@pptb/types` with pnpm (which resolves its workspace dependency to the
   new validator version), update the web consumer, and deploy it.

Do not introduce a separate web validation engine. The local workspace's source
changes do not update an already published dependency automatically.
