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

## 4) Proxy authentication challenge (407)

1. Start mitmproxy with authentication:
   - `mitmproxy --listen-host 127.0.0.1 --listen-port 8888 --proxyauth user:pass`
2. Set ToolBox proxy mode to **Manual proxy** with that endpoint.
3. Trigger a Node-side network call.
4. Confirm a proxy credentials prompt appears only when the 407 challenge occurs.
5. Enter credentials and verify the request succeeds.

## 5) NO_PROXY exclusions

1. In manual mode, set a proxy and add exclusions in **No Proxy List** (for example `localhost,127.0.0.1,.internal`).
2. Run operations that target excluded hosts.
3. Confirm excluded hosts bypass the proxy (no entries in proxy logs for those hosts).

## 6) Troubleshooting

Check these log areas when routing is not as expected:

- `src/main/managers/proxyManager.ts` log entries:
  - `[ProxyManager] System proxy auto-detection completed`
  - `[ProxyManager] System proxy auto-detection failed`
  - `[ProxyManager] Failed to read custom CA bundle`
- `src/main/managers/toolRegistryManager.ts` log entries for marketplace/download requests
- Settings validation via **Test Connection** result text in the settings UI

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
