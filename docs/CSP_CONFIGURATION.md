# Per-Tool CSP Configuration

## Overview

Power Platform Tool Box implements per-tool Content Security Policy (CSP) configuration to allow tools to make external API calls and load external resources while maintaining security. This feature requires explicit user consent before granting any CSP exceptions.

## What is CSP?

Content Security Policy (CSP) is a security standard that helps prevent Cross-Site Scripting (XSS) attacks and other code injection attacks by controlling which resources can be loaded by a web page.

By default, PPTB enforces a strict CSP for all tools:
- Scripts and styles can only be loaded from the tool itself
- Network requests can only be made to the tool itself
- Images can be loaded from the tool, data URIs, or HTTPS sources
- External fonts and other resources are restricted

## Why Per-Tool CSP?

Some tools need to:
- Make API calls to Dataverse or other external services
- Load external libraries from CDNs (e.g., visualization libraries)
- Load external stylesheets or fonts
- Embed external content

Rather than weakening security for all tools, PPTB allows each tool to request only the specific CSP exceptions it needs, and users must explicitly grant these permissions.

## How It Works

### For Tool Users

1. **First Launch**: When you launch a tool that requires CSP exceptions for the first time, you'll see a consent dialog
2. **Review Permissions**: The dialog shows exactly what external resources the tool wants to access
3. **Grant or Decline**: You can choose to accept or decline the permissions
4. **Stored Consent**: If you accept, your consent is stored and you won't be asked again for that tool
5. **Revoke Consent**: You can revoke consent at any time in the settings

### For Tool Developers

Tools can specify CSP exceptions in their `package.json` manifest:

```json
{
  "name": "@power-maverick/dataverse-erd-generator",
  "displayName": "Dataverse ERD Generator",
  "version": "1.0.0",
  "description": "Generate Entity Relationship Diagrams from Dataverse",
  "author": "Power Maverick",
  "cspExceptions": {
    "connect-src": [
      "https://*.dynamics.com",
      "https://*.crm*.dynamics.com"
    ],
    "script-src": [
      "https://cdn.jsdelivr.net"
    ],
    "style-src": [
      "https://cdn.jsdelivr.net"
    ],
    "img-src": [
      "https://example.com/images"
    ]
  }
}
```

## Supported CSP Directives

PPTB supports the following CSP directives for per-tool configuration:

| Directive | Purpose | Example |
|-----------|---------|---------|
| `connect-src` | Controls which URLs can be loaded via XHR, fetch, WebSocket, etc. | `["https://*.dynamics.com"]` |
| `script-src` | Controls which sources can load JavaScript | `["https://cdn.jsdelivr.net"]` |
| `style-src` | Controls which sources can load CSS | `["https://fonts.googleapis.com"]` |
| `img-src` | Controls which sources can load images | `["https://example.com/images"]` |
| `font-src` | Controls which sources can load fonts | `["https://fonts.gstatic.com"]` |
| `frame-src` | Controls which sources can be embedded in frames | `["https://trusted-domain.com"]` |
| `media-src` | Controls which sources can load video/audio | `["https://media-cdn.com"]` |

## Default CSP Policy

Tools start with this default CSP policy:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self';
```

Tool-specified exceptions are **added** to these defaults, not replaced.

## Best Practices for Tool Developers

### 1. Request Only What You Need
Only request CSP exceptions for resources your tool actually needs. Users are more likely to trust tools that request minimal permissions.

**Bad Example:**
```json
{
  "cspExceptions": {
    "connect-src": ["*"],  // Too broad!
    "script-src": ["*"]    // Dangerous!
  }
}
```

**Good Example:**
```json
{
  "cspExceptions": {
    "connect-src": [
      "https://api.powerbi.com",
      "https://*.dynamics.com"
    ],
    "script-src": [
      "https://cdn.jsdelivr.net/npm/mermaid@9"
    ]
  }
}
```

### 2. Use Specific Domains
Use the most specific domain patterns possible. Wildcards should be used sparingly.

**Prefer:** `https://cdn.example.com`  
**Over:** `https://*.example.com`  
**Avoid:** `https:` (allows any HTTPS site)

