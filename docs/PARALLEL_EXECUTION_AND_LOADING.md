# Parallel Execution & Loading Screen API

This document describes the new parallel execution and loading screen features added to the ToolBox API.

## Features

### 1. Parallel Execution (`executeParallel`)

Execute multiple API operations concurrently using `Promise.all` under the hood. This is useful when you need to fetch multiple pieces of data simultaneously or perform multiple independent operations.

#### Usage

```javascript
// Execute multiple Dataverse queries in parallel
const results = await toolboxAPI.utils.executeParallel([
  { method: 'dataverse.retrieve', args: ['account', 'account-id-123', ['name', 'accountnumber']] },
  { method: 'dataverse.retrieve', args: ['contact', 'contact-id-456', ['fullname', 'emailaddress1']] },
  { method: 'dataverse.fetchXmlQuery', args: ['<fetch><entity name="opportunity">...</entity></fetch>'] }
]);

// results[0] = account record
// results[1] = contact record
// results[2] = opportunity query results
```

#### Benefits

- **Performance**: Reduces total execution time by running operations concurrently
- **Simplicity**: Single function call instead of managing multiple promises manually
- **Error Handling**: If any operation fails, the entire `executeParallel` call will reject

#### Method Signature

```typescript
executeParallel: (operations: Array<{ method: string; args?: any[] }>) => Promise<any[]>
```

**Parameters:**
- `operations`: Array of operation descriptors, each containing:
  - `method`: String representing the API method to call (e.g., 'dataverse.retrieve', 'utils.showNotification')
  - `args`: Optional array of arguments to pass to the method

**Returns:** Promise that resolves to an array of results in the same order as the operations

#### Examples

**Example 1: Fetch Multiple Records**

```javascript
// Show loading screen while fetching
await toolboxAPI.utils.showLoading('Fetching records...');

try {
  const [account, contact, opportunities] = await toolboxAPI.utils.executeParallel([
    { method: 'dataverse.retrieve', args: ['account', accountId, ['name']] },
    { method: 'dataverse.retrieve', args: ['contact', contactId, ['fullname']] },
    { method: 'dataverse.fetchXmlQuery', args: [opportunityFetchXml] }
  ]);
  
  console.log('Account:', account);
  console.log('Contact:', contact);
  console.log('Opportunities:', opportunities);
} finally {
  await toolboxAPI.utils.hideLoading();
}
```

**Example 2: Combine Different API Operations**

```javascript
const results = await toolboxAPI.utils.executeParallel([
  { method: 'connections.getActiveConnection' },
  { method: 'settings.getSettings' },
  { method: 'dataverse.getAllEntitiesMetadata' }
]);

const [connection, settings, entities] = results;
```

### 2. Loading Screen (`showLoading` / `hideLoading`)

Display a loading overlay with an animated spinner in the tool's context. The loading screen is scoped to the tool and won't interfere with other tools or the main UI.

#### Usage

```javascript
// Show loading screen with default message
await toolboxAPI.utils.showLoading();

// Show loading screen with custom message
await toolboxAPI.utils.showLoading('Processing data...');

// Hide loading screen
await toolboxAPI.utils.hideLoading();
```

#### Features

- **Context-Scoped**: Loading screen appears only in the tool's iframe, not affecting other tools
- **Customizable Message**: Display contextual information to the user
- **Smooth Animations**: Fade in/out animations for better UX
- **Backdrop Blur**: Subtle blur effect on background content
- **Theme Support**: Automatically adapts to light/dark theme

#### Method Signatures

```typescript
showLoading: (message?: string) => Promise<void>
hideLoading: () => Promise<void>
```

**Parameters:**
- `message` (optional): Custom message to display. Defaults to "Loading..."

#### Best Practices

1. **Always Hide**: Use try-finally to ensure the loading screen is hidden even if an error occurs
2. **Informative Messages**: Provide context-specific messages to keep users informed
3. **Reasonable Duration**: Don't use for very quick operations (< 500ms)
4. **Combine with Parallel Execution**: Use together for optimal performance

#### Complete Example

