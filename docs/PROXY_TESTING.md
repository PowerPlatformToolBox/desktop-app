# Proxy Feature Local Testing Guide

## 1) Manual proxy routing (local proxy)

1. Start a local proxy (for example `mitmproxy` or a simple Node proxy) on `127.0.0.1:8080`.
2. Open ToolBox settings and go to **Network / Proxy**.
3. Set mode to **Manual proxy** and enter `http://127.0.0.1:8080`.
4. Click **Test Connection**.
5. Trigger other Node-side flows (marketplace fetch, tool download).
6. Verify requests appear in the proxy logs to confirm traffic is routed through the proxy.

## 2) PAC / WPAD auto-detection

1. Serve a local PAC file containing `FindProxyForURL`.
2. Configure OS proxy auto-config:
   - **Windows**: Settings → Network & Internet → Proxy → Use setup script.
   - **macOS**: System Settings → Network → active adapter → Details → Proxies → Automatic Proxy Configuration.
3. In ToolBox, set mode to **Auto-detect system proxy**.
4. Restart the app.
5. Use **Test Connection** and verify traffic routes according to PAC rules.
6. Confirm behavior in proxy/PAC server logs.

## 3) TLS interception simulation (custom CA bundle)

1. Use `mitmproxy` with TLS interception enabled.
2. Do **not** rely on OS trust store alone for Node-side calls.
3. Export mitmproxy CA certificate as PEM (bundle file).
4. In ToolBox settings (Manual proxy mode), set **Custom CA Bundle** to that PEM file.
5. Run **Test Connection** and marketplace/tool download operations.
6. Confirm requests succeed without `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

## 4) Proxy authentication challenge (407)

1. Start `mitmproxy` with proxy authentication enabled (for example `--proxyauth user:pass`).
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