### 3. Document Your Requirements
Clearly document in your README why your tool needs each CSP exception:

```markdown
## Security Permissions

This tool requires the following CSP exceptions:

- **connect-src: https://*.dynamics.com** - Required to fetch metadata from Dataverse
- **script-src: https://cdn.jsdelivr.net** - Required to load the Mermaid diagram library
```

### 4. Consider Alternatives
Before requesting CSP exceptions, consider if there are alternatives:
- Can you bundle the library instead of loading from CDN?
- Can you proxy API calls through a secure backend?
- Can you use PPTB's built-in Dataverse API instead of direct calls?

## Security Considerations

### For Users

- **Only install tools from trusted sources**
- **Review CSP exceptions carefully** before granting consent
- **Watch for suspicious patterns** like requests to unusual domains
- **Revoke consent** if you no longer use a tool

### For Tool Developers

- **Never request `*` or overly broad wildcards**
- **Validate and sanitize all user input**
- **Use HTTPS for all external resources**
- **Keep dependencies up to date**
- **Follow the principle of least privilege**

## Revoking Consent

Users can revoke CSP consent for any tool:

1. Go to Settings
2. Navigate to Security / CSP Permissions (future feature)
3. Find the tool and click "Revoke Consent"
4. The next time the tool is launched, the consent dialog will appear again

Alternatively, consent is stored in the user settings file and can be manually edited.

## Registry Configuration

When publishing a tool to the PPTB registry, include the `cspExceptions` in your registry entry:

```json
{
  "id": "dataverse-erd-generator",
  "name": "Dataverse ERD Generator",
  "version": "1.0.0",
  "author": "Power Maverick",
  "downloadUrl": "...",
  "cspExceptions": {
    "connect-src": ["https://*.dynamics.com"],
    "script-src": ["https://cdn.jsdelivr.net"]
  }
}
```

## Local Tool Development

Local tools can also specify CSP exceptions in their `package.json`. The same consent flow applies when loading local development tools.

## Troubleshooting

### Tool Shows CSP Violation Errors

**Symptom:** Browser console shows CSP violation errors  
**Solution:** 
1. Check if you've granted CSP consent for the tool
2. Verify the tool's CSP exceptions include the blocked resource
3. Contact the tool developer if the exceptions are incorrect

### CSP Dialog Doesn't Appear

**Symptom:** Tool doesn't load but no consent dialog is shown  
**Solution:**
1. Check browser console for JavaScript errors
2. Clear the tool from the open tabs and try again
3. Check if consent was already granted in settings

### Can't Revoke Consent

**Symptom:** Want to revoke consent but can't find the option  
**Solution:**
1. Manually edit the settings file (in development)
2. Full UI for consent management is planned for a future release

## Example: Complete Tool Manifest

Here's a complete example for a tool that needs Dataverse access and external libraries:

```json
{
  "name": "@your-org/your-tool",
  "displayName": "My Awesome Tool",
  "version": "1.0.0",
  "description": "A tool that does amazing things with Dataverse",
  "author": "Your Name",
  "main": "dist/index.html",
  "icon": "icon.png",
  "cspExceptions": {
    "connect-src": [
      "https://*.dynamics.com",
      "https://*.crm*.dynamics.com"
    ],
    "script-src": [
      "https://cdn.jsdelivr.net/npm/mermaid@10"
    ],
    "style-src": [
      "https://cdn.jsdelivr.net/npm/mermaid@10"
    ]
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/your-tool"
  },
  "license": "MIT"
}
```

## Future Enhancements

Planned improvements for CSP configuration:

1. **UI for Managing Consent** - Settings page to view and revoke all CSP consents
2. **Temporary Consent** - Option to grant one-time permission
3. **Detailed Audit Log** - Track when tools use their CSP permissions
4. **CSP Templates** - Pre-approved templates for common use cases (e.g., "Dataverse Access")
5. **Warning Levels** - Different UI treatment for low-risk vs high-risk permissions

## References

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [OWASP: Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