```javascript
async function fetchAndProcessData() {
  // Show loading screen
  await toolboxAPI.utils.showLoading('Fetching data from Dataverse...');
  
  try {
    // Fetch multiple records in parallel
    const [accounts, contacts, opportunities] = await toolboxAPI.utils.executeParallel([
      { method: 'dataverse.fetchXmlQuery', args: [accountsFetchXml] },
      { method: 'dataverse.fetchXmlQuery', args: [contactsFetchXml] },
      { method: 'dataverse.fetchXmlQuery', args: [opportunitiesFetchXml] }
    ]);
    
    // Update loading message for processing
    await toolboxAPI.utils.showLoading('Processing results...');
    
    // Process the data
    const processed = processData(accounts, contacts, opportunities);
    
    // Show success notification
    await toolboxAPI.utils.showNotification({
      title: 'Success',
      body: 'Data fetched and processed successfully',
      type: 'success'
    });
    
    return processed;
  } catch (error) {
    // Show error notification
    await toolboxAPI.utils.showNotification({
      title: 'Error',
      body: `Failed to fetch data: ${error.message}`,
      type: 'error'
    });
    throw error;
  } finally {
    // Always hide loading screen
    await toolboxAPI.utils.hideLoading();
  }
}
```

## Implementation Details

### Loading Screen UI

The loading screen consists of:
- Full-screen overlay with semi-transparent background
- Backdrop blur effect (4px)
- Centered spinner with smooth rotation animation
- Customizable message text below spinner
- Fade in/out animations (200ms)

### CSS Classes

```css
.loading-screen {
  /* Full screen overlay with blur */
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 10000;
}

.loading-spinner {
  /* Animated spinner */
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.2);
  border-top-color: #0078d4;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-message {
  /* Message text */
  margin-top: 16px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
}
```

### Performance Considerations

- `executeParallel` uses `Promise.all()` internally, which means:
  - All operations start immediately and run concurrently
  - Results are returned in the same order as operations
  - If any operation fails, the entire promise rejects
  - For independent operations with varying execution times, this provides optimal performance

- Loading screen animations are GPU-accelerated using CSS transforms and opacity
- Backdrop blur uses CSS `backdrop-filter` for smooth visual effect

## Migration Guide

If you were manually managing parallel operations or loading states, here's how to migrate:

### Before

```javascript
// Manual parallel execution
const [account, contact] = await Promise.all([
  window.dataverseAPI.retrieve('account', accountId),
  window.dataverseAPI.retrieve('contact', contactId)
]);

// Manual loading state
const loadingEl = document.getElementById('my-loading-spinner');
loadingEl.style.display = 'block';
try {
  await fetchData();
} finally {
  loadingEl.style.display = 'none';
}
```

### After

```javascript
// Using executeParallel
const [account, contact] = await toolboxAPI.utils.executeParallel([
  { method: 'dataverse.retrieve', args: ['account', accountId] },
  { method: 'dataverse.retrieve', args: ['contact', contactId] }
]);

// Using showLoading/hideLoading
await toolboxAPI.utils.showLoading('Fetching data...');
try {
  await fetchData();
} finally {
  await toolboxAPI.utils.hideLoading();
}
```

## API Reference

All new methods are available in the `toolboxAPI.utils` namespace:

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `executeParallel` | `operations: Array<{method: string, args?: any[]}>` | `Promise<any[]>` | Execute multiple API methods in parallel |
| `showLoading` | `message?: string` | `Promise<void>` | Show loading screen with optional message |
| `hideLoading` | none | `Promise<void>` | Hide loading screen |

## Browser Support

These features are supported in all modern browsers that support:
- `Promise.all()` (ES6)
- CSS animations and transforms
- CSS `backdrop-filter` (loading screen blur effect)

## Troubleshooting

**Q: The loading screen doesn't appear**
- Check that you're calling `showLoading()` and `await`ing the promise
- Verify the tool's iframe is properly initialized
- Check browser console for errors

**Q: executeParallel fails with "API method not found"**
- Verify the method name is correct and accessible (e.g., 'dataverse.retrieve')
- Check that the method is part of the exposed toolboxAPI
- Ensure you're calling from within a tool context (iframe)

**Q: Loading screen doesn't hide after error**
- Always use try-finally to ensure `hideLoading()` is called
- Check that the finally block isn't skipped due to early returns

## See Also

- [Tool Development Guide](TOOL_DEVELOPMENT.md)
- [ToolBox API Reference](../packages/toolboxAPI.d.ts)
- [Architecture Documentation](ARCHITECTURE.md)
