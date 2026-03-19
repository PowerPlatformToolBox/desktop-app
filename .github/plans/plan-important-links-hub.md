# Plan: Important links hub in sidebar (curated external links)

## Request summary

Add a curated set of external links (newsletters, release plans, calculators/estimators) to PPTB, exposed from the sidebar (with groupings), so the app becomes a single hub for important Power Platform resources.

## Goals

- Showcase the provided links in-app in a clean, discoverable sidebar layout with groupings.
- Open links safely in the user’s default browser.
- Keep the experience minimal and consistent with the existing Fluent UI-based design.
- Make the link collection easy to maintain via a JSON file (single source of truth).

## Non-goals

- No modals, filters, search, favorites/pinning, or personalization.
- No remote-config or network-fetched link lists.
- No new theme primitives (colors/fonts/shadows) or new icon sets.

## Assumptions / Open questions

- Links are **static** (shipped with releases).
- Clicking a link opens in the **system default browser**.
- URL opening for this hub is **strict allowlist** (only the curated set from JSON).
- Sidebar experience: **new Activity Bar item** that shows a dedicated sidebar panel for links.
- JSON location: `src/renderer/data/importantLinks.json` (renderer-only).

## Acceptance criteria

- The links are accessible from the **sidebar** (not the homepage) and grouped under clear headings.
- The link collection is stored in a **JSON file** (single source of truth) that is easy to maintain.
- The following links exist in the JSON and appear in the UI grouped as:
  - **Newsletters**
    - PP Weekly — https://www.ppweekly.com/
    - PP Dev Weekly — https://www.ppdevweekly.com/
  - **Release plans**
    - Release Plans Visualized — https://releaseplans.net/
  - **Calculators / estimators**
    - Dataverse Capacity Calculator — https://dataverse.licensing.guide/
    - Power Pages Licensing Cost Calculator — https://powerportals.de/tools/power-pages-pricing-calculator.html
    - Microsoft agent usage estimator — https://microsoft.github.io/copilot-studio-estimator/
- Clicking any item opens the URL via the app’s “open external” pathway (no in-app navigation).
- URL opening is safe:
  - Minimum: only `https:` URLs are allowed.
  - Strict allowlist: only URLs present in the JSON collection can be opened from this UI.
- UI uses Fluent UI Web Components and existing styling conventions (no new visual system).
- No production `console.*` logging is added.
- Any previous homepage rendering of this hub is removed/disabled (source of truth is sidebar).

## Current status (working tree)

The workspace already contains WIP changes that align with the updated direction:

- A new Activity Bar item + sidebar panel for links exists in `src/renderer/index.html`.
- A JSON collection exists at `src/renderer/data/importantLinks.json`.
- A renderer module exists at `src/renderer/modules/importantLinksSidebarManagement.ts` and is invoked by `src/renderer/modules/sidebarManagement.ts` when switching to the `links` sidebar.
- Main process hardening was added to `UTIL_CHANNELS.OPEN_EXTERNAL` to block invalid / non-https URLs.

The remaining work is primarily cleanup to ensure the hub is **sidebar-only** and **JSON is the single source of truth**.

## Triage

Type: **Standard**

Rationale:

- Small UX addition with a security-sensitive boundary (external navigation) plus a small nav placement change (sidebar). Low-risk when routed through existing IPC/preload APIs and validated.

## Participants (mesh)

- Product Manager (gateway)
- UI Designer
- Tech Designer
- Process Designer
- Critic

## Plan (drafted by agents)

### Product Manager (Orchestrator)

- Confirm the two open questions (browser behavior; allowlist strictness).
- Keep scope strictly to a single curated section on an existing screen (no new navigation surfaces).
- Require safe URL validation in the privileged layer (main process) if not already present.

### Process Designer

- Manual validation checklist:
  - Verify the “Important links” section renders with 3 categories and the 6 items above.
  - Click-test every link opens the default browser and the app remains usable.
  - Offline smoke: links still render; clicking doesn’t crash/freeze.
  - Rapid clicking doesn’t crash the app.
