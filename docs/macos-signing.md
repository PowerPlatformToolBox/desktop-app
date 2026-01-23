# macOS Code Signing and Notarization

The stable release and nightly insider workflows now sign and notarize the macOS build artifacts so end users can install the app without bypassing Gatekeeper. This document explains how to supply the required credentials and verify the output.

## Secrets expected by GitHub Actions

| Secret                        | Description                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MACOS_CERT_P12`              | Base64-encoded contents of the Developer ID Application `.p12` certificate. Run `base64 -i cert.p12 | pbcopy` to capture it.  |
| `MACOS_CERT_PASSWORD`         | Password used when exporting the `.p12`.                                                                                      |
| `APPLE_ID`                    | Apple ID (email) associated with the Developer ID certificate.                                                                |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password created under Apple ID security settings.                                                               |
| `APPLE_TEAM_ID`               | Ten-character Team ID for the Apple Developer account.                                                                        |

Add these secrets at either the repository or organization level before triggering the `Stable Release` or `Insider Pre-Release` workflows. Each workflow decodes the certificate into the runner's temp directory and injects the credentials via environment variables consumed by Electron Builder and the notarization hook.

## How the pipeline signs macOS artifacts

1. `buildScripts/electron-builder-mac.json` enables the Hardened Runtime, entitlements, and references `buildScripts/notarize.js`.
2. `buildScripts/entitlements.mac.plist` contains the minimal entitlements needed for the app's Electron runtime.
3. During the `Package application (macOS)` job step, the workflow decodes the certificate, sets `CSC_LINK`/`CSC_KEY_PASSWORD`, and exports the Apple credentials.
4. Electron Builder signs the `.app`, `.zip`, and `.dmg` with the Developer ID certificate.
5. After signing, `buildScripts/notarize.js` runs `@electron/notarize` to notarize the `.app` bundle using the Apple ID + app-specific password and waits for notarization to complete.
6. The notarized `.dmg`/`.zip` files are uploaded as artifacts for both stable and nightly releases.

## Local validation steps

To validate a locally produced build before committing:

```bash
pnpm run package:mac
codesign --verify --deep --strict build/mac/Power\ Platform\ ToolBox.app
spctl --assess --type exec build/mac/Power\ Platform\ ToolBox.app
```

For notarization status, run:

```bash
xcrun notarytool history --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

The history command should show the latest upload as `Accepted`.

## Troubleshooting

- If the workflow fails before packaging, confirm the secrets exist and contain no line breaks or surrounding quotes.
- When notarization times out, check the Apple developer status page and rerun the workflow. The script prints `Submitted notarization request` upon success and throws on errors.
- To rotate credentials, upload the new `.p12` and passwords to the same secrets; no source changes are required.
