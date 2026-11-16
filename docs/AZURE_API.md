# Host-managed Azure and Microsoft Graph APIs

Available in PPTB **1.2.9 builds containing this feature**. Use the corresponding `@pptb/types` beta containing `azureAPI.d.ts`; the API did not exist in `1.2.9-beta.0`. Package version allocation/publication is managed by the maintainer.

Release order: publish the updated `@pptb/validate` under a new maintainer-assigned version, update the types package's validator dependency, then publish the next `1.2.9` types beta and matching host build. Existing published versions cannot be overwritten. This implementation changes no version numbers and publishes nothing.

## Connection setup

Create/edit the normal Dataverse connection. The **Additional APIs (Optional)** section groups all three options:

- **Enable Power Platform API** (existing Power Platform integration; requires a configured client ID)
- **Enable Azure Resource Manager API**
- **Enable Microsoft Graph API**

Each option has a short description. Expand **Azure and Graph sign-in requirements** for application registration, consent and authentication limitations.

Reuse its account, tenant, client ID, credentials and browser settings. No additional account/tenant picker or subscription field is added. Dataverse authenticates first; additional API authentication occurs on demand, independently of Power Platform token acquisition. Enabling these options does not make Azure a tool launch requirement. Disable an option to block further requests and invalidate that connection's pending requests/approvals without disconnecting Dataverse.

Tools use standalone `window.azureAPI.arm` and `window.azureAPI.graph`, not a `toolboxAPI.azure` alias. No token, secret, arbitrary authority, or authenticated fetch callback is exposed.

| Connection type         | Behavior                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft Login (OAuth) | Same selected MSAL account/resource tenant; silent renewal first, system-browser authorization code with S256 PKCE/state if explicit authentication requires interaction                       |
| Username/password       | Reuse the account established by Dataverse; additional scopes use silent MSAL acquisition or explicit browser authentication. Password fallback is never used to bypass MFA/Conditional Access |
| Client ID/Secret        | Host uses the connection's application credentials and resource-specific `.default`; this is **application**, not delegated, authentication                                                    |
| Connection string       | Parsed into its actual authentication type before use                                                                                                                                          |

OAuth always has a client ID. Dataverse-only connections can use the existing default application; enabling **any** additional API requires an explicit client ID in New/Edit Connection. For connection strings, include the client ID in the string. Client ID/Secret authentication already requires one. Use an application registration your administrator can configure with the selected APIs' permissions; a client ID alone does not grant API access. Existing connections without an explicit client ID must supply one when edited with additional APIs enabled.

Tokens are managed in the host's session-memory MSAL cache and are audience-specific: Dataverse, Power Platform, ARM and Graph tokens are not interchangeable. No additional tokens are persisted/exported. Restart may require reconnecting Dataverse. Changing credentials, registration, account or tenant invalidates additional access; switching a tool's connection slots also cancels old work and invalidates page handles. Sign-out/reconnect follows the existing connection lifecycle; local cache invalidation does not revoke Entra consent or globally sign out browser sessions.

### Application registration

For OAuth, configure **Mobile and desktop applications**, system-browser redirect **`http://localhost`** (runtime uses an ephemeral port), and delegated permissions:

- ARM: **Azure Service Management > user_impersonation**; host requests `https://management.azure.com/.default`.
- Graph: the read permissions declared by the tool, e.g. **User.Read** or **Reports.Read.All**. Graph tokens use `https://graph.microsoft.com/...` scopes.
- Preserve the existing registration's Dataverse/Power Platform permissions and redirects.

Do not register the loopback flow as a SPA or require a secret for OAuth. "Allow public client flows" is the fallback switch for flows such as password/device code; it is not a substitute for registering the desktop redirect. Username/password connections must also meet their existing public-client requirements.

User/admin consent depends on permission and tenant consent policy. Admin consent does not grant Azure RBAC or billing visibility. For Client ID/Secret, Graph **application permissions** require admin consent; ARM application access requires Azure role assignments. Delegated Graph permission names in the manifest describe tool intent, but application tokens contain the registration's granted application roles, not a dynamically narrowed delegated scope. Host HTTP restrictions still apply.

MFA and supported Conditional Access challenges are handled in host/browser authentication. Claims challenges stay inside the host; explicit `authenticate()` retries them. Policies requiring an unsupported native broker/compliant-device integration can still deny access; do not use password fallback.

