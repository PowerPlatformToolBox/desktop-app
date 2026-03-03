/**
 * Browser icon data URIs for use in modal windows.
 *
 * These PNGs are imported as Vite assets with assetsInlineLimit set high
 * so they are emitted as base64 data: URIs. This allows them to be used
 * in modal BrowserWindows that load via data: URLs where relative paths
 * cannot resolve.
 */
import chromeIconUrl from "../icons/logos/chrome.png";
import edgeIconUrl from "../icons/logos/edge.png";

export { chromeIconUrl, edgeIconUrl };
