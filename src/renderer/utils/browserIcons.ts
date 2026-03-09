/**
 * Browser icon data URIs for use in modal windows.
 *
 * These PNGs are imported with Vite's `?inline` query so they are always
 * emitted as base64 data: URIs. This allows them to be used in modal
 * BrowserWindows that load via data: URLs where relative paths cannot resolve
 * and where the CSP restricts `img-src` to `data:`.
 */
import chromeIconUrl from "../icons/logos/chrome.png?inline";
import edgeIconUrl from "../icons/logos/edge.png?inline";

export { chromeIconUrl, edgeIconUrl };
