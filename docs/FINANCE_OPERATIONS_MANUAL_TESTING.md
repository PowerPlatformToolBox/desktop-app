# Testing the F&O connection and OData API

This is available on `finops-connection` in a local build. Automated tests use mocked authentication/HTTP responses. On 2026-10-08, the user confirmed live Microsoft Login and reads after the metadata download fix, followed by passing client-secret authentication tests after configuring the F&O app-to-user mapping. The user subsequently confirmed the client-secret headless MCP test passed. Other live acceptance checks remain pending.

## Run and add a connection

1. Run `pnpm build` then `pnpm start` (or `pnpm dev`).
2. Open **Connections → Add**. Choose **Dynamics 365 Finance & Operations**.
3. Enter a name and HTTPS environment root, for example `https://your-environment.operations.dynamics.com`. Pasting `/data` is also accepted and normalized to the environment root.
4. Choose Microsoft Login or Client ID/Secret and enter your own Client ID and Tenant ID. Enter the secret for client-secret authentication. Save with **Add**, then connect to sign in. **Test Connection** probes the OData service document; it does not save the connection or tokens from the test.
5. Edit the saved connection and confirm the product and normalized URL. Product cannot be changed on an existing connection. Changing authentication settings clears saved tokens; connect again after editing.

For Microsoft Login, configure an Entra mobile/desktop app redirect URI of `http://localhost`, with the Dynamics ERP delegated permissions and tenant consent required for your environment. Sign in with an F&O user who can access the desired entities. For client-secret authentication, register the app in **System administration → Setup → Microsoft Entra applications** and map it to a suitably authorized service user. The token resource is the environment root, without `/data` or a trailing slash. See Microsoft's [service authentication documentation](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/services-home-page).

## Read from a tool window

1. Open **Debug → Local Development → Browse** and select `examples/finance-operations-odata` from this repository. Click **Load Tool**.
2. Launch the sample and select the F&O connection. Only F&O connections should appear; impersonation should be hidden.
3. Click **List entity sets**. Expect a JSON service document with public collection names.
4. Click **Read metadata**. Expect XML CSDL.
5. Enter an available collection name with `?$top=5` and click **Run query**. For example, `CustomersV3?$top=5`. Not every environment exposes the same entities.
6. Use **Next page** when the response supplies `@odata.nextLink`. Add `cross-company=true` and/or a `$filter` on `dataAreaId` explicitly when needed. The API does not inject a company filter or fetch every page automatically.

To probe server-driven paging with existing data, set **Requested page size** to `2` and query a collection with more than two records, without `$top` (or with `$top` greater than `2`). The sample sends `Prefer: odata.maxpagesize=2` on the initial query and next-page requests. Leave the field blank to use the server default. The user confirmed live paging passed in the test environment on 2026-10-10 after adding this option; other environments may ignore the preference. A result without `@odata.nextLink` does not establish a paging pass. `$top` limits the total result count rather than requesting a page size.

The sample does not write data. For a negative check, query an unavailable entity and verify an HTTP error. A foreign-origin absolute next link must be rejected. Dataverse tools should continue to offer only Dataverse connections.

## Read Dataverse and F&O in the same tool

Load `examples/dataverse-finance-operations` using **Debug → Local Development → Browse → Load Tool**. Select one Dataverse connection and one F&O connection, then click **Read both systems**. Expect independent account and customer responses. Repeat with the connections in the opposite slot order, and reassign them while the tool is open before reading again. The tool identifies each product and passes its slot explicitly to the appropriate API.

Selecting two connections of the same product should show a configuration message before any read. A failed query on either side should leave the other side's successful response visible. See the [example README](../examples/dataverse-finance-operations/README.md) for details. Automated regression coverage uses simulated HTTP responses; this mixed-tool live smoke test remains pending.

## Compare desktop and unattended reads

1. Save a separate F&O **Client ID/Secret** connection, complete the F&O app-to-user mapping, and use **Test Connection** to confirm service access.
2. Reload the local sample after updating this branch so PPTB reads its new `pptb.config.json` and headless entry.
3. Run a query in the sample window with that connection. Keep the query and the returned record keys for comparison.
4. Enable PPTB's MCP server and connect your MCP client using the connection details shown in the app. Discover the **F&O OData Sample** tool, then invoke it with these arguments (replace the connection name and query):

