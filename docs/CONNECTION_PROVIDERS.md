# Connection Providers

Extensions can contribute **connection providers** as well as tools. A connection provider is a class that:

- lists Dataverse connections, which the app shows after the user's own connections in the Connections sidebar, the connection pickers and MCP
- returns an access token when one of those connections is opened or its token needs refreshing

This makes the connection list and the authentication flow extensible. For example, an organisation can expose a central list of customer environments, with access controlled and audited by its own service, without copying credentials into each user's ToolBox.

Connection providers are expected to be internal to a company and so should be hosted via a private npm feed, rather than being published to the public PPTB marketplace.

## Declaring a provider

Add a `pptbConnectionProviders` array to the extension's `package.json`:

```json
{
    "name": "contoso-connections",
    "displayName": "Contoso Connections",
    "version": "1.0.0",
    "pptbConnectionProviders": [{ "id": "contoso", "displayName": "Contoso", "main": "dist/provider.js" }]
}
```

| Field         | Description                                                                                |
| ------------- | ------------------------------------------------------------------------------------------ |
| `id`          | Unique within the extension. Letters, digits, `.`, `_` and `-` only (max 64 characters).   |
| `displayName` | Shown as the auth badge and default category of the provider's connections.                |
| `main`        | CommonJS module, relative to the extension root. Must resolve inside the extension folder. |

An extension can declare several providers. It is still loaded like a tool, so it needs a `dist/index.html`, which can be a simple information page. Providers from installed tools are started when the app starts. Providers from local tools ("Load local tool") are started when the tool is loaded, and are reloaded whenever the tool is reloaded.

## Writing a provider

The module exports a class, as `module.exports`, `default` or `ConnectionProvider`. Its constructor receives a host object:

```js
class ContosoProvider {
    constructor(host) {
        this.host = host;
    }

    // Required: list connections. May sign the user in interactively to authenticate to the underlying data source.
    async getConnections() {
        return [{ id: "prod", name: "Contoso Production", url: "https://contoso.crm.dynamics.com", environment: "Production", category: "Contoso" }];
    }

    // Required: return a token for one of your connections
    async authenticate(connectionId, { reason, tool }) {
        // reason is "connect" when the user opens the connection, "refresh" when the previous token expired
        // tool identifies the requesting tool (toolId, toolName, toolVersion, instanceId), when known -
        // use it to log or limit access per tool. It is undefined when the connection is activated or
        // refreshed from the main app window rather than from within a tool.
        return { accessToken: "...", expiresOn: "2030-01-01T00:00:00Z" };
    }

    // Optional
    async getConnectionById(connectionId) {}
    async signOut(connectionId) {}
    async dispose() {}
}

module.exports = ContosoProvider;
```

The TypeScript definitions are in `@pptb/types` (`connectionProvider.d.ts`).

### Connection fields

| Field           | Required | Notes                                                                                                                                                                                       |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | Yes      | Unique within the provider; max 512 characters, no control characters.                                                                                                                      |
| `name`          | Yes      |                                                                                                                                                                                             |
| `url`           | Yes      | Must be HTTPS. Only the origin is kept.                                                                                                                                                     |
| `environment`   | No       | `Dev`, `Test`, `UAT` or `Production` (the default).                                                                                                                                         |
| `category`      | No       | Group in the sidebar. Defaults to the provider's display name.                                                                                                                              |
| `categoryColor` | No       | 6-digit hex colour (e.g. `#6b2fb3`) for the category badge/group. Enforced for every user instead of being picked locally, so set this for consistent branding; invalid values are ignored. |
| `username`      | No       | Shown in connection details.                                                                                                                                                                |
| `description`   | No       |                                                                                                                                                                                             |

Invalid and duplicate entries are skipped, and a warning is logged. A provider can return at most 5,000 connections.

### Host services

