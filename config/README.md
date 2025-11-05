# Build Configuration

This directory contains build-time configuration files for the Power Platform Tool Box application.

## Files

### `entitlements.mac.plist`

macOS entitlements file for unsigned/ad-hoc signed builds.

**Purpose**: When building without an Apple Developer certificate (e.g., in CI/CD workflows), these entitlements allow the Electron app to function properly on macOS.

**Entitlements Explained**:

| Entitlement                                              | Purpose                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `com.apple.security.cs.allow-jit`                        | Enables Just-In-Time compilation for the V8 JavaScript engine                    |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Allows execution of unsigned code in memory (required for Node.js native addons) |
| `com.apple.security.cs.disable-library-validation`       | Disables library validation to allow loading unsigned dynamic libraries          |
| `com.apple.security.cs.allow-dyld-environment-variables` | Allows dynamic linker environment variables (needed for development)             |

**⚠️ Security Note**: These entitlements are permissive and intended for **unsigned development builds only**. For production releases with proper Apple Developer certificates, use more restrictive entitlements following the principle of least privilege.

## Why This Folder?

Configuration files like entitlements need to be:

-   ✅ Version controlled (committed to git)
-   ✅ Separate from build outputs (not in `build/` or `dist/`)
-   ✅ Easy to locate and modify
-   ✅ Reusable across different build environments

The `config/` directory serves as a dedicated location for such files.

## Production Builds

For signed production releases:

1. **Obtain Apple Developer Certificate**

    - Enroll in Apple Developer Program ($99/year)
    - Create Developer ID Application certificate
    - Download and install in Keychain

2. **Update package.json**

    ```json
    "mac": {
      "identity": "Developer ID Application: Your Name (TEAM_ID)",
      "hardenedRuntime": true,
      "gatekeeperAssess": true
    }
    ```

3. **Restrict Entitlements**

    - Remove or limit permissive entitlements
    - Add only necessary capabilities
    - Consider app sandboxing

4. **Enable Notarization**
    - Add notarization configuration to package.json
    - Set `APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID` secrets
    - Notarize builds in CI/CD

## Resources

-   [Electron Code Signing](https://www.electron.build/code-signing)
-   [macOS Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)
-   [Entitlements Reference](https://developer.apple.com/documentation/bundleresources/entitlements)
-   [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