```json
{
  "query": "CustomersV3?$top=5",
  "__pptb": {
    "executionMode": "headless",
    "mode": "two-way",
    "connectionName": "F&O Client Secret",
    "timeoutMs": 120000
  }
}
```

5. Inspect the job in PPTB's **MCP Server** page or poll the returned `jobStatusPath`. Expect a successful result containing `page.value` and the same records as the desktop read. The sample returns one page and preserves `@odata.nextLink`; it does not fetch every page.
6. Confirm no sign-in browser opens. Repeating the read after token expiry exercises client-secret renewal. Record the outcome and any structured error fields, excluding credentials and tokens.

See [MCP invocation and job handling](MCP_IMPLEMENTATION.md) for the client and result envelope. These steps close the live desktop/headless criterion of phase 4; unit checks of the sample cannot establish live authentication.

Headless query invocations also accept an optional integer `pageSize` from `1` to `10000`, for example `{ "query": "CustomersV3?cross-company=true", "pageSize": 2, "__pptb": { "executionMode": "headless", "mode": "two-way", "connectionName": "F&O Client Secret", "timeoutMs": 120000 } }`. Pass a returned next link as `query` with the same `pageSize` to continue. Reload the local tool after this configuration change so MCP exposes the new input.

## Remaining live acceptance checks

| Check | Recorded result (updated 2026-10-10) |
| --- | --- |
| Microsoft Login and OData reads | Passed, user confirmed |
| Client-secret authentication / Test Connection | Passed, user confirmed |
| Interactive silent renewal and client-secret renewal | Passed, user confirmed both live tests on 2026-10-09 |
| Cross-company filtering | Passed, user confirmed |
| Follow a real server-provided next link | Passed, user confirmed live paging on 2026-10-10 after adding the sample page-size option |
| Restricted-user service-document probe | Passed: Test Connection and List entity sets succeeded, user confirmed on 2026-10-10 |
| Restricted-user entity permission error | Passed: user supplied HTTP 403, "User is not authorized to read view CustCustomerV3Entity. Request denied." on 2026-10-10; raw HTTP 403 body captured and sanitized on 2026-10-10 |
| Create a disposable CustomersV3 record | Passed after omitting the account number for environment numbering |
| Retrieve using dataAreaId and CustomerAccount | Passed with explicit cross-company=true; default-scoped read returned 404 |
| Update and delete the disposable record, then verify deletion | Passed, user confirmed PATCH/name verification/DELETE/final GET 404 |
| Invoke an available action using `request` | Passed: collection-bound GetInstalledModules returned HTTP 200 and Collection(Edm.String) |
| Same read in desktop and unattended client-secret execution | Passed, user confirmed headless MCP test |

For write/action checks, use a sandbox entity and action selected by the environment owner. Record sanitized request paths, response status and keys, and confirm cleanup of the disposable record. Do not use production records as test fixtures.

Initial CustomersV3 create testing returned HTTP 400 with the generic outer message "An error has occurred."; the subsequent error-reporting fix and corrected payload allowed CRUD acceptance to pass. The transport now includes bounded, deduplicated nested validation messages from OData inner errors and details, redacts the access token, and excludes server stack traces. Its 35 focused transport/manager tests pass. For future failed create attempts, check whether the attempted account exists before retrying and capture the detailed error if it fails again.

## API for tool authors

Declare `features.connectionTypes: ["financeOperations"]` and a connection count in the tool's `package.json`. Mixed tools can declare both products and select a zero-based slot with `options.connectionTarget`. Import declarations with `/// <reference types="@pptb/types/financeOperationsAPI" />` from the local updated types package until a release is published.

```typescript
const entities = await window.financeOperationsAPI.getServiceDocument();
const page = await window.financeOperationsAPI.queryData("CustomersV3?$top=5");
const metadata = await window.financeOperationsAPI.getMetadata();
const record = await window.financeOperationsAPI.retrieve("CustomersV3", {
    dataAreaId: "usmf", CustomerAccount: "C-001",
});
// Every key field must match the entity's $metadata declaration.
```