| Member                        | Description                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host.providerId`             | Fully qualified provider key.                                                                                                                                                                                                                                 |
| `host.acquireEntraToken(req)` | Gets a Microsoft Entra ID token using MSAL (public client, loopback redirect): silent first, then interactive in the system browser. `req = { clientId, tenantId?, scopes, loginHint?, forceInteractive? }`. Returns `{ accessToken, expiresOn, username? }`. The MSAL token cache (including the refresh token) is persisted to disk, encrypted with the same OS-level mechanism used for stored connection secrets, so a signed-in account survives app restarts and silent acquisition can usually avoid a repeat interactive login. |
| `host.prompt(req)`            | Shows a small modal form owned by the app, built from the field schema described below. Resolves to an object keyed by each field's `id`, or `null` if cancelled. Prompts are queued one at a time.                                                           |
| `host.log.info/warn/error`    | Writes to the app log, tagged with the provider key.                                                                                                                                                                                                          |

Throw an `Error` from `getConnections` or `authenticate` to fail with a message the user can see.

### Prompt fields

If user input is required within the provider, a limited sandboxed data entry UI is provided by the `host.prompt` function. Each data entry prompt is a modal form described by a request in the format:

`{ title, message?, fields, confirmLabel?, cancelLabel? }`, where `fields` is an array of at least one:

```ts
{
    id: string;                // key the value is returned under
    type: "text" | "multiline" | "password" | "select" | "checkbox";
    label?: string;
    placeholder?: string;      // ignored for "checkbox"
    defaultValue?: string | boolean;  // boolean for "checkbox", string otherwise
    required?: boolean;
    options?: { value: string; label: string }[]; // "select" only
}
```

The app renders every field itself from this schema - a provider can only describe which inputs it needs, not supply HTML, CSS or script for the prompt. The result resolves to `{ [fieldId]: string | boolean } | null` (`null` if the user cancels); boolean values come from `checkbox` fields, string values from everything else. The host re-validates the result against the original schema (required fields, and that a `select` value is one of the `options` offered), so it cannot be tampered with via the prompt page.

## How the app uses providers

- **IDs**: Provider connections get the app ID `ext:<extensionId>/<providerId>:<connectionId>`, with `authenticationType: "external"` and `readOnly: true`.
- **Listing**: `ConnectionsManager.getConnections()` returns local connections followed by the cached connections from every provider. Use "Refresh <provider> connections" on a provider connection's context menu to reload them.
- **Opening a connection** (sidebar, connection pickers, tool launch): this always calls `authenticate(id, { reason: "connect" })`, so providers that need approval on each session always get to run their flow. This happens on _every_ open, including when the same connection is already open in another tool - the host does not deduplicate these calls - so a provider that prompts the user should cache the issued token per connection id and return it directly while still valid, and reuse the last justification whenever a new token is needed, instead of asking again on each open.
- **Dataverse calls**: These reuse the token while it is valid for more than 5 more minutes. Otherwise they call `authenticate(id, { reason: "refresh" })` if a token was issued before, or `"connect"` if not. When handling `"refresh"`, avoid prompting the user if you can.
- **Tool context**: `context.tool` identifies the tool instance currently using the connection (`toolId`, `toolName`, `toolVersion`, `instanceId`) - only non-sensitive identity, no filesystem paths. It is resolved from whichever open tool instance the connection is currently assigned to, so it is omitted when the connection is activated or refreshed from the main app window rather than from within a tool, and is best-effort (one of the matches, arbitrarily) when several open tool instances share the same connection. Providers can use it to log which tool is requesting access, or to reject the request by throwing from `authenticate`.
- **Read-only**: Provider connections cannot be edited, deleted or exported. Only the environment colour and the last-used time can be customised locally, and those customisations are kept in memory only (lost on restart). The category colour is not locally editable - set `categoryColor` on the connection itself so the colour is the same, and persists, for every user.
- **Tokens**: These are kept in memory and never written to disk.
- **Power Platform API**: This is not supported for provider connections; only Dataverse is.
- **MCP**: Headless or unattended MCP calls fail with "sign-in required" when no token is cached, because providers may need user interaction.

## Isolation and security

- Each provider runs in its own Electron `utilityProcess`, separate from the main process, the renderer and tool web views. It communicates only through a JSON message bridge (`src/main/connectionProviderHost.ts` ↔ `ConnectionProviderManager`).
- Providers can only use the host services listed above. They have no access to the app's stored connections, settings or other providers.
- The main process validates every provider response. Connection URLs must be HTTPS. Entra requests need a GUID client ID and a valid tenant.
- Prompts are rendered by the app in a sandboxed window from a declarative field schema, with a strict CSP and HTML-escaped text supplied by the provider - providers never supply markup or script, and submitted values are re-validated against the schema before being returned.
- Calls time out: 60 seconds for general calls, and 15 minutes for `getConnections` and `authenticate`, which may wait for an interactive sign-in. The provider must start within 30 seconds. If the process crashes, pending calls are rejected and the process is restarted on the next call.
- The provider runs with full Node.js privileges in its process, just like a tool's native code. Only install extensions you trust.

## Debugging

Provider processes run with `stdio: "ignore"` and no inspector port by default. To debug one while the app is running, set the `PPTB_DEBUG_CONNECTION_PROVIDERS` environment variable before starting the app:

| Value           | Effect                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| `1` / `true`    | Opens a Node inspector port (`--inspect`) on each provider process, starting at port 9230. |
| `brk` / `break` | Same, but also pauses the process (`--inspect-brk`) until a debugger attaches.             |
| unset / `0`     | Debugging disabled (default).                                                              |

Each provider process gets its own incrementing port, logged to the app log along with the exact flag used. Attach with `chrome://inspect` (add the port under **Configure**) or VS Code's **Attach to Node Process** command. With `brk`/`break`, the provider does not finish initializing until you attach, so attach promptly: the app gives a provider 30 seconds to become ready.

## Limitations

- The Node.js `fetch` inside a provider process does not use the app's proxy settings.
- The MSAL cache used by `acquireEntraToken` is persisted (encrypted) per `clientId`/`tenantId`, so an interactive sign-in is only needed again once the cached refresh token actually expires or is revoked - not on every app start. If encryption isn't available on the current platform, it falls back to an in-memory-only cache for that session.
