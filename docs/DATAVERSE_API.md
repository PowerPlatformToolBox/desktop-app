# Dataverse API Backend

This document describes the Dataverse Web API implementation in Power Platform Tool Box.

## Overview

The Dataverse API provides a complete HTTP client for interacting with Microsoft Dataverse (formerly Common Data Service). It supports:

- **CRUD Operations**: Create, Read, Update, Delete records
- **FetchXML Queries**: Execute complex queries using FetchXML
- **Metadata Operations**: Retrieve entity and attribute metadata
- **Actions & Functions**: Execute bound and unbound operations
- **Authentication Integration**: Automatic token management and refresh

## Architecture

```
Tool (iframe)
    ↓ postMessage
toolboxAPIBridge.js (dataverseAPI object)
    ↓ postMessage
Renderer Process (message routing)
    ↓ IPC
Preload Bridge (window.toolboxAPI.dataverse)
    ↓ IPC
Main Process IPC Handlers
    ↓ method calls
DataverseManager (HTTP client)
    ↓ HTTPS requests
Dataverse Web API
```

## Components

### 1. DataverseManager (`src/main/managers/dataverseManager.ts`)

The main backend implementation that handles HTTP communication with Dataverse.

**Key Features:**
- OData v4.0 compliant requests
- Automatic token expiry checking and refresh
- Proper error handling and response parsing
- Support for all standard Dataverse operations

**Dependencies:**
- `ConnectionsManager` - For active connection and token retrieval
- `AuthManager` - For token refresh when expired

### 2. IPC Handlers (`src/main/index.ts`)

Nine IPC handlers bridge the renderer and main process:

```typescript
ipcMain.handle("dataverse.create", async (_, entityLogicalName, record) => {...});
ipcMain.handle("dataverse.retrieve", async (_, entityLogicalName, id, columns?) => {...});
ipcMain.handle("dataverse.update", async (_, entityLogicalName, id, record) => {...});
ipcMain.handle("dataverse.delete", async (_, entityLogicalName, id) => {...});
ipcMain.handle("dataverse.retrieveMultiple", async (_, fetchXml) => {...});
ipcMain.handle("dataverse.execute", async (_, request) => {...});
ipcMain.handle("dataverse.fetchXmlQuery", async (_, fetchXml) => {...});
ipcMain.handle("dataverse.getEntityMetadata", async (_, entityLogicalName) => {...});
ipcMain.handle("dataverse.getAllEntitiesMetadata", async () => {...});
```

### 3. Preload Bridge (`src/main/preload.ts`)

Exposes the Dataverse API to the renderer process:

```typescript
dataverse: {
    create: (entityLogicalName, record) => ipcRenderer.invoke("dataverse.create", ...),
    retrieve: (entityLogicalName, id, columns?) => ipcRenderer.invoke("dataverse.retrieve", ...),
    // ... other methods
}
```

### 4. Tool API Bridge (`src/renderer/toolboxAPIBridge.js`)

Provides the `dataverseAPI` object to tools running in iframes:

```javascript
window.dataverseAPI = {
    create: function(entityLogicalName, record) { ... },
    retrieve: function(entityLogicalName, id, columns) { ... },
    // ... other methods
}
```

## API Reference

### CRUD Operations

#### Create

Create a new record in Dataverse.

```javascript
const result = await dataverseAPI.create('account', {
    name: 'Contoso Ltd',
    emailaddress1: 'info@contoso.com',
    telephone1: '555-0100'
});
console.log('Created account ID:', result.id);
```

**Parameters:**
- `entityLogicalName` (string): Logical name of the entity (e.g., 'account', 'contact')
- `record` (object): Record data to create

**Returns:**
- Object containing `id` and other returned fields

#### Retrieve

Retrieve a single record by ID.

```javascript
const account = await dataverseAPI.retrieve(
    'account',
    'guid-here',
    ['name', 'emailaddress1', 'telephone1']
);
console.log('Account name:', account.name);
```

**Parameters:**
- `entityLogicalName` (string): Logical name of the entity
- `id` (string): GUID of the record
- `columns` (string[], optional): Array of column names to retrieve

**Returns:**
- Object containing the requested record

#### Update

Update an existing record.

```javascript
await dataverseAPI.update('account', 'guid-here', {
    name: 'Updated Account Name',
    description: 'Updated description'
});
```