Only **Azure public cloud**, `management.azure.com`, and Graph `graph.microsoft.com/v1.0` are supported. Government/China authorities, sovereign ARM/Graph endpoints, arbitrary audiences, Graph beta and workers are not exposed by this API. MCP headless tools use the same host-managed client as described below.

All ARM/Graph requests and MSAL exchanges use the existing `ProxyManager`, including proxy agents/custom CA behavior. Browser sign-in uses the configured system browser/profile and its own browser/OS proxy configuration, as with existing sign-in.

## Manifest and host approval

```json
{
    "features": {
        "connections": 1,
        "minAPI": "1.2.9",
        "apis": {
            "pp": { "required": true },
            "arm": { "required": true },
            "graph": { "required": false, "scopes": ["Reports.Read.All"] }
        }
    }
}
```

`features.apis` is the preferred declaration. An absent entry means undeclared; an entry with `required: false` (or omitted `required`) declares optional usage. `required: true` adds connection-selection guidance, not an authentication guarantee or a new selection block. Optional integrations remain usable on demand.

Only declare resources/permissions actually needed. `graph.scopes` is mandatory when Graph is declared and accepts 1-20 short read-permission names ending in `.Read`, `.ReadBasic`, `.Read.All`, `.ReadBasic.All`, or `.Read.Selected`. Write/send/manage permissions and scope URLs are rejected. `User.Read` is only needed if the tool reads the user's profile; it is not automatically needed for reports. ARM uses its fixed resource scope; PP keeps its existing authentication behavior.

Existing tools require no migration:

| Legacy declaration                            | Normalized meaning       |
| --------------------------------------------- | ------------------------ |
| `enabledForPowerPlatformAPI: true`            | PP declared and required |
| `enabledForPowerPlatformAPI: false` or absent | No PP requirement        |

The manifest field `features.enabledForPowerPlatformAPI` is **deprecated**, but remains supported for backward compatibility. Both validators emit a warning when it is supplied (true or false); this warning alone does not invalidate the package. Replace it with `features.apis.pp.required`, preserving its boolean value. This does not deprecate the connection's `enabledForPowerPlatformAPI` enablement flag. If both manifest declarations are supplied, their required status must match; conflicts are validation errors and host access is denied. The interim `features.azure` format is not supported: declare ARM and Graph only through `features.apis`.

Both validator surfaces use the same normalization rules; the host rechecks the loaded tool's actual package manifest rather than trusting registry metadata.

Connection selectors show one compact enabled-API badge in fixed order, e.g. **PP, ARM, Graph**. No enabled APIs means no badge. Hover or keyboard focus reveals full names and clarifies that enablement does not verify authentication or authorization. A compact **Required APIs: PP, ARM. Choose connections with matching tags.** banner lists only required APIs. Selecting a connection missing enablement shows **Selected connection missing: ARM.** Multi-selection checks assigned connections. These warnings do not prevent selecting a connection.

Call `authenticate()` from a user action. A host-owned confirmation identifies the tool, connection, resource and requested permissions. Approval is session-bound to the tool instance, connection and declaration. Ordinary requests never unexpectedly open sign-in windows. Existing PP API enablement remains separate; no new API is required to use Dataverse.

### MCP headless execution

Declare the same `features.apis` entries in the installed package and enable ARM/Graph on the saved Dataverse connection. Use the existing `agents.headless`/`agents.headlessEntry` configuration and MCP connection-selection/authentication flow; no additional Azure-specific opt-in is needed.

During `invokeHeadless`, `globalThis.azureAPI` (also `window.azureAPI`) exposes the same ARM/Graph methods and structured errors. Requests use the invocation's assigned connection slots, not the app's active connection. Empty/deleted slots reject with `notConnected`; safe connection metadata includes the ARM/Graph enablement flags.

Like the Power Platform headless client, Azure acquires its own resource token on demand: silent MSAL acquisition/renewal first, host-managed browser sign-in if consent/MFA/Conditional Access requires it. There is **no extra PPTB API approval dialog** and no requirement to approve a windowed Azure request first. Entra consent and Azure/Graph authorization still apply. `authenticate()` is also available for an explicit retry, including a claims challenge. A headless run does not open the tool UI, but sign-in can require user interaction; it is not an unattended authentication guarantee.

```typescript
/// <reference types="@pptb/types" />

export async function invokeHeadless() {
    const subscriptions = await globalThis.azureAPI.arm.listSubscriptions();
    return { subscriptions: subscriptions.data?.value ?? [] };
}
```