`request`, `create`, `update` (PATCH), and `delete` return `{ status, headers, body? }`, including empty 204 responses. Use `request` for entity actions and PUT. Key helpers accept strings, numbers, booleans, and `{ odataLiteral: "9223372036854775807" }` for exact large numeric or typed literals. See Microsoft's [F&O OData documentation](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/odata) for entity exposure, complete keys, companies, and actions.

Custom headers require separate per-tool F&O consent in the desktop app; **Consent Review → API Headers** can revoke persistent approval. Headless calls require prior approval for custom headers. Authorization and transport headers cannot be overridden. A headless interactive connection must have an existing MSAL account; unattended use should use client-secret authentication. Both runtimes expose `financeOperationsAPI`.

HTTP errors expose `status`, `requestId`, and `retryAfter` where the server provides them. Only GET retries once after a 401 with a forced token refresh. Writes, redirects, and throttled requests are never automatically replayed. Entity requests time out after 30 seconds by default; metadata defaults to 120 seconds. Explicit timeouts can be 1–120 seconds. Request bodies and entity responses are limited to 20 MB; metadata responses allow 100 MB, including decompressed content. Local size-limit and timeout errors are preserved when cancellation aborts the response. Batch helpers are a later phase.

Before release, verify both real authentication flows, renewal, a paged collection, company filters, and sandbox create/update/delete/action behavior using a disposable record and its full metadata key. Record the environment and results without credentials or tokens.

CustomersV3 live follow-up: the supplied PPTB account failed the company's US_SI_#### number-sequence validation. The subsequent create succeeded with environment-assigned numbering. A keyed GET using the returned account and dataAreaId succeeded with explicit `cross-company=true`; the default-scoped retrieve returned 404. Use the same explicit keyed request path for the remaining update/delete checks.

CustomersV3 CRUD acceptance is complete: create, keyed cross-company read, PATCH with name verification, DELETE, and final GET returning 404 all passed, as confirmed by the user on 2026-10-08. The disposable customer was cleaned up.

Action acceptance passed on 2026-10-08: the collection-bound `Microsoft.Dynamics.DataEntities.GetInstalledModules` action, bound to the SystemNotification entity collection resolved from CSDL, was invoked through `request("POST", path, {})`. It returned HTTP 200 with an OData `Collection(Edm.String)` containing installed module information. No environment-specific response headers or full module inventory are stored in this guide.

## Offline response fixtures

The read-only headless sample now accepts `operation: "serviceDocument"` or `operation: "metadata"` to return `{ serviceDocument }` or `{ metadata }`. Reload the sample in Local Development after updating its configuration. Invoke it with the tested client-secret connection and the existing headless/two-way `__pptb` envelope; omit `query` for these operations. Existing query-only invocations still default to `operation: "query"`. Sanitize captures before adding them to the repository and update the fixture provenance record only once a live result has been obtained.

See the [fixture bundle and provenance record](../tests/fixtures/financeOperations/README.md). Sanitized customer and installed-module responses and the parsed action descriptor come from the supplied live results. The customer validation JSON envelope was captured directly from an HTTP 400 response on 2026-10-10; its account/number-sequence identifiers were replaced and server stack trace redacted. Temporary capture code and the raw file were removed afterward. On 2026-10-10, service discovery and raw CSDL were successfully captured through the client-secret headless sample and reduced into live-derived fixtures. Both paging responses were supplied by the user on 2026-10-10 and sanitized with their real nextLink query structure preserved ($skip=2, then $skip=4, each with $top=2). The second page also contains a continuation. The restricted-user HTTP 403 body was captured on 2026-10-10, with the server stack trace redacted; temporary capture code and the raw file were removed afterward. Live paging passed separately, as confirmed by the user on 2026-10-10. The bundle is exercised by 45 focused F&O transport/authentication/manager tests.

Live capture results on 2026-10-10: service discovery returned 4,746 entity sets; metadata returned 54,656,812 UTF-8 bytes. The retained excerpts confirm CustomersV3 keys dataAreaId/CustomerAccount, the SystemNotification key RuleId, the SystemNotifications collection binding, and GetInstalledModules returning Collection(Edm.String). Full responses were kept outside the repository only while preparing sanitized excerpts, then removed.
