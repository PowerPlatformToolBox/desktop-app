# Long-Term Plan: Shared `@pptb/validation` Package

## Problem

Tool validation logic is currently maintained in two separate places:

1. **`pptb-web/lib/tool-validation.ts`** — used by the official review pipeline (website + GitHub Actions).
2. **`packages/lib/validate.js`** (added in `@pptb/types`) — used by the `pptb-validate` CLI that tool developers run locally.

These two copies can drift over time. If the review criteria change in `pptb-web` but `packages/lib/validate.js` is not updated, a tool can pass local validation and still fail the official review. This is the opposite of the goal.

---

## Proposed Solution

Extract the validation logic into a dedicated, published npm package — **`@pptb/validation`** — that is consumed by both `pptb-web` and `@pptb/types`. There is then a single source of truth; any change to the validation rules is made once and takes effect everywhere.

```
┌────────────────────┐     ┌──────────────────────┐
│   pptb-web         │     │   @pptb/types         │
│ (review pipeline)  │     │ (pptb-validate CLI)   │
└────────┬───────────┘     └──────────┬────────────┘
         │                            │
         └──────────┬─────────────────┘
                    │  depends on
                    ▼
         ┌──────────────────────┐
         │   @pptb/validation   │
         │  (single source of   │
         │   truth for rules)   │
         └──────────────────────┘
```

---

## Implementation Steps

### Phase 1 — Create the `@pptb/validation` package

- [ ] Create a new directory: `packages-validation/` (or a new repo `pptb-validation`) for the package.
- [ ] Set `"name": "@pptb/validation"` in `package.json`.
- [ ] Port `packages/lib/validate.js` (or `pptb-web/lib/tool-validation.ts`) into this package as the canonical source. TypeScript is preferred; ship both ESM and CJS builds.
- [ ] Export the public API:
  - `validatePackageJson(pkg, options?)` — async validation function
  - `APPROVED_LICENSES` — approved license list
  - TypeScript types: `ValidationResult`, `ToolPackageJson`, `ValidationOptions`
- [ ] Write unit tests covering every validation rule.
- [ ] Publish to npm as `@pptb/validation`.

### Phase 2 — Update `pptb-web`

- [ ] Add `@pptb/validation` as a dependency in `pptb-web`.
- [ ] Replace the inline validation logic in `pptb-web/lib/tool-validation.ts` with a call to `validatePackageJson` from `@pptb/validation`.
- [ ] Run the existing `pptb-web` test suite to confirm no regression.
- [ ] Deploy `pptb-web`.

### Phase 3 — Update `@pptb/types`

- [ ] Add `@pptb/validation` as a dependency in `packages/package.json`.
- [ ] Replace `packages/lib/validate.js` with a thin re-export / proxy that delegates to `@pptb/validation`.
- [ ] Update `packages/bin/pptb-validate.js` to `require("@pptb/validation")` instead of `../lib/validate`.
- [ ] Bump and publish a new version of `@pptb/types`.

### Phase 4 — Ongoing governance

- [ ] Add a CI check in both `pptb-web` and `desktop-app` that fails if either repo pins an older version of `@pptb/validation` than the latest published version (optional but recommended).
- [ ] Document the update process: when validation rules change, update `@pptb/validation` first, then update the consumer packages.

---

## Migration Guide (for contributors)

When changing a validation rule:

1. Open a PR against the `@pptb/validation` package.
2. Update the rule and its tests.
3. Publish a new version (e.g. patch for bug fixes, minor for new checks).
4. Open PRs in `pptb-web` and `desktop-app` to bump the dependency.

Do **not** edit `pptb-web/lib/tool-validation.ts` or `packages/lib/validate.js` directly once the shared package is in place — those files should simply delegate to `@pptb/validation`.

---

## Interim State

Until `@pptb/validation` is created and both consumers are migrated, `packages/lib/validate.js` is the authoritative local copy. Any rule change in `pptb-web/lib/tool-validation.ts` **must** also be applied to `packages/lib/validate.js` manually, and vice versa. Reviewers should check both files when merging validation-related PRs.

---

## Related Files

| File | Role |
|---|---|
| `packages/lib/validate.js` | Current local copy of validation rules (in `@pptb/types`) |
| `packages/bin/pptb-validate.js` | CLI entry point; calls `validate.js` |
| `pptb-web/lib/tool-validation.ts` | Canonical server-side validation (review pipeline) |
