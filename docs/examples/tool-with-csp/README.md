# Tool with CSP Configuration Example

This example demonstrates how to configure Content Security Policy (CSP) for a Power Platform Tool Box tool that needs to make external API calls.

## Example: Dataverse ERD Generator

This tool generates Entity Relationship Diagrams from Dataverse metadata and requires:

-   **API Access**: Connections to Dataverse instances (*.dynamics.com)
-   **CDN Resources**: Loading diagram libraries from jsdelivr.net
-   **Inline Styles**: For dynamic diagram styling

## package.json Configuration

```json
{
    "name": "@power-maverick/tool-erd-generator",
    "version": "1.0.0",
    "displayName": "Dataverse ERD Generator",
    "description": "Generate Entity Relationship Diagrams from Dataverse metadata with external API calls",
    "main": "dist/index.js",
    "author": "Power Maverick",
    "keywords": ["powerplatform", "dataverse", "erd", "toolbox"],
    "engines": {
        "node": ">=16.0.0"
    },
    "csp": {
        "connect-src": ["https://*.dynamics.com", "https://*.crm*.dynamics.com"],
        "script-src": ["https://cdn.jsdelivr.net"],
        "style-src": ["'unsafe-inline'"]
    }
}
```

## CSP Breakdown

### connect-src

Allows the tool to make HTTP requests to:

-   `https://*.dynamics.com` - Main Dataverse domains
-   `https://*.crm*.dynamics.com` - Regional Dataverse endpoints (e.g., crm.dynamics.com, crm4.dynamics.com)

### script-src

Allows loading JavaScript from:

-   `https://cdn.jsdelivr.net` - Popular CDN for diagram libraries (e.g., mermaid, d3.js)

### style-src

-   `'unsafe-inline'` - Allows inline styles for dynamic diagram rendering

## Merged CSP Result

When this tool is loaded, PPTB will merge the tool's CSP with the default CSP:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline';
connect-src 'self' https://*.dynamics.com https://*.crm*.dynamics.com;
img-src 'self' data: https:;
font-src 'self' data:;
```

## Tool Implementation Example

```typescript
/// <reference types="@pptb/types" />

// Access the ToolBox API
const toolbox = window.toolboxAPI;

// Get connection context (URL and access token)
const context = await toolbox.getToolContext();

// Make authenticated API call to Dataverse
async function fetchEntityMetadata() {
    if (!context.connectionUrl || !context.accessToken) {
        toolbox.showNotification({
            title: "No Connection",
            body: "Please connect to a Dataverse environment first",
            type: "warning",
        });
        return;
    }

    try {
        // The CSP allows this request because of connect-src directive
        const response = await fetch(`${context.connectionUrl}/api/data/v9.2/EntityDefinitions`, {
            headers: {
                Authorization: `Bearer ${context.accessToken}`,
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
                Accept: "application/json",
            },
        });

        const data = await response.json();
        return data.value;
    } catch (error) {
        toolbox.showNotification({
            title: "API Error",
            body: `Failed to fetch metadata: ${error}`,
            type: "error",
        });
    }
}

// Load diagram library from CDN
// The CSP allows this script because of script-src directive
function loadMermaidLibrary() {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    script.onload = () => {
        console.log("Mermaid library loaded");
    };
    document.head.appendChild(script);
}

// Initialize
(async () => {
    loadMermaidLibrary();
    const entities = await fetchEntityMetadata();
    // Generate ERD diagram...
})();
```

## Testing CSP Locally

1. Build your tool: `npm run build`
2. Install in PPTB from local directory
3. Open browser DevTools in PPTB
4. Check Console for any CSP violations
5. Adjust CSP directives as needed

## CSP Transparency

Users can view your tool's CSP requirements:

1. Open PPTB
2. Go to Tools Marketplace or Installed Tools
3. Click on your tool
4. Scroll to "Security Policy (CSP)" section
5. See all CSP directives your tool requires

## Best Practices

✅ **Do:**

-   Only request CSP permissions you actually need
-   Be specific with domain patterns (e.g., `https://api.example.com` instead of `https://*`)
-   Document why you need each CSP directive in your README
-   Test your tool thoroughly with the CSP configuration

❌ **Don't:**

-   Use `'unsafe-eval'` in script-src (security risk)
-   Request overly broad permissions (e.g., `https://*`)
-   Add CSP directives "just in case" - only add what you use
-   Forget to test your tool after changing CSP

## Debugging CSP Issues

If your tool isn't working due to CSP violations:

1. Open browser DevTools in PPTB
2. Check the Console tab for CSP violation messages
3. Look for messages like: `Refused to load the script ... because it violates the following Content Security Policy directive: ...`
4. Add the required directive to your `package.json`
5. Rebuild and reinstall your tool
6. Test again

## Additional Resources

-   [MDN CSP Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
-   [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
-   [Content Security Policy Reference](https://content-security-policy.com/)
