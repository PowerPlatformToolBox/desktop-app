# Approved capability catalog

`invocation.capabilities` contains approved **discovery tags**, not API permissions.
Custom and organization-private tags are not accepted for new submissions.
Request registry approval before using a new tag.

## Developer setup

Install compatible releases of `@pptb/types` and `@pptb/validate`. In your tool
project's `.env`, configure the public endpoint once it is deployed:

```dotenv
PPTB_CAPABILITY_CATALOG_URL=https://YOUR-PPTB-WEB-HOST/api/capabilities
```

This URL is illustrative, not a deployed endpoint. The shell environment takes
precedence over the project-root `.env`, including an explicitly empty value.
No Supabase credentials are required or sent by the CLI. The endpoint must use
HTTPS without embedded credentials; redirects are rejected.

```bash
pnpm exec pptb-validate capabilities
pnpm exec pptb-validate
pnpm exec pptb-validate --offline
pnpm exec pptb-validate --require-live
```

`--require-live` is intended for submission/release checks: missing configuration,
network failures, invalid catalog responses, and HTTP errors fail the check.
`--offline` and `--require-live` cannot be combined.

Without `--require-live`, a failed live fetch uses the last-known-good catalog for
that exact URL, then the bundled snapshot if no usable cache exists. Diagnostics
identify the source, revision, publication date, fetch date when available, and
that current registry approval has **not** been verified. Missing endpoint
configuration also produces an explicit bundled-snapshot warning. Cached or
bundled checks can reject newly approved tags or accept subsequently retired tags;
they do not replace live submission approval.

The Node CLI cache lives under `~/.pptb/cache/capabilities`, keyed by a hash of the
endpoint URL. Each normal online invocation fetches again with a 10-second timeout.
A valid empty catalog is authoritative: no tags are approved, and fallback tags
are not merged into it.

### Editor autocomplete

Reference the bundled full-config JSON Schema:

```json
{
    "$schema": "./node_modules/@pptb/types/pptb.config.schema.json",
    "invocation": {
        "version": "1.0.0",
        "capabilities": ["fetchxml"]
    }
}
```

For editor guidance using the currently published catalog:

```bash
pnpm exec pptb-validate schema --require-live > pptb.config.schema.json
```

Then reference `./pptb.config.schema.json` instead. Diagnostics go to stderr;
schema JSON alone goes to stdout. Alternatively reference the web-hosted schema
once it is deployed. The schema covers invocation, agents, and workers; use
`pptb-validate` for authoritative cross-field rules.

`KnownCapabilityTag` and `CapabilityTag` are generated closed unions from the
bundled catalog. JSON configs may use newly approved tags before a new types
release when validated against the live catalog; TypeScript config declarations
must wait for an updated types release. There is no arbitrary-string escape hatch.

## Validation and migration

- Omitted and empty capability arrays remain valid.
- Unknown/inactive tags, duplicates, blank/non-string entries, wrong case, and
  surrounding whitespace are errors. Values are never silently rewritten.
- The core `validatePPTBConfig(config, packageJson?, options?)` stays synchronous
  and performs no networking. Pass `options.capabilityCatalog` to use the resolved
  catalog; otherwise it uses the bundled release-time snapshot.
- `options.capabilityValidation: "warning"` is only for desktop migration.
  Submission validators must use the default error policy.
- Existing installed tools retain launch and exact-match discovery behavior.
  Desktop loading logs unknown tags rather than blocking launches. Worker metadata
  loading explicitly uses warning-only capability checks so stricter submission
  validation does not block existing worker-backed tools.
- The desktop continues fetching active tags directly from Supabase; its bundled
  fallback now shares the validator's snapshot.

The initial bundled snapshot is the existing seven-tag baseline, not a newly
verified Supabase export.

## Catalog HTTP contract

Return HTTP 200 with `Content-Type: application/json`:

```json
{
    "schemaVersion": 1,
    "revision": "opaque-stable-revision",
    "publishedAt": "2026-10-21T12:00:00.000Z",
    "capabilities": [{ "tag": "fetchxml", "description": "Accept or process FetchXML queries" }]
}
```

Requirements:

- Only active, approved tags, unique and sorted by tag.
- Canonical lowercase kebab-case identifiers matching
  `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`; non-empty descriptions.
