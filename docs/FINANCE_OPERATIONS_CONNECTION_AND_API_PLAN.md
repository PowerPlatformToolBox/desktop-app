# Dynamics 365 Finance & Operations Connection and API Plan

Tracking issue: [PowerPlatformToolBox/desktop-app#504 — Add support for D365 Ops, Fin, Scm](https://github.com/PowerPlatformToolBox/desktop-app/issues/504). Implementation branch: [OliverFlint/finops-connection](https://github.com/OliverFlint/pptb-desktop-app/tree/finops-connection).

Status as of 2026-10-12: phases 1–4 are complete for the upstream PR on `finops-connection`, including live verification and sanitized fixture coverage. Shipping versions, release-specific compatibility metadata, publication and registry backend rollout are tracked separately as upstream release-process tasks.

| Phase                                | Implementation status    | Acceptance / outstanding work                                                                                                    |
| ------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Authentication and contract      | Complete                 | Both authentication flows, renewal, paging and restricted-user checks passed; sanitized fixture coverage completed on 2026-10-10 |
| 2 — Model, storage, compatibility    | Complete                 | Automated migration, compatibility, product guards, and legacy regression checks passed                                          |
| 3 — Authentication and OData manager | Complete                 | Automated transport coverage and all named live API checks passed; live validation and permission-denial fixtures captured       |
| 4 — Exposure, headless, UX           | Complete                 | Desktop/headless acceptance passed; upstream release-process tasks tracked separately below                                      |
| 5 — Batch / transactions             | Not started; later scope | Not required for the initial phases 1–4 release                                                                                  |

See the [manual testing record](FINANCE_OPERATIONS_MANUAL_TESTING.md#remaining-live-acceptance-checks) for individual results. Deferred or unavailable tests remain explicit verification gaps; they do not count as passes.

## Implementation progress

The first implementation slice adds the `connectionType` discriminator, idempotent migration of legacy saved connections to Dataverse, normalized F&O roots, supported-authentication/configuration validation, and import/export preservation of product type. Existing encrypted persistence and secret exclusions remain in use. Product changes on existing records are rejected.

Internal and public manifest contracts accept `features.connectionTypes`, with validation in both validator implementations. The shared compatibility resolver defaults undeclared tools to Dataverse and handles the Power Platform API restriction. It now filters single/multiple pickers and validates selections before authentication, desktop launch, reassignment, session restore authentication, inter-tool inheritance, MCP named-connection authentication, and headless execution. Reassignment rejection leaves existing slots intact, and mixed-type declarations preserve slot positions and gaps. F&O impersonation is rejected.

Registry mapping accepts the optional `tools_catalog.connection_types` field as an array or JSON-serialized array. Installation uses the package's declaration when the registry omits that field, so existing registries cannot discard a tool's product requirements. Backend release ingestion and view/schema changes must expose this field before catalog-wide filtering can use it; no remote schema was changed here.

Safe browser/headless connection getters include product type. Dataverse/Power Platform API managers remain guarded against F&O. Interactive and client-secret F&O authentication use the normalized root resource and probe the `/data/` service document. MSAL caches account for edited client/tenant/secret settings; saved tokens are invalidated when authentication settings change.

The regular add/edit UI now exposes F&O, requires explicit app/tenant configuration, hides unsupported authentication and Power Platform controls, and labels saved connections. The desktop and headless `financeOperationsAPI` share a facade for service discovery, raw XML metadata, one-page queries, keyed CRUD, and general OData requests. The transport confines URLs to the selected `/data` endpoint, rejects redirects and protected headers, bounds time/size, and preserves structured HTTP error details. Only GET retries once after a 401. Custom-header approval is separate from Dataverse and can be revoked in Consent Review. A read-only local sample and [manual testing guide](FINANCE_OPERATIONS_MANUAL_TESTING.md) are included.

Automated verification covers migration idempotence, mixed valid/invalid imports, sanitized exports, configuration and URL validation, validator parity, safe tool metadata, compatibility routing, and product guards. Normalized connections form a discriminated union restricting F&O authentication and Power Platform fields.

Live verification passed on 2026-10-08: Microsoft Login, client-secret authentication, OData reads and metadata, cross-company filtering, headless MCP reads, CustomersV3 create/retrieve/update/delete with cleanup, and the collection-bound GetInstalledModules action (HTTP 200, Collection(Edm.String)). CustomersV3 used environment-assigned account numbering and explicit cross-company keyed requests; the final read returned 404 after deletion. Interactive silent renewal and client-secret renewal subsequently passed, as confirmed by the user on 2026-10-09. Live paging subsequently passed, as confirmed by the user on 2026-10-10 after adding the sample page-size option. Restricted-user CustomersV3 read returned HTTP 403 on 2026-10-10: User is not authorized to read view CustCustomerV3Entity. Request denied. Restricted Test Connection and List entity sets also succeeded, user confirmed on 2026-10-10. The raw HTTP 403 denial was subsequently captured and sanitized on 2026-10-10, completing the phase 1 fixture coverage.

Validation after merging upstream dev (894ee21) on 2026-10-12: 1,298 unit tests across 66 suites and 30 selected UI checks (24 Electron checks plus six Chromium native-consent checks) pass. Typecheck, lint, desktop/CLI build, and `git diff --check` pass. Previous validation-package build and public declaration consumer checks passed; a package dry run confirms the F&O declaration is included. The headless sample passes config/query/paging-preservation/input/capability checks with a fixture API.

The validation-error follow-up includes bounded nested OData validation messages, deduplicates messages, redacts the token, and excludes server stack traces. Its 35 focused transport/manager tests, typecheck, lint, and desktop/CLI build pass. The most recent full unit run above preceded these three additional error tests.

The metadata follow-up raises the response limit to 100 MB and the default timeout to 120 seconds, and preserves cancellation reasons. Its 32 focused unit tests and four F&O Electron tests pass; build and lint also pass.

Current checks include unit coverage for URL boundaries, composite keys, compressed JSON/XML/204 responses, token renewal and write non-replay, consent separation, preload errors, and indexed headless routing. Electron checks cover regular F&O create/edit, picker compatibility, and the real tool-to-main IPC path with fixture HTTP responses.

The 2026-10-12 upstream integration retains native-worker lifecycle cleanup and instance-scoped header consent. F&O and Dataverse approvals remain separate for both persisted and per-instance grants, including queued requests. F&O compatibility metadata is registered before tool loading and cleared through the shared close lifecycle. Two upstream unit fixtures now use platform-resolved paths so the merged suite passes on Windows.

The connection list now offers a product filter with clear-filter support. The read-only sample includes a headless entry and MCP declaration for comparing the same query in both runtimes.

The [F&O fixture bundle](../tests/fixtures/financeOperations/README.md) contains sanitized live-derived customer/action samples, a sanitized live customer numbering error captured on 2026-10-10, reduced live service-document/CSDL captures added on 2026-10-10, two live-derived paging responses, and a sanitized live permission-denial response. Regression tests exercise the facade and HTTP transport together, including explicit continuation, complete composite keys, action POST/results and validation errors. All 45 focused F&O transport/authentication/manager tests pass. All required phase 1 fixture categories now have live-derived inputs with their reductions and sanitization documented.

Next: upstream review and release handoff. Upstream owns shipping-version selection, release-specific `features.minAPI` values, package/desktop publication and registry backend rollout. These tasks are listed separately below and do not block completion of the PR implementation phases. The sample currently targets this branch; it does not claim compatibility with a published PPTB release. Batch helpers remain a later phase.

## Goal and scope

Add a Dynamics 365 Finance & Operations (F&O) connection type and a dedicated `FinanceOperationsAPI`, exposed to tools as `window.financeOperationsAPI`. Tools should be able to read and write public F&O data entities through OData using the same connection selection, authentication, encrypted persistence, and connection-slot conventions as existing APIs.

The first release includes interactive authentication and client-secret authentication, OData queries, CRUD, service discovery, raw CSDL metadata, and OData actions through a general request method. Batch/transaction helpers are a subsequent phase. Custom JSON services, the separate REST metadata service, data-management package APIs, on-premises deployments, certificate authentication, and username/password authentication are outside the initial scope.

The API is available in local builds of this branch. The contract outline below describes the design; the matching internal and public declarations are the authoritative signatures.

## Platform facts informing the design

F&O exposes public data entities under `/data/` and CSDL under `/data/$metadata`. Record addressing requires every entity-key field. Responses are paged; company visibility defaults to the user's default company, with `cross-company=true` enabling other authorized companies. OData actions and batch changesets are available. See [Microsoft's F&O OData documentation](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/odata).

F&O supports authorization-code and client-credentials authentication. The OAuth resource is the environment root without a trailing slash. Service applications must be registered in F&O and mapped to a user with appropriate permissions. See [Microsoft's service endpoints and authentication guidance](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/services-home-page). MSAL client credentials use a resource's `/.default` scope; see [Microsoft's client credential guidance](https://learn.microsoft.com/en-us/entra/msal/dotnet/acquiring-tokens/web-apps-apis/client-credential-flows).

## Existing architecture and required changes

| Area                          | Current integration point                                                                             | Planned change                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Connection model              | `src/common/types/connection.ts`                                                                      | Introduce a product discriminator and product-specific validation.                      |
| Persistence and import/export | `src/main/managers/connectionsManager.ts`                                                             | Normalize legacy records; preserve encrypted secrets and export exclusions.             |
| Authentication                | `src/main/managers/authManager.ts`                                                                    | Select scopes and environment-access validation by connection type.                     |
| Dataverse operations          | `src/main/managers/dataverseManager.ts`                                                               | Reject F&O connections before authentication or network access.                         |
| New OData service             | Proposed `src/main/managers/financeOperationsManager.ts`                                              | Implement the F&O transport and API operations.                                         |
| IPC lifecycle                 | `src/common/ipc/channels.ts`, `src/main/index.ts`                                                     | Register and remove F&O handlers; route authorized tool slots.                          |
| Tool bridge                   | `src/main/toolPreloadBridge.ts`                                                                       | Expose `financeOperationsAPI` and safe connection-type metadata.                        |
| App API types                 | `src/common/types/api.ts`, `src/common/types/index.ts`                                                | Add matching internal contracts and window declarations where required.                 |
| Public declarations           | `packages/types/`                                                                                     | Ship `financeOperationsAPI.d.ts`, reference/export it, and include it in package files. |
| Connection UX                 | `src/renderer/modules/connectionManagement.ts`, add/edit/select connection modals                     | Add the type selector, F&O fields, type badges, and compatibility filters.              |
| Manifest contracts            | `src/common/types/tool.ts`, `packages/types/toolManifest.d.ts`, `packages/validation/src/validate.ts` | Declare supported connection types independently of slot counts.                        |
| Headless/MCP                  | `src/main/mcp/headlessToolRuntime.ts`, MCP connection and invocation handling                         | Expose the same API, enforce types, and return safe metadata.                           |

`resolveToolConnectionForRequest` in `src/main/utils/connectionTarget.ts` already resolves a tool instance's assigned connection. Extend this path with product validation instead of accepting arbitrary connection IDs from tool callers.

## Connection contract and compatibility

Use `connectionType: "dataverse" | "financeOperations"`. This is separate from `authenticationType`, which describes the sign-in mechanism.

- Normalize missing `connectionType` to `"dataverse"` on load/import and persist it on subsequent writes. Never infer the product from hostname.
- Explicit unknown types fail validation; do not silently treat them as Dataverse.
- Keep IDs, slot assignments, timestamps, categories, colors, and browser settings unchanged by migration.
- Model normalized connections as a discriminated union sharing common fields. F&O permits only `"interactive"` and `"clientSecret"` in the first release. Keep legacy Dataverse authentication behavior and connection-string parsing.
- Update `isConnection`, create/update IPC validation, imports, CLI/MCP validation, and public safe connection types together. The current guard and import validator have different accepted authentication values; avoid adding another divergence.
- Reuse `url` as the environment root. For F&O, accept an HTTPS root or a pasted `/data` or `/data/` URL and normalize it to the root. Reject credentials, query strings, fragments, entity paths, and unrelated paths. Do not impose a production-hostname suffix, because hosted development environments can differ.
- F&O interactive connections require a configured client ID and tenant ID initially. Do not inherit the existing Dataverse fallback client ID without verifying its F&O permissions and redirect configuration.
- F&O connections cannot enable Power Platform API access or Dataverse impersonation. Reject conflicting fields on create/update/import and hide these controls in the F&O form.
- Changing product type should create a new connection. Editing URL, tenant, client, or credentials must invalidate cached MSAL clients, tokens, access checks, and metadata for that connection.

Continue using the existing encryption manager and token fields. Export the discriminator and configuration, never secrets or tokens. Imported client-secret connections remain marked as having incomplete credentials until repaired. Extend every tool-safe serializer with the discriminator while retaining credential exclusions.

## Authentication and connection testing

Extract a small product-aware authentication profile from `AuthManager`: normalized resource, scopes, supported flows, and environment-access probe. Reuse browser selection, callback handling, token renewal, encrypted storage, and existing MSAL infrastructure.

For F&O, propose `${environmentRoot}/.default` for interactive and confidential-client MSAL requests. Confirm delegated consent and the configured desktop loopback redirect in the live authentication spike before finalizing this contract. Document Microsoft Dynamics ERP app permissions and F&O service-user mapping separately for each flow.

Replace the unconditional Dataverse `WhoAmI` probe with product dispatch. Propose an authenticated `GET /data/` service-document request for F&O; verify this with a suitably restricted user. A successful probe establishes service access, not permission to every entity or operation. Do not make connection testing depend on a particular business entity or legal entity.

Audit all authentication paths, including silent renewal and the existing additional `WhoAmI` call, rather than updating only initial browser sign-in. Distinguish invalid credentials, required interaction, missing F&O access, and entity permission failures. Headless unattended use must return an interaction-required error without opening a browser.

## Proposed tool-facing API

Keep familiar CRUD/query names, but use public entity-set names and explicit keys rather than Dataverse logical-name resolution and GUID assumptions. Preserve `"primary"`, `"secondary"`, and zero-based numeric slot targets; omitted targets resolve to primary.

```ts
declare namespace FinanceOperationsAPI {
    type ConnectionTarget = "primary" | "secondary" | number;
    type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

    // Shorthand strings/numbers/booleans; explicit literals cover other EDM types.
    type KeyValue = string | number | boolean | { odataLiteral: string };
    type EntityKey = Record<string, KeyValue>;

    interface RequestOptions {
        connectionTarget?: ConnectionTarget;
        headers?: Record<string, string>;
        timeoutMs?: number;
    }

    interface Page<T> {
        value: T[];
        "@odata.context"?: string;
        "@odata.nextLink"?: string;
        "@odata.count"?: number;
    }

    interface Response<T> {
        status: number;
        headers: Record<string, string>;
        body?: T; // Absent for an empty response, including 204.
    }

    interface API {
        request<T = unknown>(method: Method, path: string, body?: unknown, options?: RequestOptions): Promise<Response<T>>;
        queryData<T = Record<string, unknown>>(path: string, options?: RequestOptions): Promise<Page<T>>;
        retrieve<T = Record<string, unknown>>(entitySet: string, key: EntityKey, select?: string[], options?: RequestOptions): Promise<T>;
        create<T = Record<string, unknown>>(entitySet: string, data: Record<string, unknown>, options?: RequestOptions): Promise<Response<T>>;
        update(entitySet: string, key: EntityKey, data: Record<string, unknown>, options?: RequestOptions): Promise<Response<unknown>>;
        delete(entitySet: string, key: EntityKey, options?: RequestOptions): Promise<Response<unknown>>;
        getServiceDocument(options?: RequestOptions): Promise<unknown>;
        getMetadata(options?: RequestOptions): Promise<string>;
    }
}
```

Use an options object to keep additional request settings extensible. Define a typed service-document response before publishing the declarations; `unknown` above is a placeholder. Generic response types describe caller expectations, not runtime schema validation.

```ts
const page = await window.financeOperationsAPI.queryData("CustomersV3?$select=CustomerAccount,dataAreaId&$top=20" + "&$filter=dataAreaId eq 'USMF'&cross-company=true", { connectionTarget: 0 });

if (page["@odata.nextLink"]) {
    const nextPage = await window.financeOperationsAPI.queryData(page["@odata.nextLink"], { connectionTarget: 0 });
}

// Illustrative key: obtain the actual entity keys from the environment's metadata.
const customer = await window.financeOperationsAPI.retrieve("CustomersV3", { dataAreaId: "USMF", CustomerAccount: "C000001" });
```

Query strings remain caller-controlled; do not silently add company filters or cross-company access. Writes must supply the legal-entity fields and full keys required by the selected entity. No connection-level company override in the initial release.

`request` supports action paths as published by the environment metadata; it does not prepend a CRM namespace. Return XML text from `getMetadata`; postpone parsed metadata models and generated clients. Do not expose FetchXML, solution deployment, CRM metadata mutation, or Dataverse impersonation on this API.

## Transport, routing, and errors

Implement `FinanceOperationsManager` with a single authenticated request pipeline under the normalized `/data/` service root. Avoid copying the entire Dataverse manager; extract small shared utilities only where both services need identical behavior.

- Validate the connection type before acquiring tokens. Apply equivalent guards to Dataverse and Power Platform API entry points.
- Resolve relative paths under `/data/`. Accept absolute continuation URLs only for the selected environment's exact HTTPS origin and `/data/` path boundary. Reject protocol-relative URLs, userinfo, path traversal, encoded traversal/separators, and alternate ports/origins. Validate the final resolved URL before attaching authorization.
- Do not follow redirects with credentials; reject them initially. Apply the same URL policy to future batch subrequests.
- Preserve continuation query parameters without rebuilding skip tokens. Read one page per call; an eventual read-all helper must have explicit page/record limits and cancellation.
- Encode key property names and values safely. Escape OData string quotes before URI encoding; reject empty keys, null/undefined, non-finite or unsafe numbers, and unsupported objects. Explicit EDM literals require validation and cannot escape the key expression. Document number-precision limits and use literals for large integer/decimal keys.
- Send appropriate JSON and OData headers; handle JSON, XML metadata, compressed responses, and empty bodies deliberately. Keep a bounded timeout and response-size limit with validated caller overrides.
- Reuse the existing custom-header validation/consent policy, adapted for F&O names and origin. Tool headers cannot override authorization, host, framing headers, or inject CR/LF. Do not introduce a second incompatible consent system.
- Normalize HTTP failures into an IPC-safe error contract containing a stable code, status, sanitized service message, correlation/request ID when present, and retry delay when supplied. Preserve useful F&O validation details without exposing credentials or full business payloads in logs.
- On 401, attempt one silent token refresh where appropriate. Automatic retries are limited and bounded for reads; surface throttling delays. Never automatically replay writes or actions after uncertain delivery.
- Use the same validation, errors, and header policy in browser and headless runtimes. MCP calls must not bypass consent requirements; reuse the existing unattended policy.

## Tool compatibility and UI

Propose an additive manifest property:

```json
{
    "features": {
        "connections": { "min": 1, "max": 2 },
        "connectionTypes": ["financeOperations"]
    }
}
```

`connectionTypes` is a non-empty, unique allow-list of known types. Omission means `["dataverse"]`, preserving old tools' selection behavior. The existing `connections` contract continues to control slot counts. A tool declaring both products may assign either product to each slot; the API used for that slot must match its type. Per-slot product requirements can be a later extension.

Update the shared manifest types, TypeScript validator, shipped JavaScript validator, registry/installed metadata propagation, and public package together. Treat `enabledForPowerPlatformAPI` as Dataverse-only; reject an incompatible F&O-only manifest and filter mixed declarations to eligible Dataverse connections when that feature is enabled.

Enforce compatibility in single/multiple pickers, launch, change connection, restored assignments, tool-to-tool invocation, and MCP/headless launch. Picker filtering alone is insufficient. Display an actionable incompatibility error rather than silently rerouting a request to another slot.

Add the connection type to safe connection getters, context, and connection-change events using the existing payload patterns. Show Dataverse/F&O badges and a type filter in connection management. In F&O forms, show environment URL, tenant ID, client ID, supported authentication, and registration guidance; preserve browser-profile settings for interactive sign-in. Hide Dataverse connection-string input, impersonation controls, and Power Platform API opt-in.

F&O tools must declare the first desktop API version that ships this feature through `features.minAPI`. Update API availability/version handling and author docs so older hosts fail compatibility checks before launching a tool that requires F&O.

## Delivery phases

Item statuses updated on 2026-10-12. **Complete** means the item is implemented and its relevant checks passed; **Implemented** means local code is complete but the stated live verification is outstanding. **Deferred** records a user-requested delay, **Unavailable** records a missing test prerequisite, **Partial** identifies unfinished work, and **Pending / Not started** identifies remaining delivery work. Phase checkboxes remain unchecked until all required items and acceptance criteria are complete; no verification gaps have been waived.

### [x] Phase 1 — Authentication spike and contract confirmation

Status: complete. Both authentication flows, renewal, paging, restricted-user service access and entity denial passed; required fixture captures are recorded.

| Item                                                                                                       | Status   | Evidence / remaining work                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configured-client Microsoft Login and loopback redirect                                                    | Complete | Live sign-in passed on 2026-10-08                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| F&O service-document access probe                                                                          | Complete | Live connection tests and service discovery passed                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Client-secret sign-in and app-to-user registration instructions                                            | Complete | Live authentication passed after F&O app mapping                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Interactive silent renewal and client-secret renewal                                                       | Complete | Both live renewal tests passed, user confirmed on 2026-10-09                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Environment-root resource and scope behavior                                                               | Complete | Both live authentication flows passed using the implemented resource profile                                                                                                                                                                                                                                                                                                                                                                                                         |
| Restricted-user service access and entity permissions                                                      | Complete | Test Connection and List entity sets succeeded; CustomersV3 reads returned HTTP 403 denying CustCustomerV3Entity access. User confirmed both on 2026-10-10                                                                                                                                                                                                                                                                                                                           |
| Sanitized fixtures for service discovery, CSDL, composite keys, paging, actions and authorization failures | Complete | [Nine-file fixture bundle](../tests/fixtures/financeOperations/README.md) added with explicit provenance and regression coverage. Customer/action samples are sanitized live-derived; live service document and CSDL captured on 2026-10-10 and reduced to selected contracts; live validation-error envelope captured and sanitized on 2026-10-10. Both paging responses captured from the user on 2026-10-10; live permission-denial envelope captured and sanitized on 2026-10-10 |
| API names, key literals, manifest allow-list and deployment scope                                          | Complete | Contracts implemented and documented; hosted HTTPS, interactive/client-secret scope retained                                                                                                                                                                                                                                                                                                                                                                                         |
| Live paged OData read                                                                                      | Complete | User confirmed live paging passed on 2026-10-10 after adding the sample page-size option                                                                                                                                                                                                                                                                                                                                                                                             |

Exit: both authentication flows and a paged OData read work in a sandbox; registration instructions are reproducible. Both authentication flows and live paging passed. All named live checks passed, including restricted service access and entity denial. Live permission-denial capture is sanitized and covered by regression tests.

### [x] Phase 2 — Connection model, storage, and compatibility

Status: complete.

| Item                                                                          | Status   | Evidence                                                                   |
| ----------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| Normalized discriminated connection types                                     | Complete | Product-specific types and configuration validation implemented            |
| Legacy migration and encrypted persistence                                    | Complete | Idempotence and legacy-record regression checks passed                     |
| Product/authentication validation and import/export                           | Complete | Unsupported configurations rejected; product retained and secrets excluded |
| Safe browser/headless connection metadata                                     | Complete | Discriminator exposed without credentials                                  |
| Manifest allow-list resolution and validator parity                           | Complete | Undeclared tools default to Dataverse; both validators checked             |
| Existing slot semantics and mixed-product assignments                         | Complete | Indexed slots, gaps and inherited assignments covered                      |
| Compatibility enforcement across launch, restore, invocation and reassignment | Complete | Incompatible assignments rejected before authentication/network access     |
| Legacy Dataverse connections and tools                                        | Complete | Unit and selected Electron regression checks passed                        |

Exit: existing saved connections and old tools behave as before; incompatible assignments fail before network access. Automated acceptance passed.

### [x] Phase 3 — Product-aware authentication and F&O OData manager

Status: complete. Automated transport coverage and all named live API checks passed.

| Item                                                          | Status   | Evidence / remaining work                                                                                                         |
| ------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Product-aware scopes and access probes                        | Complete | Both live authentication flows and service access passed                                                                          |
| Cache invalidation after authentication configuration changes | Complete | Implemented with automated regression coverage                                                                                    |
| Refresh and unattended authentication behavior                | Complete | Fixture checks, live client-secret headless read, interactive silent renewal and client-secret renewal passed                     |
| Service document and raw XML metadata                         | Complete | Live reads passed; metadata size/timeout follow-up verified locally                                                               |
| One-page query API and next-link preservation                 | Complete | Reads and next-link fixture checks passed; user confirmed live paging passed on 2026-10-10                                        |
| Cross-company filtering                                       | Complete | Live test passed on 2026-10-08                                                                                                    |
| Create and keyed retrieve                                     | Complete | CustomersV3 passed using generated account numbering and explicit cross-company keyed read                                        |
| Update, delete and cleanup verification                       | Complete | PATCH/name verification, DELETE and final GET 404 passed                                                                          |
| General requests and OData actions                            | Complete | GetInstalledModules POST returned HTTP 200 and Collection(Edm.String)                                                             |
| URL, key, header, size, timeout and replay safeguards         | Complete | Automated boundary tests passed; writes are not automatically replayed                                                            |
| Structured errors and nested validation messages              | Complete | Live customer-number validation exposed; 35 focused transport/manager tests passed                                                |
| Product guards on Dataverse and Power Platform APIs           | Complete | Pre-network rejection covered by regression tests                                                                                 |
| Restricted-user authorization failures                        | Complete | User supplied live HTTP 403 denying reads of CustCustomerV3Entity on 2026-10-10; raw fixture captured and sanitized on 2026-10-10 |

Exit: fixture-based transport coverage passes and sandbox verification covers both flows, CRUD, paging, company filters, and an available action. All named live checks passed, including paging confirmed on 2026-10-10; restricted service access and entity denial also passed on 2026-10-10. Live denial capture is sanitized and covered by regression tests.

### [x] Phase 4 — Tool exposure, headless support, and connection UX

Status: complete for the upstream PR. Local implementation and live execution acceptance passed. Remaining shipping and backend rollout tasks belong to the upstream release process and are tracked separately.

| Item                                                                 | Status   | Evidence / remaining work                                                                                 |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| IPC registration, sender/slot routing and lifecycle cleanup          | Complete | Implemented; real tool-to-main IPC fixture checks passed                                                  |
| Browser and headless API exposure                                    | Complete | Shared facade implemented; live reads passed in both runtimes                                             |
| Matching internal/public declarations and package references         | Complete | Declaration consumer checks passed; package dry run includes F&O declarations                             |
| Minimum-version compatibility mechanism and author guidance          | Complete | Existing minAPI mechanism documented; release-specific values assigned by upstream at release preparation |
| API and registration documentation                                   | Complete | Tool-author documentation, plan and manual guide available                                                |
| F&O forms, supported authentication fields and registration guidance | Complete | Add/edit UI and automated checks passed                                                                   |
| Product badges, connection-list type filter and picker compatibility | Complete | Product filter/clear behavior and picker regression tests passed                                          |
| Safe connection events and metadata                                  | Complete | Implemented using existing event/context paths                                                            |
| Small desktop/headless sample                                        | Complete | Local sample includes both entry points and MCP configuration; live headless test passed                  |
| Same read in desktop and unattended client-secret execution          | Complete | User confirmed live acceptance on 2026-10-08                                                              |
| Legacy Dataverse usability                                           | Complete | Regression checks passed                                                                                  |
| Registry client mapping and package fallback                         | Complete | Desktop accepts connection_types and preserves manifest requirements when the registry omits the field    |

Exit: an F&O tool completes the same read in a desktop window and an unattended client-secret invocation; old Dataverse tools remain usable. Acceptance passed. Phase 4 PR implementation is complete; release publication is not claimed.

### Upstream release-process handoff

These tasks remain pending outside the implementation phases. Upstream release maintainers own their scheduling and completion; PR completion does not imply that packages, a desktop release or backend changes have shipped.

| Task                                                           | Status           | Release responsibility                                                                                                |
| -------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Select shipping desktop/types/validator versions               | Upstream pending | Choose the first releases carrying F&O support                                                                        |
| Finalize release-specific minimum-version metadata             | Upstream pending | Set the sample's features.minAPI and document the selected shipping minimum once versions are agreed                  |
| Publish matching types/validation packages and desktop release | Upstream pending | Run upstream publication and desktop release workflows                                                                |
| Registry connection_types ingestion/schema/view rollout        | Upstream pending | Coordinate the registry backend changes and deployment; desktop mapping and manifest fallback are already implemented |

### [ ] Phase 5 — Batch and transaction helpers

Status: not started; later scope, not required for the initial phases 1–4 release.

| Item                                                          | Status      | Remaining work                                                         |
| ------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| executeBatch and executeTransaction helpers                   | Not started | Implement explicit per-item status, headers and body                   |
| Shared multipart transport extraction                         | Not started | Separate Dataverse assumptions and validate F&O fixtures before reuse  |
| Mixed-result, rollback, limits and per-request boundary tests | Not started | Add fixture coverage for successful/failed items and atomic changesets |
| Live batch/transaction acceptance                             | Not started | Verify F&O batch behavior and atomic writes in a disposable sandbox    |

Exit: verified F&O batch behavior and atomic writes in a disposable sandbox.

## Verification and acceptance criteria

Automated coverage should exercise behavior at boundaries rather than duplicate implementation:

- Legacy normalization is idempotent; import/export retains type and strips secrets; unsupported type/auth combinations fail in UI and main-process validation.
- Old manifests resolve to Dataverse; new allow-lists survive registry/install flows; mixed slots and cleared slots preserve index routing.
- Both authentication flows use the environment root resource, run the correct access probe, renew tokens correctly, and invalidate caches after edits.
- CRUD uses complete encoded keys, including apostrophes and special characters; no GUID/logical-name assumptions leak from Dataverse.
- Metadata returns XML, 204 is handled, pagination preserves next links, and foreign-origin/escaped-path URLs are rejected before credentials are attached.
- Header consent, type guards, IPC sender-to-slot routing, throttling, timeout, error serialization, and headless interaction-required behavior are covered.
- E2E coverage includes create/edit/import, picker filtering, launch/reassignment, F&O-disabled Dataverse features, and existing Dataverse regression flows.

Run focused Jest/Playwright suites, declaration consumer checks, validation-package build, typecheck, lint, build, and `git diff --check` as appropriate to each implementation phase. Use a sandbox for create/update/delete and rollback verification; clean up created records. Record which live checks were performed and which await an environment.

## Decisions to revisit after the spike

1. Whether a maintained default F&O desktop app registration can replace user-supplied client IDs. Initial implementation requires explicit registration.
2. Whether metadata should be parsed for key-type validation and discovery helpers. Initial implementation returns raw CSDL and validates caller-supplied keys structurally.
3. Whether mixed-product tools need per-slot restrictions. Initial implementation uses a tool-wide allow-list and API-level type checks.
4. Whether certificate authentication, on-premises endpoints, company defaults, and custom services justify separate follow-up contracts.

Track completed phases here and add a tool-author guide with registration steps, examples, paging, composite keys, company behavior, and error handling before release.