Tokens remain inside the host's Azure authentication/transport; no Azure token is added to invocation context. The same read-only methods, pinned origins, proxy handling, request deadlines, throttling diagnostics and opaque pagination apply. `connectionTarget` selects `"primary"`, `"secondary"` or a numeric slot. `cancelRequest()` and `onConnectionChanged()` are available. Page handles and cancellation IDs are isolated per invocation; pending Azure requests, handles and event subscriptions are disposed when execution returns, fails or reaches its MCP job deadline. Do not retain the client after the invocation.

## Requests and read-only boundary

```typescript
await window.azureAPI.arm.authenticate();
const subscriptions = await window.azureAPI.arm.listSubscriptions();
const profile = await window.azureAPI.graph.Get<{ displayName: string }>("/v1.0/me");
```

Each resource has `getConnectionState`, `authenticate`, `Get` and `nextPage`. ARM also has `listSubscriptions`, `queryCosts` and `checkCostAccess`. Options support `connectionTarget: "primary" | "secondary" | number`, `requestId`, and `timeoutMs`, consistent with connection slots.

- GET paths start with `/`; ARM requires an explicit `api-version`. Microsoft Graph requires `/v1.0/...`. Responses are JSON-only (binary downloads are not supported).
- No arbitrary headers, URLs, token scopes or methods. Redirects are not followed. Tokens are only attached to the resource's pinned HTTPS origin.
- No general POST/PUT/PATCH/DELETE: only `queryCosts` permits POST, strictly to the subscription-scoped Cost Management Query endpoint. This is semantically read-only.
- This supports broader **read** access to ARM and Graph, not unrestricted Azure write access. ARM `user_impersonation` itself is not a read-only permission; the host enforces the read-only request surface.
- Query bodies allow `ActualCost`/`AmortizedCost`, documented timeframes, daily/monthly/no granularity, Sum aggregations, dimensions/tags, and In filters. Limits: 64 KiB query body, two aggregations, two groups, 100 filter nodes, eight filter nesting levels, up to 100 values per filter; custom periods must be ordered and no longer than 366 days. Service-specific limits can be stricter.

### Cost scopes and dimensions

`queryCosts`/`checkCostAccess` accept `/subscriptions/{GUID}`, including manually entered scopes when subscription listing is restricted. Validate the subscription selected in your tool; discovery does not establish cost access.

Initial Cost Query support is **subscription only**. Resource-group, management-group, billing-account, billing-profile, invoice-section, EA enrollment/department and partner-customer scopes are not supported by this helper. Azure itself supports multiple such scopes with different agreements/authorization. Generic ARM GET remains available for supported read endpoints, including dimension discovery:

```typescript
const scope = "/subscriptions/00000000-0000-0000-0000-000000000001";
const dimensions = await window.azureAPI.arm.Get(`${scope}/providers/Microsoft.CostManagement/dimensions?api-version=2025-03-01&$expand=properties/data`);
```

Cost queries pin API version `2025-03-01`; subscription listing uses `2022-12-01`. Dimension availability/grouping/filtering depends on the selected scope and agreement.

### Responses, pagination and currency

Success returns `{ status, headers, data, continuation? }`. Headers have lowercase names and include content type/date, request/correlation IDs, Retry-After and rate-limit metadata; cookies/authentication headers are not exposed. Data is otherwise returned in service column/row form, except service next links are removed in favor of opaque handles.

Use `nextPage(handle, options)` with the same resource/connection until `continuation` is absent. The host retains the original method and body, so Cost Query pagination remains POST. Handles expire after 15 minutes, are consumed on success, and are bound to owner, resource and connection generation. Continuations must remain on the exact endpoint path/API version. No partial result is silently presented as a complete report.

Empty rows or HTTP 204 are not permission failures and must not be interpreted as zero spend. Locate columns by name on **each** page and retain `Currency`; never sum across currencies. Actual and amortized costs must be queried/labeled separately.

### Cancellation, bounds and throttling

The default total deadline is 30 seconds; explicit authentication defaults to 120 seconds. Set `timeoutMs` between 1,000 and 120,000. It covers token acquisition, host approval and networking. Host loopback authentication also has a five-minute safety timeout. MSAL calls that cannot be interrupted may finish internally after cancellation; no subsequent HTTP request/result is delivered for cancelled work.

Use a unique `requestId` (1-100 letters/digits/underscore/hyphen) and `cancelRequest(id)`. Do not send an `AbortSignal` through Electron IPC. Connect a tool-side AbortController to `cancelRequest`; reject/ignore late results after cancellation.