**Parameters:**
- `entityLogicalName` (string): Logical name of the entity
- `id` (string): GUID of the record
- `record` (object): Fields to update

**Returns:**
- void (throws error on failure)

#### Delete

Delete a record.

```javascript
await dataverseAPI.delete('account', 'guid-here');
```

**Parameters:**
- `entityLogicalName` (string): Logical name of the entity
- `id` (string): GUID of the record

**Returns:**
- void (throws error on failure)

### Query Operations

#### FetchXML Query

Execute a FetchXML query.

```javascript
const fetchXml = `
<fetch top="10">
  <entity name="account">
    <attribute name="name" />
    <attribute name="emailaddress1" />
    <filter>
      <condition attribute="statecode" operator="eq" value="0" />
    </filter>
    <order attribute="name" />
  </entity>
</fetch>
`;

const result = await dataverseAPI.fetchXmlQuery(fetchXml);
console.log(`Found ${result.value.length} records`);
result.value.forEach(record => {
    console.log(record.name);
});
```

**Parameters:**
- `fetchXml` (string): FetchXML query string

**Returns:**
- Object with `value` array containing matching records

#### Retrieve Multiple

Alias for `fetchXmlQuery` for backward compatibility.

```javascript
const result = await dataverseAPI.retrieveMultiple(fetchXml);
```

### Metadata Operations

#### Get Entity Metadata

Retrieve metadata for a specific entity.

```javascript
const metadata = await dataverseAPI.getEntityMetadata('account');
console.log('Display Name:', metadata.DisplayName?.LocalizedLabels[0]?.Label);
console.log('Attributes:', metadata.Attributes?.length);
```

**Parameters:**
- `entityLogicalName` (string): Logical name of the entity

**Returns:**
- Object containing entity metadata

#### Get All Entities Metadata

Retrieve metadata for all entities.

```javascript
const allEntities = await dataverseAPI.getAllEntitiesMetadata();
console.log(`Total entities: ${allEntities.value.length}`);
allEntities.value.forEach(entity => {
    console.log(`${entity.LogicalName} - ${entity.DisplayName?.LocalizedLabels[0]?.Label}`);
});
```

**Returns:**
- Object with `value` array containing all entity metadata

### Advanced Operations

#### Execute Action or Function

Execute a Dataverse action or function.

**Unbound Function (e.g., WhoAmI):**

```javascript
const result = await dataverseAPI.execute({
    operationName: 'WhoAmI',
    operationType: 'function'
});
console.log('User ID:', result.UserId);
```

**Bound Action:**

```javascript
const result = await dataverseAPI.execute({
    entityName: 'account',
    entityId: 'guid-here',
    operationName: 'CalculateRollupField',
    operationType: 'action',
    parameters: {
        FieldName: 'total_revenue'
    }
});
```

**Parameters:**
- `request` (object):
  - `operationName` (string): Name of the action/function
  - `operationType` ('action' | 'function'): Type of operation
  - `entityName` (string, optional): Entity logical name for bound operations
  - `entityId` (string, optional): Record ID for bound operations
  - `parameters` (object, optional): Parameters for the operation

**Returns:**
- Object containing the operation result

## Authentication & Token Management

The Dataverse API automatically handles authentication through integration with the AuthManager and ConnectionsManager:

1. **Token Retrieval**: Gets the access token from the active connection
2. **Expiry Checking**: Checks if token expires in the next 5 minutes
3. **Automatic Refresh**: Refreshes the token if needed before making requests
4. **Error Handling**: Provides clear error messages for authentication failures

### Token Refresh Logic

```typescript
// Pseudo-code of token management
if (token.expiresIn < 5 minutes) {
    if (refreshToken exists) {
        newToken = await authManager.refreshAccessToken(connection, refreshToken);
        connectionManager.setActiveConnection(connection.id, newToken);
    } else {
        throw Error('Token expired, please reconnect');
    }
}
```

## Error Handling

All Dataverse API methods throw errors with descriptive messages:

```javascript
try {
    await dataverseAPI.create('account', { name: 'Test' });
} catch (error) {
    console.error('Error:', error.message);
    // Examples:
    // "No active connection. Please connect to a Dataverse environment first."
    // "Dataverse create failed: HTTP 401: Unauthorized"
    // "Failed to refresh token: Invalid refresh token"
}
```

