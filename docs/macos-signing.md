# macOS Code Signing and Notarization

The stable release and nightly insider workflows now sign and notarize the macOS build artifacts so end users can install the app without bypassing Gatekeeper. This document explains how to supply the required credentials and verify the output.

## Secrets expected by GitHub Actions

| Secret                        | Description                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MACOS_CERT_P12`              | Base64-encoded contents of the Developer ID Application `.p12` certificate. Run `base64 -i cert.p12 \| pbcopy` to capture it. |
| `MACOS_CERT_PASSWORD`         | Password used when exporting the `.p12`.                                                                                      |
| `APPLE_ID`                    | Apple ID (email) associated with the Developer ID certificate.                                                                |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password created under Apple ID security settings.                                                               |
| `APPLE_TEAM_ID`               | Ten-character Team ID for the Apple Developer account.                                                                        |

Add these secrets at either the repository or organization level before triggering the `Stable Release` or `Insider Pre-Release` workflows. Each workflow decodes the certificate into the runner's temp directory and injects the credentials via environment variables consumed by Electron Builder and the notarization hook.

## How the pipeline signs macOS artifacts

1. `buildScripts/electron-builder-mac.json` enables the Hardened Runtime and entitlements while leaving notarization to the GitHub Actions workflow.
2. `buildScripts/entitlements.mac.plist` contains the minimal entitlements needed for the Electron runtime.
3. The workflow runs `Prepare macOS signing certificate` before packaging to decode the `.p12`, export `CSC_LINK`/`CSC_KEY_PASSWORD`, and clean the temporary file afterward.
4. Electron Builder signs the `.app`, `.zip`, and `.dmg` outputs with the Developer ID certificate using the exported environment variables.
5. Immediately after packaging, the workflow runs `node buildScripts/notarize.js submit` (a thin wrapper around `xcrun notarytool submit --no-wait`) to send the request asynchronously and writes `build/notarization-info.json` so later jobs know the submission ID.
6. A dedicated `mac-notarization` job downloads the macOS artifacts, runs `node buildScripts/notarize.js wait --timeout-hours=12 --interval-minutes=5` to poll Apple's API (with automatic retries for transient network failures), staples every `.dmg`/`.pkg`/`.zip`, and re-uploads the artifacts before the release is published. The release remains in **draft** state until this job succeeds, so unstapled builds never reach end users.

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
- If `buildScripts/notarize.js wait` exits after the 12-hour timeout, check the submission in `xcrun notarytool history`, then rerun the `mac-notarization` job to resume polling. The release will remain in draft mode until the job succeeds.
- To rotate credentials, upload the new `.p12` and passwords to the same secrets; no source changes are required.