At most eight active operations and 100 outstanding continuation handles per tool are allowed. A continuation chain is limited to 100 hops. Responses are bounded to 10 MiB. Narrow queries rather than retrying unchanged limit failures.

HTTP 429 is returned without automatic retries. Errors retain retry/rate-limit headers and normalize `retryAfterMs` from Retry-After (seconds/date) and Cost Management retry headers, using the longest valid delay. Honor that delay and cancellation before retrying; avoid parallel retry storms. One silent refresh/retry is permitted after a 401 without a claims challenge; 403 is not retried.

## Prerequisites, errors and Help

`getConnectionState()` returns enabled/configured state, whether a Dataverse identity was established, safe connection/account/tenant identifiers, and delegated/application authentication. `ready` is not proof of consent or service authorization: `access` remains `unverified`.

`arm.checkCostAccess(scope)` returns independent `configured`, `signedIn`, `scopeSelected`, `costData` (`accessible`, `accessDenied`, `unverified`), timestamp and optional structured error. It executes a small actual-cost query for the previous day. Success (including empty data) verifies that operation/period only, not amortized data, all dimensions or historical periods. Missing capability/connection-state lookup errors reject normally.

Errors are plain `AzureApiError` objects, preserving fields across Electron isolation:

| Code                                                         | Help/action                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `notConfigured`, `notConnected`                              | Enable the API in Edit Connection / authenticate Dataverse                        |
| `capabilityDenied`, `consentRequired`                        | Correct the tool manifest / ask the user to approve `authenticate()`              |
| `interactionRequired`, `authenticationFailed`                | Explicit reconnect; check MFA/CA, app permissions, consent and credentials        |
| `accessDenied` (403)                                         | Verify scope, effective permissions, agreement billing visibility and propagation |
| `throttled` (429)                                            | Honor `retryAfterMs` / retry headers                                              |
| `invalidRequest`, `invalidContinuation`                      | Correct path/query/scope or restart paging after identity/selection changes       |
| `costDataUnavailable`                                        | Service explicitly reports `NoCostData`; do not infer missing permissions         |
| `networkError`, `serviceError`                               | Unable to verify; inspect safe diagnostics and proxy/network/service availability |
| `cancelled`, `timeout`, `connectionChanged`, `limitExceeded` | Discard stale/partial output; retry deliberately or narrow the request            |

Errors include available HTTP status, safe headers, Azure service code, request/correlation IDs and retry timing. Backend messages/bodies are not echoed wholesale. No tokens, claims challenges or secrets are included.

Recommend **Cost Management Reader** at the selected subscription (or an appropriate ancestor). Agreement-specific billing visibility still applies: EA charge-view settings, MCA Azure charge visibility, and billing-scope-specific roles are separate checks. Subscription discovery may be restricted even when a manually entered scope works. Billing roles for billing accounts/profiles/invoice sections do not automatically match subscription RBAC. A **403 cannot identify one exact missing role**.

Provide administrators with tenant/subscription ID, operation, timestamp and safe request/correlation IDs. Ask them to verify effective access, agreement policies and scope support, not to grant Owner/Contributor by default.

`onConnectionChanged` returns an unsubscribe function. On any relevant event invalidate displayed costs/permissions and outstanding page state; reread the selected connection and require a fresh selection if appropriate. Closing/navigating the tool releases approvals and requests.

## Example and verification

See [the typed daily-cost example](../packages/types/examples/azure-costs.ts): supply your Fluent UI subscription picker, renderer and notification handler. It covers optional enablement, explicit host consent, subscription pagination, a read-only access probe, daily actual costs, all-page loading and cancellation. For manual scope entry use the same validated `/subscriptions/{GUID}` helper path. No direct ARM fetch or CSP exception is needed.

Automated coverage uses the repository's Jest infrastructure for auth renewal/account matching/PKCE, proxy routing, denied access, throttling, pagination, cancellation, connection changes, public bridge and manifest validation. Real tenant consent, MFA/CA, application roles, agreement policies and sovereign-cloud availability cannot be proven by mocks; validate the supported public-cloud flow against your registration/subscription before publishing.

References: [Query API](https://learn.microsoft.com/en-us/rest/api/cost-management/query/usage?view=rest-cost-management-2025-03-01), [API permissions](https://learn.microsoft.com/en-us/azure/cost-management-billing/automate/cost-management-api-permissions), [scopes](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/understand-work-scopes), [MSAL Node acquisition](https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests), [desktop registration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration).