### Common Errors

- **No Active Connection**: User hasn't connected to a Dataverse environment
- **Token Expired**: Access token has expired and can't be refreshed
- **Invalid FetchXML**: FetchXML query is malformed
- **Record Not Found**: The specified record doesn't exist
- **Permission Denied**: User doesn't have permission for the operation
- **Network Error**: Connection to Dataverse failed

## Best Practices

### 1. Handle Errors Gracefully

```javascript
async function safeCreateRecord() {
    try {
        const result = await dataverseAPI.create('account', {...});
        return { success: true, id: result.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

### 2. Use Column Filtering

Retrieve only the columns you need to improve performance:

```javascript
// Good
const account = await dataverseAPI.retrieve('account', id, ['name', 'emailaddress1']);

// Avoid (retrieves all columns)
const account = await dataverseAPI.retrieve('account', id);
```

### 3. Batch Operations

For multiple operations, consider using batch requests:

```javascript
// For multiple creates, consider using a custom batch action
const accounts = ['Account 1', 'Account 2', 'Account 3'];
const results = await Promise.all(
    accounts.map(name => 
        dataverseAPI.create('account', { name })
    )
);
```

### 4. Optimize FetchXML Queries

```xml
<!-- Good: Specific columns, top limit, filter -->
<fetch top="50">
  <entity name="account">
    <attribute name="name" />
    <attribute name="accountid" />
    <filter>
      <condition attribute="statecode" operator="eq" value="0" />
    </filter>
  </entity>
</fetch>

<!-- Avoid: No top limit, all attributes -->
<fetch>
  <entity name="account">
    <all-attributes />
  </entity>
</fetch>
```

### 5. Cache Metadata

Entity metadata rarely changes, so cache it:

```javascript
const metadataCache = new Map();

async function getCachedMetadata(entityName) {
    if (!metadataCache.has(entityName)) {
        const metadata = await dataverseAPI.getEntityMetadata(entityName);
        metadataCache.set(entityName, metadata);
    }
    return metadataCache.get(entityName);
}
```

## Security Considerations

1. **No Direct Token Access**: Tools cannot access the raw access token
2. **Encrypted Storage**: Tokens are encrypted in local storage
3. **Automatic Expiry**: Tokens are automatically refreshed or expired
4. **Secure Communication**: All communication uses HTTPS
5. **Sandbox Isolation**: Tools run in isolated iframes with limited API access

## Performance Tips

1. **Use $select**: Always specify columns to retrieve
2. **Limit Results**: Use `top` attribute in FetchXML
3. **Avoid Deep Nesting**: Keep FetchXML queries simple
4. **Cache When Possible**: Cache metadata and static data
5. **Parallel Requests**: Use `Promise.all()` for independent operations

## Examples

See `docs/examples/dataverse-api-example.html` for interactive examples of all operations.

## Troubleshooting

### API Not Available

**Problem**: `dataverseAPI is not defined`

**Solution**: Ensure your tool is loaded as an iframe with the toolboxAPIBridge.js injected.

### Connection Errors

**Problem**: "No active connection"

**Solution**: Connect to a Dataverse environment in the main PPTB UI before using the API.

### Token Refresh Failures

**Problem**: "Failed to refresh token"

**Solution**: Reconnect to the environment. Some authentication types don't support refresh tokens.

### FetchXML Errors

**Problem**: "Invalid FetchXML: Could not determine entity name"

**Solution**: Ensure your FetchXML has a valid `<entity name="...">` element.

## Future Enhancements

Potential improvements for future versions:

- Batch request support
- Change tracking
- Alternate keys support
- Upsert operations
- Relationship operations (associate/disassociate)
- Query using OData syntax (in addition to FetchXML)
- Retry logic with exponential backoff
- Request caching and deduplication
- Real-time data synchronization

## Related Documentation

- [Dataverse Web API Reference](https://docs.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)
- [FetchXML Reference](https://docs.microsoft.com/en-us/power-apps/developer/data-platform/use-fetchxml-construct-query)
- [Tool Development Guide](./TOOL_DEVELOPMENT.md)
- [Architecture Documentation](./ARCHITECTURE.md)
