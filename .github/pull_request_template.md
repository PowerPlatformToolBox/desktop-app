<!-- PR title format: [Type] Brief description — e.g. [Feature] Add connection export  -->
<!-- Types: [Feature] | [Fix] | [Docs] | [Refactor] | [Chore] | [Test] -->
<!-- Target branch: dev (not main) -->

## Summary

<!-- One or two sentences describing what this PR does and why. -->

Closes #<!-- issue number -->

## Type of change

- [ ] New feature
- [ ] Bug fix
- [ ] Refactor (no functional change)
- [ ] Documentation
- [ ] Chore / maintenance (dependency update, build, config)
- [ ] Test addition / improvement

## Changes

<!-- List the key files/areas changed and what was done. Be specific enough for a reviewer to navigate the diff. -->

-

## Architecture checklist

### Packages (`types` & `validation`)

<!-- Only fill in this section if you touched files under packages/. Otherwise delete it. -->

- [ ] **Not applicable** — no changes to `packages/`

If you did change a package:

- [ ] `@pptb/types` (`types`): type definitions updated and version bumped in `packages/types/package.json`
- [ ] `@pptb/validate` (`validation`): validation rules updated and version bumped in `packages/validation/package.json`

### Code quality

- [ ] `pnpm run typecheck` passes with **0 errors** (warnings are acceptable)
- [ ] `pnpm run lint` passes with **0 errors** (warnings are acceptable)
- [ ] `pnpm run build` completes successfully

## Testing

<!-- Describe how you verified this change works. -->

- [ ] `pnpm run test:unit` passes (for changes to `src/main/`, `src/common/`, or `src/renderer/` utilities)
- [ ] `pnpm run test:e2e` passes (for UI / navigation / end-to-end flows)
- [ ] Manually tested in the running app (`pnpm run dev`)

**Scenario tested:**

<!-- e.g. "Opened the app, navigated to X, confirmed Y behaviour" -->

## Screenshots / recordings

<!-- Attach screenshots or a short screen recording for any UI change. Delete this section if not applicable. -->

## Breaking changes

<!-- Does this change affect the tool API (`toolboxAPI` / `dataverseAPI`), existing IPC channels, or `pptoolbox-types`? -->

- [ ] No breaking changes
- [ ] Yes — describe impact and migration path below:

<!-- Breaking change details -->

## Reviewer notes

<!-- Anything specific you'd like reviewers to focus on, or context that helps them review faster. -->

- [ ] I have added appropriate unit and/or e2e tests for this change
- [ ] I have resolved all GitHub Copilot review comments
- [ ] I have followed the guidelines in [CONTRIBUTING.md](https://github.com/PowerPlatformToolBox/desktop-app/blob/dev/CONTRIBUTING.md#pull-requests)