- Engineering validation:
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run build`

### UI Designer

- Placement: add an entry point in the sidebar (prefer a dedicated sidebar panel or a clearly labeled section inside an existing panel).
- Layout: one section titled **Important links** with a one-line helper text.
- Categories: three grouped blocks, each a small list of full-width “stealth” buttons.
- Interaction: clicking opens in the system default browser.
- Microcopy:
  - Heading: **Important links**
  - Helper: **Curated Power Platform resources—news, planning, and quick calculators.**
  - Category headings: **Newsletters**, **Release plans**, **Calculators / estimators**

### Data Architect

- Provide a minimal JSON structure that is stable and easy to edit:
  - `version` number
  - `groups[]` with `id`, `title`, and `links[]`
  - Each link has `id`, `label`, `url`

### Tech Designer

- Data structure: add a JSON file as the single source of truth (easy maintenance).
- Renderer: load JSON and render grouped links in a sidebar panel.
- Use the existing external-open capability via IPC/preload (`window.toolboxAPI.openExternal(url)`), not raw anchors.
- Security: validate URL protocol in main before calling `shell.openExternal`; enforce strict allowlist for this UI (based on JSON).
- Expected touchpoints (subject to confirmation during implementation):
  - JSON collection: `src/common/data/importantLinks.json` (preferred) or `src/renderer/data/importantLinks.json`
  - Sidebar UI + wiring: `src/renderer/index.html`, `src/renderer/modules/sidebarManagement.ts` and/or a dedicated new renderer module for links
  - Remove/disable homepage hub: `src/renderer/modules/homepageManagement.ts` (and any homepage container markup)
  - Styling: `src/renderer/styles.scss` or an appropriate sidebar stylesheet if present
  - If needed for hardening: `src/common/ipc/channels.ts`, `src/main/index.ts`, `src/main/preload.ts`, `src/common/types/api.ts`

#### Implementation deltas (to finish)

- Remove homepage hub UI and rendering:
  - Delete the homepage section markup for Important links from `src/renderer/index.html` (the `important-links-container` block).
  - Remove `renderImportantLinksHub()` and related allowlist logic from `src/renderer/modules/homepageManagement.ts`.
  - Remove homepage-specific CSS for the hub from `src/renderer/styles/homepage.scss` if it becomes unused.
- Make JSON the only maintained collection:
  - Remove the TS constants collection file `src/renderer/constants/importantLinks.ts` and any exports/imports that still reference `IMPORTANT_LINK_GROUPS` / `IMPORTANT_LINK_ALLOWLIST`.
  - Ensure sidebar rendering reads exclusively from `src/renderer/data/importantLinks.json`.
- Keep the change tightly scoped:
  - Revert unrelated changes detected in `src/main/managers/protocolHandlerManager.ts` (an early `return;` in `initialize()` that disables protocol handling).
  - Avoid landing additional unrelated formatting changes.

### Critic

- Primary risks: scope creep (favorites/search), UX clutter, and unsafe URL handling.
- Keep links static and explicitly allowlisted; block non-`https` and unexpected schemes.
- Ensure accessibility/keyboard navigation and no theme drift.

## Checkpoint

Status: **APPROVED**

- [x] Scope and acceptance criteria confirmed
- [ ] Critic reviewed (optional)
- [x] User approved plan (required for high-risk)

Rules:

- `Fast`: OK to proceed with **GO** once scope + acceptance criteria are confirmed.
- `Standard`: prefer Critic review; user approval recommended.
- `High-risk`: require explicit **APPROVED** before implementation.

---

## Execution log (only after GO/APPROVED)

### App Developer

- Added a new Activity Bar item + Links sidebar panel that renders grouped links from `src/renderer/data/importantLinks.json`.
- Implemented strict allowlist + `https:` normalization in `src/renderer/modules/importantLinksSidebarManagement.ts` and wired it via `src/renderer/modules/sidebarManagement.ts`.
- Ensured links open via `window.toolboxAPI.openExternal()`.
- Added minimal sidebar styling for link lists in `src/renderer/styles.scss`.
- Removed homepage-specific Important Links hub rendering (sidebar is the source of truth).

### Code Reviewer

- Verified no lingering homepage container/hooks remain for Important Links.
- Verified JSON is the maintained collection and allowlist is derived from it.
- Flagged a potential regression risk: `openExternal` IPC in `src/main/index.ts` now blocks non-`https:` URLs globally (safe, but may block legacy `http://` links if any exist).

### Security Reviewer

-

## Files expected to change

- Renderer: `src/renderer/index.html`
- Renderer: `src/renderer/modules/sidebarManagement.ts` (and/or a new minimal links sidebar module)
- Renderer: `src/renderer/modules/homepageManagement.ts` (remove/disable prior homepage hub)
- Renderer: styles file used for sidebar UI (TBD based on existing patterns)
- JSON collection: `src/common/data/importantLinks.json` (preferred) or `src/renderer/data/importantLinks.json`
- (Optional hardening) Main/IPC/preload/types: `src/main/index.ts`, `src/main/preload.ts`, `src/common/ipc/channels.ts`, `src/common/types/api.ts`

## Validation steps

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

## Risks & rollback

- Risk: URL handling could be too permissive. Mitigation: protocol validation + optional allowlist in main process.
- Risk: UI clutter on homepage. Mitigation: keep to 3 categories, small list, no extra chrome.
- Rollback: revert the renderer section + constant list; keep any hardened URL validation (safe to retain).

Notes:

- The current working tree contains changes in `.vscode/tasks.json` (switching build to pnpm and adding lint/typecheck tasks). This is useful but not required for the links hub; keep or revert based on your repo conventions.
