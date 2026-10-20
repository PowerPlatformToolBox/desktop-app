# Proxy Feature Local Testing Guide

## 1) Manual proxy routing (local proxy)

### Prerequisites

1. Install mitmproxy:
    - **Windows**: `winget install mitmproxy.mitmproxy`
    - **macOS**: `brew install mitmproxy`
    - **Linux**: `python3 -m pip install --user mitmproxy`
2. Verify install: `mitmproxy --version`

### Start local proxy

1. Start mitmproxy on port `8888`:
    - `mitmproxy --listen-host 127.0.0.1 --listen-port 8888`
2. Keep this terminal open while testing.

### Configure ToolBox

1. Open ToolBox settings and go to **Network / Proxy**.
2. Set mode to **Manual proxy**.
3. Set proxy URL to `http://127.0.0.1:8888`.
4. Click **Test Connection**.
5. Trigger Node-side flows (marketplace refresh, tool download).
6. In mitmproxy, verify requests from ToolBox are listed.

## 2) PAC / WPAD auto-detection

1. Create a PAC file (for example `/tmp/proxy.pac`) with:
    ```javascript
    function FindProxyForURL(url, host) {
        if (host === "localhost" || shExpMatch(host, "*.local")) {
            return "DIRECT";
        }
        return "PROXY 127.0.0.1:8888; DIRECT";
    }
    ```
2. Serve PAC file:
    - `python3 -m http.server 9000 --directory /tmp`
3. Start mitmproxy:
    - `mitmproxy --listen-host 127.0.0.1 --listen-port 8888`
4. Configure OS proxy auto-config:
    - **Windows**: Settings → Network & Internet → Proxy → Use setup script.
    - **macOS**: System Settings → Network → active adapter → Details → Proxies → Automatic Proxy Configuration.
    - PAC URL: `http://127.0.0.1:9000/proxy.pac`
5. In ToolBox, set mode to **Auto-detect system proxy**.
6. Restart the app.
7. Use **Test Connection** and verify traffic routes according to PAC rules.
8. Confirm behavior in proxy/PAC server logs.