- A non-empty revision that changes with catalog content and an ISO publication
  timestamp for that revision. Do not use request time as the revision timestamp.
- HTTP errors for backend failures; do not turn failures into successful empty lists.
- `capabilities: []` is a legitimate successfully read empty registry.
- Public, read-only access. Administrative mutations remain protected.
- Retirement excludes a tag from the current catalog; identifiers are never reused
  for a different meaning.

Portable web exports from `@pptb/validate` include `parseCapabilityCatalog`,
`createPPTBConfigSchema`, and `validatePPTBConfig`. Node-only resolution/cache helpers
are available separately from `@pptb/validate/catalog-node`; the main entry point
does not import Node file-system modules.

## Maintaining the bundled artifacts

Once the endpoint exists, configure the repository-root `.env` and run:

```bash
pnpm --filter @pptb/validate refresh:catalog
pnpm --filter @pptb/validate build
pnpm --filter @pptb/validate check:generated
```

Refresh requires a live response and updates the bundled JSON snapshot, schema,
and declaration union together. Review the resulting changes before release.
Normal builds regenerate the schema and types from the committed snapshot without
network access. The check command detects artifact drift, ignoring JSON formatting.

Publish a new `@pptb/validate` release first, then bump/publish `@pptb/types` with
pnpm (its workspace dependency becomes an exact version), and update the web consumer. The stricter
validation and closed declaration union are intentional compatibility changes;
use the repository's release process rather than silently changing an existing
published version.

## Prompt for pptb-web implementation

Copy this prompt into the `pptb-web` repository:

```text
Implement the public capability catalog used by the desktop-app @pptb/validate
CLI and config editor schema. Inspect this repository's patterns and actual
Supabase capability_tags schema first. Do not create a second validation engine.

1. Expose GET /api/capabilities as a public, read-only HTTPS endpoint with no
   developer-supplied credentials. Return:
   {
     "schemaVersion": 1,
     "revision": "<stable content revision>",
     "publishedAt": "<ISO timestamp for this revision>",
     "capabilities": [{ "tag": "fetchxml", "description": "..." }]
   }
   Read only approved active rows (the desktop currently filters is_active=true).
   Validate with parseCapabilityCatalog from the updated @pptb/validate package.
   Use unique lowercase kebab-case tags, non-empty descriptions, and stable sorting.
   Inspect existing data for incompatibilities before rollout.

2. Persist/reuse a stable catalog publication timestamp and revision; update them
   when active tags or descriptions change, including retirement. Return the
   catalog and publication metadata from a consistent snapshot. Do not substitute
   per-request time. Return an explicit error status for database failures, never
   a successful empty list. A genuinely empty active registry returns [].
   Keep cache freshness bounded and invalidate it when the catalog changes.
   Do not expose service-role credentials or administrative write access.

3. Expose GET /api/pptb-config.schema.json using createPPTBConfigSchema with that
   same catalog revision. Preserve the complete invocation/agents/workers schema.
   Serve appropriate JSON content types and document both public URLs.

4. Update to the released shared @pptb/validate version containing the catalog
   contract. For all intake/review/submission paths, resolve the current catalog
   server-side and call validatePPTBConfig(config, packageJson,
   { capabilityCatalog: catalog }) using its default error policy. Do not use
   warning-only migration mode or fall back to a bundled/cached-unverified catalog
   to approve submissions. On catalog/database failure, report verification as
   unavailable and retry instead of approving or accusing the tool of unknown tags.
   Include the catalog revision in validation evidence.

5. Provide a developer-facing list of approved tags and descriptions and explain
   how to request a new tag. Custom/private tags are not supported. Keep tag IDs
   immutable and do not reuse retired IDs. Audit existing submissions before
   enforcement; do not disable installed tools as part of this change.

6. Test public reads, protected mutations, active/inactive tags, empty results,
   backend failures, publication revision consistency, schema/catalog agreement,
   newly approved tags, duplicates, case/whitespace errors, and identical shared
   validation verdicts. Follow repository-specific lint/build/test commands.

The desktop CLI reads PPTB_CAPABILITY_CATALOG_URL from process.env or a project
.env file. Provide the final public catalog URL after deployment so it can be
configured there. No desktop-app source changes should be needed to activate it.
```
