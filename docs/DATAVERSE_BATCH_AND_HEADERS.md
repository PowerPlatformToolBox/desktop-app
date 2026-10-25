# Dataverse Batch Operations and Additional Headers

The standalone `dataverseAPI` supports additional request headers and Dataverse Web API batch operations. These capabilities apply only to `window.dataverseAPI` in windowed tools and `globalThis.dataverseAPI` in headless tools.

## Additional headers

Network-backed methods accept an optional final `additionalHeaders` argument after `connectionTarget`:

```typescript
const result = await dataverseAPI.retrieve("account", accountId, ["name"], "primary", {
    Prefer: 'odata.include-annotations="*"',
    "MSCRM.BypassCustomPluginExecution": "true",
});
```

The first header-bearing request from a tool is paused before token acquisition or network access. The user can:

- **Approve for this tool instance**: permit any additional Dataverse header name and value for the current tool instance, including queued and subsequent queries, until that instance closes. This approval is not persisted or shared with other instances.
- **Approve for this tool**: permit any additional Dataverse header name and value from that tool, including future executions, until revoked.
- **Reject**: cancel the request without sending it.

The dialog displays the exact outgoing names and values. Persistent grants can be revoked from **Consent Review > Dataverse Headers**. Revoked grants remain in the review history, and the next header-bearing request prompts again.

Headless tools cannot open an interactive prompt. A headless header-bearing request succeeds only when the tool already has an active persistent grant; otherwise it fails before connection or token access.

Header names and values are validated for HTTP syntax, control characters, count, and size. Approved headers may override the defaults supplied by the application, including authorization and protocol headers. Tool developers should request only the minimum headers needed and must not place secrets in header values unless required by Dataverse.

## Batch operations

`executeBatch` sends independent operations in one Dataverse `$batch` request:

```typescript
const results = await dataverseAPI.executeBatch([
    { method: "GET", url: "accounts?$select=name&$top=5" },
    {
        method: "PATCH",
        url: `accounts(${accountId})`,
        headers: { "If-Match": "*" },
        body: { name: "Updated name" },
    },
]);
```

Set the same `changesetId` on write requests to group them into one atomic changeset while keeping other requests independent:

```typescript
const results = await dataverseAPI.executeBatch([
    { method: "POST", url: "accounts", changesetId: "account-and-contact", body: { name: "Contoso" } },
    { method: "GET", url: "accounts?$select=name" },
    { method: "POST", url: "contacts", changesetId: "account-and-contact", body: { firstname: "Ada" } },
]);
```

Requests with the same `changesetId` are grouped together in their original order; the group appears at the position of its first request. Requests without a `changesetId` remain independent. Transactions accept write operations only. Requests are not automatically split because splitting would change atomicity. URLs must be relative to the assigned Dataverse Web API connection; absolute URLs, traversal, nested `$batch` requests, duplicate content IDs, and oversized payloads are rejected.

`executeTransaction` sends all operations in one atomic changeset:

```typescript
const results = await dataverseAPI.executeTransaction([
    { method: "POST", url: "accounts", contentId: "account", body: { name: "Contoso" } },
    { method: "POST", url: "contacts", contentId: "contact", body: { firstname: "Ada" } },
]);
```

Each result is correlated to the original request and contains its content ID, status, status text, normalized response headers, and optional parsed or text body. The optional `batchHeaders` field contains selected headers from the outer HTTP response and is shared across all results: `x-ms-dop-hint`, `x-ms-ratelimit-burst-remaining-xrm-requests`, and `x-ms-ratelimit-time-remaining-xrm-requests`. For example, `results[0]?.batchHeaders?.["x-ms-dop-hint"]` reads the parallelism hint. Other envelope headers, such as `Content-Type` and `Content-Length`, are not exposed there. Per-operation HTTP failures are returned as results. Validation, rejected consent, transport failures, malformed multipart responses, and outer `$batch` failures reject the promise.

## Security model

- The main process derives the tool identity and assigned connection from the calling renderer. Tools cannot provide either identifier.
- Outer and per-operation headers are validated, frozen, and shown together before execution.
- Batch URLs remain on the assigned Dataverse origin and API version.
- Request headers, bodies, access tokens, and response bodies are not written to logs.
- Persistent consent is intentionally broad and survives tool updates until revoked. A trusted tool can use impersonation or business-logic bypass headers after approval.