> **Limitation:** Node-side requests evaluate the PAC script once, at startup, for a single probe URL. They do not evaluate it per host. See [Known gaps](#8-known-gaps).

## 3) TLS interception simulation (custom CA bundle)

1. Use `mitmproxy` with TLS interception enabled (`mitmproxy --listen-host 127.0.0.1 --listen-port 8888`).
2. Do **not** rely on OS trust store alone for Node-side calls.
3. Export mitmproxy CA bundle:
    - Default path is usually `~/.mitmproxy/mitmproxy-ca-cert.pem`.
4. In ToolBox settings (Manual proxy mode), set:
    - Proxy URL: `http://127.0.0.1:8888`
    - **Custom CA Bundle**: full path to `mitmproxy-ca-cert.pem`
5. Run **Test Connection** and marketplace/tool download operations.
6. Confirm requests succeed without `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
7. Sign in to an environment and run a Dataverse query from a tool. These proxied Node-side HTTPS requests also use the custom CA bundle and should succeed.
8. Clear the **Custom CA Bundle** and repeat step 7. Confirm the request fails and an **Untrusted certificate through proxy** notification appears.

## 4) Proxy authentication challenge (407)

1. Start mitmproxy with authentication:
    - `mitmproxy --listen-host 127.0.0.1 --listen-port 8888 --proxyauth user:pass`
2. Set ToolBox proxy mode to **Manual proxy** with that endpoint.
3. Trigger a browser-side network call (for example, Microsoft Login sign-in window). Confirm the proxy credentials prompt appears only when the 407 challenge occurs, then enter credentials and verify the request succeeds.
4. Trigger a Node-side network call (marketplace refresh, Dataverse query from a tool).
    - **Current expected result:** the request fails, no credentials prompt is shown, and a **Proxy authentication required** ToolBox notification appears (at most once per host every 5 minutes). The marketplace shows the error with **Retry** and **Copy details**. See [Known gaps](#8-known-gaps).
    - **Workaround:** include credentials in the manual proxy URL, for example `http://user:pass@127.0.0.1:8888`, then confirm Node-side calls succeed.

## 5) NO_PROXY exclusions

1. In manual mode, set a proxy and add exclusions in **No Proxy List** (for example `localhost,127.0.0.1,.internal`).
2. Run operations that target excluded hosts.
3. Confirm excluded hosts bypass the proxy (no entries in proxy logs for those hosts).

## 6) Environment authentication

1. Configure the proxy in Manual mode, keeping `localhost,127.0.0.1,.internal` in the no-proxy list where appropriate.
2. Add an environment using Microsoft Login and complete browser sign-in.
3. Verify the proxy sees MSAL discovery and token requests to `login.microsoftonline.com`, followed by the environment's Dataverse `WhoAmI` request.
4. Confirm the local callback page reports **Authentication Successful** and the connection is saved.
5. Repeat with Auto-detect mode on a machine with a system proxy configured.
6. Repeat a connection test using client-secret authentication, if available, and reconnect an existing Microsoft Login connection to exercise silent token acquisition.
7. Change the proxy settings and reconnect without restarting. New authentication requests should use the updated route.

Browser sign-in, app-side token exchange, and Dataverse validation are separate network operations. A working marketplace or browser login does not by itself validate the other routes. Authentication requests use the shared proxy manager, including no-proxy exclusions and custom CA settings. Keep TLS verification enabled.

If the callback shows `network_error: Network request failed`, inspect the application logs and outbound token requests. A separate `/favicon.ico` HTTP 400 from the localhost callback is not the authentication failure.

## 7) Troubleshooting

Check these log areas when routing is not as expected:

- `src/main/managers/proxyManager.ts` log entries:
    - `[ProxyManager] System proxy auto-detection completed`
    - `[ProxyManager] System proxy auto-detection failed`
    - `[ProxyManager] Effective proxy configuration applied` (mode, proxy host, no-proxy count, CA bundle presence)
    - `[ProxyManager] Outbound route resolved` (logged once per host and route; `target` is a host category such as `dataverse`, `supabase`, `microsoft-login`, or `other`; `channel` is `fetch` for marketplace/Supabase and `node-http` for authentication, Dataverse, Power Platform API, and downloads)
    - `[ProxyManager] Proxy connection failure` (failure kind, error code or proxy HTTP status, channel, and host category)
    - `[ProxyManager] Failed to create fetch dispatcher`
    - `[ProxyManager] Failed to read custom CA bundle`
- `src/main/managers/toolRegistryManager.ts` log entries for marketplace/download requests, including `[ToolRegistry] Marketplace <stage> fetch failed`
- Settings validation via **Test Connection** result text in the settings UI

Main-process logs are written to the terminal that launched the app (for example `pnpm run dev`, or launching the packaged executable from a terminal). Proxy credentials are never logged; only the proxy host and port are shown. Target hostnames are logged only as categories.

### How failures are surfaced

- **Proxy failures on Node-side requests** are classified centrally by the proxy manager: `proxy-auth-required` (407), `proxy-rejected` (other non-200 CONNECT responses, such as 403 or 502), `proxy-unreachable`, `proxy-timeout`, `tls-untrusted`, and `connection-reset`. Each failure:
    - shows a ToolBox error notification naming the host and the likely fix (throttled to once per failure kind and host every 5 minutes; the throttle resets when proxy settings change),
    - is captured in Sentry as `Proxy connection failure: <kind>` with tags `component=proxy`, `proxy_failure`, `proxy_mode`, `proxy_channel`, and `proxy_target` (host category only, never the hostname),
    - is still returned to the caller, so the tool or marketplace also receives the error.
- **Test Connection** reports a failure when the proxy rejects the tunnel (for example 407). Previously this showed "Proxy route is working". Failures are captured in Sentry as `Proxy test connection failed: <kind>`, without a notification, because the result is already shown in Settings.
- **Marketplace:** the built-in marketplace loads from Supabase, then the Azure Blob mirror. There is no bundled-registry fallback in production builds.
    - If both fail, the marketplace shows the error with **Retry** and **Copy details**.
    - If the mirror is used, or a private marketplace source fails, a banner above the tool list explains which source is affected.
    - Each failure is captured in Sentry as `Marketplace <stage> fetch failed`. For private sources only the error code or HTTP status is sent, never the URL, host, label, or message.

If requests are still direct:

1. Verify proxy mode and manual URL format.
2. Verify no-proxy host patterns are not unintentionally matching the target.
3. Verify CA bundle path points to a readable PEM file.
4. Restart the app after changing auto-detect mode to refresh resolved proxy state.

If proxy test shows errors:

1. `connect ECONNREFUSED 127.0.0.1:8888`
    - Nothing is listening on `127.0.0.1:8888`.
    - Start mitmproxy, or update ToolBox manual proxy URL to the actual port.
2. `Connection reached endpoint (HTTP 404)`
    - Network path is working, but that endpoint returned 404.
    - This still confirms proxy routing and connectivity.

## 8) Known gaps

ToolBox sends network requests through two different network stacks. Most proxy limitations come from the difference between them.

| Network stack            | Used by                                                                                                             | Proxy/PAC/auth/certificates handled by                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Browser-side (Chromium)  | Login window, renderer pages, auto-updater                                                                          | The operating system and Chromium, automatically              |
| Node-side (main process) | Marketplace (Supabase), authentication token exchange, Dataverse API, Power Platform API, tool and worker downloads | ToolBox's proxy manager (`src/main/managers/proxyManager.ts`) |

### Gap 1: Proxy authentication (HTTP 407) for Node-side requests

- **What it is:** Some corporate proxies require credentials. They respond with `407 Proxy Authentication Required` until the client retries with a `Proxy-Authorization` header.
- **Current behavior:** Only browser-side requests trigger the ToolBox proxy credentials prompt. Node-side requests fail on a 407, and credentials saved from the prompt are not reused for them.
- **Symptom:** The marketplace does not load, tools return no Dataverse data, or connection authentication fails. Instead of a credentials prompt, ToolBox shows a **Proxy authentication required** notification.
- **Workaround (Basic auth proxies):** Use **Manual proxy** mode with credentials in the URL, for example `http://user:pass@proxy.corp.com:8080`.
- **Not supported:** Proxies that authenticate with integrated Windows authentication (NTLM/Kerberos/Negotiate).
- **Possible fix:** Reuse saved credentials as a `Proxy-Authorization` header for Basic auth. Full support for integrated Windows authentication needs Node-side requests to move to Electron's `net` module.

### Gap 2: PAC files are evaluated once, not per host

- **What it is:** A PAC (Proxy Auto-Config) file is a JavaScript `FindProxyForURL(url, host)` function, published by IT and applied by the OS. It can return a different proxy, or `DIRECT`, for each host.
- **Current behavior:** In **Auto-detect** mode, ToolBox asks the OS once, at startup, for the proxy of a single probe URL (the Supabase URL). It applies that answer to every Node-side host. Changes to the system proxy or PAC file need an app restart.
- **Symptom:** Hosts that the PAC file marks as `DIRECT`, such as internal hosts or `*.dynamics.com` in some organizations, are still sent to the proxy. They can be blocked, or fail if the proxy cannot reach them.
- **Workaround:** Add those hosts to the **No Proxy List**, or use **Manual proxy** mode.
- **Possible fix:** Resolve the proxy per host with `session.resolveProxy(url)` and cache the result per host.

### Resolved: Custom CA bundle on proxied Node-side HTTPS requests

Previously, `https-proxy-agent` v5 ignored the agent-level `ca` when it opened the TLS connection to the target, so sign-in and Dataverse calls failed behind TLS-inspecting proxies even with a CA bundle configured. ToolBox now uses `https-proxy-agent` v7 and passes the combined CA bundle to the target TLS connection. Certificate failures that remain are reported as `tls-untrusted` (see [How failures are surfaced](#how-failures-are-surfaced)).

### Long-term direction

Moving Node-side HTTP calls to Electron's `net` module (`net.request` / `net.fetch`) would close the remaining gaps. It uses the same network stack as the browser, which already handles system proxy settings, per-host PAC evaluation, Basic and integrated Windows proxy authentication through the existing prompt, and the OS certificate store. This change affects authentication, Dataverse, marketplace, and downloads, so it should be validated on real corporate networks before release.
