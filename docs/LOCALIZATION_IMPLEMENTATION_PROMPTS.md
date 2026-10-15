# Localization — Implementation Prompts

These prompts are for implementing the design in [LOCALIZATION_ARCHITECTURE.md](./LOCALIZATION_ARCHITECTURE.md) (issue [#705](https://github.com/PowerPlatformToolBox/desktop-app/issues/705)). Each one is meant to be pasted into a Claude Code session opened in the named repository. Each prompt stands alone, but they all depend on the same contracts (Appendix A of the architecture doc).

## Order

The repos depend on each other, so run the prompts in this order:

| #   | Repo                 | Prompt                                    | Depends on                                                     |
| --- | -------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| 1   | `pptb-translations`  | Translation pipeline and Blob publishing  | — (publishes the normalization test vectors everyone else uses) |
| 2   | `desktop-app`        | A — `@pptb/validate` localization checks  | —                                                              |
| 3   | `tool-management`    | Intake and update integration             | 1 (translate-tool workflow), 2 (published `@pptb/validate`)    |
| 4   | `desktop-app`        | B — App localization                      | 1 (Blob layout, test vectors)                                  |

Before you start:

- Create the empty `PowerPlatformToolBox/pptb-translations` repository.
- Create the public-read `translations` container in the existing storage account.
- Create a dispatch token (a GitHub App or fine-grained PAT with `actions: write` on `pptb-translations`), and save it as `TRANSLATIONS_DISPATCH_TOKEN` in `desktop-app` and `tool-management`.
- Commit and push the architecture doc. The prompts tell the agent to read it from the sibling `desktop-app` checkout; for a cloud session, replace that path with the doc's GitHub URL.

---

## 1. `pptb-translations` — Translation pipeline and Blob publishing

````text
You are setting up the new, empty PowerPlatformToolBox/pptb-translations repository. It is the single source of truth for every translation used by Power Platform ToolBox (PPTB): the desktop app's own UI and the tools hosted inside it. It is also the only place that calls the machine-translation service and the only place that writes translations to Azure Blob Storage.

READ FIRST
- ../desktop-app/docs/LOCALIZATION_ARCHITECTURE.md, especially §2, §6 (supply chain), §7 (one shared ToolBox translation set for both channels), §8 (tool versions), §12.4 (extraction), §16 (language lifecycle) and Appendix A (contracts). Appendix A is binding: file shapes, trigger inputs, the Blob layout and the normalization/hash rule must match it exactly. If something in it is unworkable, stop and tell me; do not change the contract silently.
- ../tool-management/.github/workflows/convert-tool.yml shows how the org already logs in to Azure (azure/login with AZURE_CREDENTIALS) and uploads with `az storage blob upload --auth-mode login`. Reuse that approach.

KEY RULES
- Nothing is translated at app runtime. This repo produces pre-built packs; the app only downloads them.
- Translations are stored once per distinct English string, keyed by source hash (Appendix A.1), never per version or channel.
- Insider (desktop-app dev) and Stable (desktop-app main) share ONE ToolBox source file, ONE index and ONE pack per language. The channel is only a tag on each English variant, used for retention, release gating and review priority (§7.2).
- Machine translations are committed automatically by the pipeline. A string with status "reviewed" is never overwritten by the pipeline.
- Starting languages: Chinese (Simplified) `zh-CN`, Spanish `es`, Hindi `hi`. English `en` is the source. All three start at status "preview".
- Coverage threshold used by the app is 60%. This repo only computes and publishes coverage; it does not enforce the threshold.

WHAT TO BUILD
1. Repo skeleton: Node 22, TypeScript, pnpm, minimal dependencies. README; CONTRIBUTING.md for translators (how to correct a string, what "reviewed" means, how to propose a language); CODEOWNERS with a placeholder per language.
2. Data layout exactly as in §6.2 / Appendix A.3: languages.json, glossary/<lang>.json, toolbox/source.json, toolbox/<lang>.json, tools/<tool-id>/{source.json,<lang>.json,metadata.<lang>.json}.
3. Normalization and hash library (Appendix A.1), plus spec/normalization-vectors.json with at least 30 vectors covering whitespace, NBSP, NFC/NFD, Chinese, Devanagari and Spanish accents. desktop-app tests will consume this file, so keep its path and shape stable.
4. Glossary seeds for zh-CN, es and hi. Do-not-translate terms include Power Platform, Power Apps, Power Automate, Power BI, Power Pages, Copilot Studio, Dataverse, Dynamics 365, PPTB, ToolBox. Preferred translations for common product terms (solution, environment, table, column, connection, flow, plug-in) should follow Microsoft's own localized Power Platform terminology. Mark entries you are unsure of so a reviewer can confirm them.
5. Translation provider interface with a first implementation for Azure AI Translator: batching, retry with backoff, rate limiting, and glossary support. Placeholders ({0}, {name}) and do-not-translate terms must be protected so the service cannot alter them. Credentials come from repo secrets only. Also provide a fake provider for tests and dry runs.
6. Validators run on every change (bot or human): JSON schema per file type; placeholder and ICU parity with the English source (Appendix A.5: only text segments translated; argument names and plural/select structure unchanged); glossary do-not-translate terms intact; no HTML or markup in translations; status is "machine" or "reviewed". Any PR that edits an entry by hand must end with that entry marked "reviewed".
7. Tool string extractor (§12.4): input is a tool package tarball. Extract static UI strings from HTML text nodes, translatable attributes (placeholder, title, aria-label, alt, button value), and JS string/template literals that look like UI text. Template literals become patterns with {0}, {1} slots. Skip URLs, identifiers, CSS classes, OData/FetchXML fragments, GUIDs, and symbol-only or very short strings. Read features.localization from the tool's package.json: skip languages listed in `native`, and skip the tool entirely if autoTranslate is false. Build a fixture set from real marketplace tools and report precision and recall on it in the PR.
8. Workflows. All workflows that commit share one concurrency group so they queue instead of racing. Bot commits rebase and retry on conflict.
   a. toolbox-catalog (repository_dispatch, event `toolbox-catalog`, inputs per A.2): check out desktop-app at `sha`, read the catalog at `catalogPath` (A.5), merge the catalog into toolbox/source.json, tagging each English variant with the channel and appVersion (A.3); record the build under builds.insider or append it to builds.stableReleases; drop variants no longer in the current insider catalog or the last 3 stable releases; translate only hashes with no translation, validate, commit.
   b. translate-tool (workflow_dispatch, inputs per A.2, run-name must include correlation_id so intake can find the run): download the package, verify package_sha256, extract, record the version against each hash, translate new hashes plus marketplace metadata (description from the tool's package.json; categories and tags from the registry entry in the tools container's registry.json), compute per-version coverage, validate, commit. The run must finish with the Blob index already updated, so it either runs the publish step itself or waits for it. Fail clearly so the caller can tell success from failure.
   c. backfill (workflow_dispatch with mode full|missing, optional languages and tool_ids; plus a nightly cron in "missing" mode): enumerate tools from the public registry.json (latest version plus versions inside the retention window of 5), run the translate-tool logic for each, batched, rate-limited, resumable and idempotent.
   d. publish (on push to main, plus manual "republish all"): work out the affected targets, rebuild only those packs per Appendix A.4, upload packs under their content SHA-256 (never overwrite), then upload indexes last. The ToolBox pack carries every retained English variant per key, and toolbox/index.json lists the current insider build and the retained stable releases with their sha and per-language coverage (A.4), so a Stable release build can wait for its own version. Tool packs carry strings from the latest 5 versions, split into "strings" and "patterns". Also publish marketplace/<lang>.json and languages.json. Packs get long cache lifetimes and indexes short ones. Write a coverage report to the job summary.
9. Tests for normalization, extractor, validators, pack building, coverage and pruning. A dry-run mode that uses the fake provider and writes to a local folder instead of Blob.

OUT OF SCOPE
App code, intake changes (tool-management) and @pptb/validate changes (desktop-app).

DELIVERY
Write docs/IMPLEMENTATION_PLAN.md first, as a checklist of PR-sized phases (skeleton and contracts → validators → provider → toolbox pipeline → extractor → tool pipeline → backfill → publish). Show it to me and wait for approval before writing code. Then implement one phase per PR. In each PR description, list the secrets and settings an admin has to configure.
````

---

## 2. `desktop-app` — A: `@pptb/validate` localization checks

````text
You are working in the PowerPlatformToolBox/desktop-app repository, in packages/validation (published as @pptb/validate, which is the single source of truth for both the pptb-validate CLI and the web intake platform). Add validation for the new tool localization declaration, so tool intake can reject tools whose native translations are incomplete.

READ FIRST
- docs/LOCALIZATION_ARCHITECTURE.md §13 (tool author contract) and Appendix A.6.
- packages/validation/src/validate.ts: follow the existing patterns (the Features interface, validatePackageJson, validatePPTBConfig, the ValidationResult shape, and how errors and warnings are worded).
- packages/types/toolManifest.d.ts: ToolPackageFeatures must gain the same declaration.

WHAT TO BUILD
1. `features.localization` in the Features type and in packages/types:
   { native?: string[]; resources?: string; autoTranslate?: boolean }.
2. Checks in validatePackageJson for the declaration:
   - native must be an array of unique, valid BCP 47 tags. If native is present it must include "en".
   - resources is required when native is present. It must be a relative path with no "..", no absolute path and no backslashes.
   - autoTranslate must be a boolean when present.
   - Warning, not error: a native code that is not one of PPTB's supported languages (en, zh-CN, es, hi). The app will just never select it.
3. A new exported validateLocalization(...) that checks the resource files themselves. It should take a package directory and also work from an in-memory file map, so the web intake can use it without a filesystem.
   - The resources folder exists, en.json exists, and there is a <code>.json for every native language.
   - Every file is valid JSON. Nested objects are flattened to dot keys.
   - Every key in en.json exists in each language file with a non-empty string value. Partial translations are an error (§13.3), and the error lists the missing keys, capped at around 20 with a "+N more" note.
   - Placeholder parity per key: {name}, {0}, and ICU argument names must match en.json.
   - Extra keys that are not in en.json are a warning.
4. pptb-validate CLI: run validateLocalization when given a tool directory whose package.json declares localization.
5. Unit tests that cover every rule, including nested keys, ICU plurals, and the file-map mode.
6. Bump the @pptb/validate and @pptb/types versions and add changelog entries, following the repo's existing release process for these packages.

OUT OF SCOPE
App runtime changes (prompt B) and intake workflow changes (tool-management).

DELIVERY
One PR from a branch off dev. The PR description should include a short "for tool authors" section showing a valid declaration and the validation errors an author would see.
````

---

## 3. `tool-management` — Intake and update integration

````text
You are working in the PowerPlatformToolBox/tool-management repository, which owns tool intake ("Convert and Publish Tool", .github/workflows/convert-tool.yml) and updates ("Convert and Update Tool", .github/workflows/update-convert-tool.yml, also triggered via check-updates.yml). Tool translation now has to become part of intake and update.

READ FIRST
- ../desktop-app/docs/LOCALIZATION_ARCHITECTURE.md §6.1, §6.5 B, §8, §13.3 and Appendix A.2. A.2 is binding: the translate-tool workflow inputs and the wait behaviour must match it.
- Both workflows end to end, and buildScripts/ (plain Node scripts with no dependencies, tested with `npm test`). Match that style.

WHAT TO BUILD
1. Localization validation, before the package is uploaded. After "Download and build tool", run the localization checks from @pptb/validate (validateLocalization, released by the desktop-app repo) against the built tool directory. If the tool declares native languages and they are incomplete, fail the run with the validator's messages in the job summary. Tools that declare nothing must pass unchanged. Pin the @pptb/validate version.
2. Translation step, after "Regenerate Azure Blob registry.json" and before "Update Supabase database", in both workflows. The version must not go live before its translations have been attempted.
   - Generate a correlation_id and dispatch the pptb-translations translate-tool workflow with: tool_id, version, package_url (the Blob URL of the uploaded tarball), package_sha256 (from "Generate checksum") and correlation_id.
   - Find the dispatched run by the correlation_id in its run name and poll until it completes. Time out after 20 minutes (configurable).
   - Success: note "translations published" and the per-language coverage for this version in the job summary (read tools/<tool-id>/index.json from the public translations container).
   - Failure or timeout: **do not fail intake.** Emit a warning annotation and a job-summary note that nightly reconciliation will retry, then continue to the Supabase update.
   - Put the dispatch-and-wait logic in one buildScripts/ script shared by both workflows, with tests that mock the GitHub API (dispatch accepted, run found, success, failure, timeout, run never appears).
3. Secrets: use only TRANSLATIONS_DISPATCH_TOKEN. No translation-service or translations-Blob credentials belong in this repo.
4. Add an input or repo variable to skip the translation step (for emergencies), defaulting to enabled.
5. Update README/docs: the new steps, the secret, and what intake operators see on success, failure and timeout.

OUT OF SCOPE
The translations pipeline itself (pptb-translations), validator rules (@pptb/validate), and app changes.

DELIVERY
Wait for prompt 1's translate-tool workflow and prompt 2's @pptb/validate release; if they are not available yet, put each step behind a repo variable that defaults to off. One PR. In the PR, include a dry run of each workflow (a run against a test tool, or a documented simulation).
````

---

## 4. `desktop-app` — B: App localization

````text
You are working in the PowerPlatformToolBox/desktop-app repository (Electron app; main process in src/main, renderer in src/renderer, shared code in src/common, public tool API types in packages/types). Implement localization of the ToolBox and the runtime side of tool translation, as designed in docs/LOCALIZATION_ARCHITECTURE.md.

READ FIRST
- docs/LOCALIZATION_ARCHITECTURE.md, all of it. Appendix A is binding (normalization/hash, Blob layout, pack and index shapes, catalog format, toolbox-catalog dispatch inputs).
- docs/N_CONNECTION_SUPPORT_PLAN.md: the format to use for your implementation plan.
- How theme currently reaches every surface (src/renderer/modules/themeManagement.ts, src/main/utilities/theme.ts, the modal and notification windows, and the tool BrowserViews). Locale should follow the same paths.
- How tools are hosted: src/main/managers/toolWindowManager.ts (BrowserView creation, the "toolbox:context" push), src/main/toolPreloadBridge.ts (isolated-world preload exposing toolboxAPI), src/main/managers/browserviewProtocolManager.ts (pptb-webview:// protocol), src/common/types/events.ts and packages/types/toolboxAPI.d.ts (ToolBoxEvent, ToolContext).
- Settings (src/main/managers/settingsManager.ts, src/common/types/settings.ts) and the preview-feature flags (PREVIEW_FEATURE_IDS).
- CI: .github/workflows/nightly-release.yml (Insider, built from dev) and prod-release.yml (Stable, built when a PR merges to main).

KEY RULES
- Nothing is translated at runtime. The app downloads pre-built packs from the public `translations` Blob container, verifies them, and caches them. It never sends UI text or data anywhere.
- Languages: English, Chinese (Simplified), Spanish, Hindi. Users pick languages by name (in the current UI language, with the native name alongside) and never see codes. OS matching follows §5.1. Traditional Chinese OS settings fall back to English.
- Telemetry, logs, Sentry, the CLI and MCP-facing text stay in English.
- Match the surrounding code's style, naming and comment density. Don't refactor unrelated code.

WHAT TO BUILD (organise it into PRs in your plan)
ToolBox shell
1. Locale Service (main): resolves the preference, falling back from the OS preferred languages to English; persists it in settings; broadcasts changes. It is the only place the locale is decided.
2. English catalog folder in the A.5 format, covering every user-visible string: menus, tray, sidebar, settings, marketplace, connections, modals, notifications, dialogs, errors. Use ICU MessageFormat with named args; choose a small, well-maintained library and justify the choice in the plan. Error messages keep a stable English error code.
3. ToolBox Catalog Service plus a renderer and modal i18n runtime: t(key, args), English fallback per key, hash-variant selection against the build's own English (A.4), `lang` set on every document, and re-rendering on change without a restart. Main-process menus and the tray rebuild on change.
4. Locale-aware formatting everywhere dates, numbers and sizes are shown (replace hard-coded "en-US", for example in homepageManagement).
5. Translation Sync Service (main), following §5.2 exactly. It makes NO translation network calls at start-up, on a timer, on tool open, or in the background. Network calls happen only on:
   - tool install or update: download the tool's index and its packs for every supported language except the tool's native ones;
   - "Refresh translations" in Settings › Language: languages.json and toolbox/index.json, plus any changed ToolBox packs, applied in place;
   - "Refresh translations" in the installed tool card's context menu (and the tool tab indicator): that tool's index and changed packs, re-applied in place if the tool is open;
   - the marketplace's existing tool-list fetch, which also loads marketplace/<lang>.json (no new trigger).
   Language change must never need the network: the ToolBox's languages are bundled and tool packs were saved at install or update. Use ETag conditional requests, sha256 verification, a disk cache under userData, and keep the last good copy. Report refresh failures to the user. Fully offline must work.
6. Bundled snapshot: at build time, fetch languages.json and the ToolBox packs for every supported language (one set for both channels) and bundle them. This is how ToolBox translations normally reach users, not just a fallback.
7. Settings UI: language picker (System default plus languages by name, native name and quality badge). Languages come from languages.json, with the bundled copy as fallback.
8. CI:
   - On push to dev or main, send repository_dispatch `toolbox-catalog` to pptb-translations (inputs per A.2) using TRANSLATIONS_DISPATCH_TOKEN.
   - Both the Stable release workflow and the Insider nightly workflow wait, with a timeout, until toolbox/index.json lists versions[<build appVersion>].sha equal to the build commit, then bundle the snapshot. If the wait times out, the build continues with the latest available packs and adds a warning to the job summary.
9. Quality: a lint rule flagging user-visible string literals that bypass t(); a dev-only pseudo-locale (en-XA); tests that run the normalization vectors from pptb-translations (spec/normalization-vectors.json); font fallback chains for Chinese and Devanagari (§14); checks for layout with longer Spanish text.

Tool side
10. Author contract (§13): ToolContext.locale; toolboxAPI.i18n (getLocale, onLocaleChanged, format helpers); a `locale:changed` ToolBoxEvent. Update packages/types and bump minAPI-related versioning as the repo does for API additions.
11. Tool Pack Manager (main), per tool, installed version and locale: Native if the manifest declares the locale → Original if the user or author turned translation off, or it is a local dev tool → Pack if the version's coverage is at least 60% → otherwise Original plus a warning notification, shown once per tool, version and language, with "Help translate" (link into pptb-translations) and "Don't show again for this tool". Unknown coverage counts as below threshold and uses the "still being prepared" wording, which points to the card's Refresh translations (the app never retries on its own). MCP headless launches skip translation.
12. Translation Engine, in the tool preload's isolated world, started before tool scripts run: walk text nodes and translatable attributes, exact plus pattern matching after A.1 normalization, MutationObserver batched per animation frame, protected regions (§12.1), memory of original text, revert and re-apply on locale change, and a budget guard for heavy-mutation subtrees. It must only set existing text-node values and attributes. Never wrap, replace or insert nodes, and never write HTML.
13. Tool tab indicator with Show original, Refresh translations, Report a bad translation (opens a prefilled pptb-translations issue: tool, version, language, English string, current translation, and nothing from the page), and Turn off for this tool. Add a "Refresh translations" item to the installed tool card's context menu.
14. Ship the tool-side runtime (11–13) behind a new preview feature flag.
15. Pass the locale to .NET and Node workers at launch. Show the effective language, pack versions and per-tool tier in About and the troubleshooting export.

DELIVERY
Write docs/LOCALIZATION_IMPLEMENTATION_PLAN.md first, as a checklist of PR-sized phases in the style of N_CONNECTION_SUPPORT_PLAN.md, aligned with §17 of the architecture doc, each with its own verification gate. Show it to me and wait for approval before writing code. Then implement one phase per PR from branches off dev, with unit tests, and Playwright coverage for the picker, a runtime language switch, and an auto-translated sample tool (sample-tools has candidates). Do not start the tool-side phases until the shell phases are merged.
````
