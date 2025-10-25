# Porting XrmToolBox (XTB) Tools to Power Platform Tool Box (PPTB)

## Overview

This guide provides comprehensive information on porting existing XrmToolBox (XTB) tools to Power Platform Tool Box (PPTB). While the two platforms share the same goal of providing tools for Power Platform/Dynamics 365 development, they have fundamentally different architectures that require careful consideration when porting tools.

## Table of Contents

- [Understanding the Platforms](#understanding-the-platforms)
- [Architectural Differences](#architectural-differences)
- [Porting Strategies](#porting-strategies)
- [Recommended Approach](#recommended-approach)
- [Step-by-Step Porting Guide](#step-by-step-porting-guide)
- [Code Translation Patterns](#code-translation-patterns)
- [Common Challenges and Solutions](#common-challenges-and-solutions)
- [Best Practices](#best-practices)
- [Example: FetchXmlBuilder](#example-fetchxmlbuilder)

## Understanding the Platforms

### XrmToolBox (XTB)
- **Platform**: Windows desktop application built with .NET Framework/Windows Forms
- **Architecture**: Plugin-based with DLL extensions
- **Process Model**: Tools run in-process with the host application
- **UI Framework**: Windows Forms controls (TreeView, DataGridView, etc.)
- **API Access**: Direct access to `IOrganizationService` and .NET SDK libraries
- **Distribution**: DLL files distributed via plugin store

### Power Platform Tool Box (PPTB)
- **Platform**: Cross-platform Electron desktop application built with TypeScript/HTML
- **Architecture**: Web-based tool hosting with isolated webviews
- **Process Model**: Tools run in separate sandboxed webview iframes
- **UI Framework**: Modern web technologies (HTML/CSS/JavaScript, React, Vue, etc.)
- **API Access**: Structured APIs via `window.toolboxAPI` and `window.dataverseAPI`
- **Distribution**: npm packages

## Architectural Differences

| Aspect | XrmToolBox (XTB) | Power Platform Tool Box (PPTB) |
|--------|------------------|--------------------------------|
| **Language** | C#/.NET | TypeScript/JavaScript |
| **UI Technology** | Windows Forms | HTML/CSS/JavaScript |
| **Tool Format** | DLL assembly | npm package (HTML/JS/CSS) |
| **Process Isolation** | In-process | Isolated webview |
| **API Model** | Direct .NET SDK access | Structured HTTP-based API |
| **Cross-Platform** | Windows only | Windows, macOS, Linux |
| **Package Manager** | Custom plugin store | npm with pnpm |
| **Security Model** | Full system access | Sandboxed with limited APIs |

## Porting Strategies

### Strategy 1: Web Assembly (WASM) with Blazor

**Approach**: Use Blazor WebAssembly to run existing .NET code in the browser.

**Pros**:
- Preserve some existing C# business logic
- Familiar development model for .NET developers
- Can reuse some non-UI code

**Cons**:
- Large bundle size (Blazor runtime + .NET libraries = 2-5 MB minimum)
- Performance overhead from .NET to JavaScript interop
- Limited access to browser APIs
- Complex debugging experience
- Still requires complete UI rewrite
- PPTB's webview architecture not optimized for WASM
- Poor integration with PPTB's JavaScript-based APIs

**Verdict**: ❌ **NOT RECOMMENDED** for PPTB tools due to architectural mismatch and poor performance.

### Strategy 2: Full Rewrite in TypeScript/HTML

**Approach**: Completely rewrite the tool using modern web technologies (TypeScript, HTML, CSS, and optional frameworks like React/Vue).

**Pros**:
- Native web technologies perfectly aligned with PPTB architecture
- Optimal performance and small bundle size
- Excellent integration with PPTB APIs
- Cross-platform by design
- Modern UI/UX capabilities
- Easier debugging and maintenance
- Access to rich npm ecosystem
- Better long-term maintainability

**Cons**:
- Requires significant upfront development effort
- Complete reimplementation of business logic
- Need to learn web development if coming from .NET background

**Verdict**: ✅ **STRONGLY RECOMMENDED** for PPTB tools - best alignment with platform architecture.

### Strategy 3: Hybrid Approach

**Approach**: Port core business logic manually while building new web UI.

**Pros**:
- Can systematically translate proven algorithms
- Opportunity to improve and modernize logic
- Focused translation of critical code

**Cons**:
- Still requires manual translation of all logic
- Risk of introducing bugs during translation
- Not significantly faster than full rewrite
- May carry over legacy patterns

**Verdict**: ⚠️ **OPTIONAL** - useful as a transition strategy but similar effort to full rewrite.

## Recommended Approach

### ✅ Full Rewrite in TypeScript/HTML is the Best Choice

**Rationale**:

1. **Architectural Alignment**: PPTB's webview-based architecture is designed for web technologies, not WASM or .NET
2. **Performance**: Native JavaScript is faster than WASM for UI-heavy applications
3. **Bundle Size**: Modern web apps are 10-50x smaller than Blazor WASM apps
4. **Integration**: Direct, idiomatic use of PPTB APIs (`window.toolboxAPI`, `window.dataverseAPI`)
5. **Ecosystem**: Access to thousands of npm packages for common tasks
6. **UX**: Modern web UI frameworks provide superior user experiences compared to Windows Forms
7. **Maintenance**: JavaScript/TypeScript is widely known, easier to find contributors

**Why This Works for Dataverse/Power Platform Tools**:
- Most XTB tool logic is not complex low-level code requiring .NET
- Tools primarily perform CRUD operations, metadata queries, and UI rendering
- FetchXML, Entity definitions, and Dataverse concepts translate easily
- Modern JavaScript can handle XML parsing, JSON, HTTP requests, etc. efficiently

## Step-by-Step Porting Guide

### Phase 1: Analysis and Planning

1. **Understand the Original Tool**
   - Identify core features and user workflows
   - Document the tool's purpose and key capabilities
   - List all Dataverse API operations used
   - Map out the UI structure and navigation

2. **Assess Complexity**
   - Identify third-party dependencies
   - Catalog custom algorithms or complex business logic
   - Determine if any functionality is Windows-specific

3. **Define PPTB Tool Scope**
   - Decide which features to port initially (MVP)
   - Plan for future enhancements
   - Identify features that can be improved or modernized

### Phase 2: Setup

1. **Create Tool Structure**
   ```bash
   mkdir my-tool-name
   cd my-tool-name
   npm init -y
   npm install --save-dev @pptb/types typescript
   ```

2. **Configure package.json**
   ```json
   {
     "name": "pptb-my-tool-name",
     "version": "1.0.0",
     "displayName": "My Tool Name",
     "description": "Description of your tool",
     "main": "index.html",
     "keywords": ["powerplatform", "dataverse", "pptb"],
     "license": "GPL-3.0",
     "engines": {
       "node": ">=18.0.0"
     }
   }
   ```

3. **Setup TypeScript**
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ES2022",
       "lib": ["ES2022", "DOM"],
       "outDir": "./dist",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "types": ["@pptb/types"]
     },
     "include": ["src/**/*"]
   }
   ```

### Phase 3: Core Logic Translation

1. **Translate Business Logic from C# to TypeScript**

   **C# Pattern**:
   ```csharp
   // XTB - C# code
   var entity = service.Retrieve("account", accountId, new ColumnSet("name", "revenue"));
   var name = entity.GetAttributeValue<string>("name");
   ```

   **TypeScript Pattern**:
   ```typescript
   // PPTB - TypeScript code
   const response = await window.dataverseAPI.retrieve(
     "account",
     accountId,
     ["name", "revenue"]
   );
   const name = response.data.name;
   ```

2. **Replace IOrganizationService Calls with Dataverse API**

   See [Code Translation Patterns](#code-translation-patterns) section for detailed mappings.

3. **Implement Helper Functions**
   ```typescript
   // Example: FetchXML builder helper
   class FetchXmlBuilder {
     private xml: string = '';
     
     entity(name: string): this {
       this.xml = `<fetch><entity name="${name}">`;
       return this;
     }
     
     attribute(name: string): this {
       this.xml += `<attribute name="${name}"/>`;
       return this;
     }
     
     build(): string {
       return this.xml + '</entity></fetch>';
     }
   }
   ```

### Phase 4: UI Development

1. **Choose UI Approach**
   - **Plain HTML/CSS/TypeScript**: Good for simple tools, fastest loading
   - **React**: Best for complex state management and reusable components
   - **Vue**: Great balance of simplicity and power
   - **Svelte**: Smallest bundle size, excellent performance

2. **Design the Layout**
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <title>My Tool</title>
     <link rel="stylesheet" href="styles.css">
   </head>
   <body>
     <div id="app">
       <header>
         <h1>My Tool</h1>
       </header>
       <main id="content">
         <!-- Tool content here -->
       </main>
     </div>
     <script type="module" src="app.js"></script>
   </body>
   </html>
   ```

3. **Implement Interactivity**
   ```typescript
   // app.ts
   /// <reference types="@pptb/types" />
   
   async function init() {
     // Get connection context
     const context = await window.toolboxAPI.connections.get();
     
     if (!context) {
       await window.toolboxAPI.utils.showNotification({
         title: 'No Connection',
         body: 'Please connect to a Dataverse environment first',
         type: 'warning'
       });
       return;
     }
     
     // Initialize your tool
     loadData();
   }
   
   // Initialize on load
   init();
   ```

### Phase 5: Testing and Refinement

1. **Local Testing**
   - Build your tool: `npm run build`
   - Install locally in PPTB
   - Test all features thoroughly

2. **Handle Errors**
   ```typescript
   try {
     const result = await window.dataverseAPI.retrieve('account', id);
     // Handle success
   } catch (error) {
     await window.toolboxAPI.utils.showNotification({
       title: 'Error',
       body: `Failed to retrieve record: ${error.message}`,
       type: 'error'
     });
   }
   ```

3. **Optimize Performance**
   - Use pagination for large datasets
   - Implement loading states
   - Cache metadata when appropriate
   - Minimize API calls

### Phase 6: Publishing

1. **Prepare for Publication**
   - Add comprehensive README.md
   - Include screenshots and documentation
   - Test on all platforms if possible
   - Add LICENSE file

2. **Publish to npm**
   ```bash
   npm login
   npm publish
   ```

3. **Update Tool Metadata**
   - Add keywords for discoverability
   - Provide clear description
   - Link to documentation

## Code Translation Patterns

### Entity Operations

#### Retrieve Record

**XTB (C#)**:
```csharp
var entity = service.Retrieve("account", accountId, new ColumnSet("name", "revenue"));
var name = entity.GetAttributeValue<string>("name");
```

**PPTB (TypeScript)**:
```typescript
const response = await window.dataverseAPI.retrieve("account", accountId, ["name", "revenue"]);
const name = response.data.name;
```

#### Create Record

**XTB (C#)**:
```csharp
var entity = new Entity("account");
entity["name"] = "Contoso";
var id = service.Create(entity);
```

**PPTB (TypeScript)**:
```typescript
const response = await window.dataverseAPI.create("account", {
  name: "Contoso"
});
const id = response.id;
```

#### Update Record

**XTB (C#)**:
```csharp
var entity = new Entity("account", accountId);
entity["revenue"] = 100000;
service.Update(entity);
```

**PPTB (TypeScript)**:
```typescript
await window.dataverseAPI.update("account", accountId, {
  revenue: 100000
});
```

#### Delete Record

**XTB (C#)**:
```csharp
service.Delete("account", accountId);
```

**PPTB (TypeScript)**:
```typescript
await window.dataverseAPI.delete("account", accountId);
```

### Query Operations

#### FetchXML Query

**XTB (C#)**:
```csharp
var fetchXml = @"<fetch top='10'>
  <entity name='account'>
    <attribute name='name'/>
    <filter>
      <condition attribute='revenue' operator='gt' value='100000'/>
    </filter>
  </entity>
</fetch>";
var result = service.RetrieveMultiple(new FetchExpression(fetchXml));
```

**PPTB (TypeScript)**:
```typescript
const fetchXml = `<fetch top='10'>
  <entity name='account'>
    <attribute name='name'/>
    <filter>
      <condition attribute='revenue' operator='gt' value='100000'/>
    </filter>
  </entity>
</fetch>`;
const response = await window.dataverseAPI.fetchXml(fetchXml);
const accounts = response.data;
```

### Metadata Operations

#### Get Entity Metadata

**XTB (C#)**:
```csharp
var request = new RetrieveEntityRequest
{
    LogicalName = "account",
    EntityFilters = EntityFilters.Attributes
};
var response = (RetrieveEntityResponse)service.Execute(request);
var metadata = response.EntityMetadata;
```

**PPTB (TypeScript)**:
```typescript
const response = await window.dataverseAPI.getEntityMetadata("account");
const metadata = response.data;
const attributes = metadata.Attributes;
```

### UI Component Mapping

#### Data Grid

**XTB (Windows Forms)**:
```csharp
var dataGrid = new DataGridView();
dataGrid.DataSource = entityCollection.Entities;
dataGrid.Columns.Add("name", "Account Name");
```

**PPTB (HTML/JavaScript)**:
```html
<table id="data-grid">
  <thead>
    <tr><th>Account Name</th></tr>
  </thead>
  <tbody id="data-body"></tbody>
</table>
```

```typescript
const tbody = document.getElementById('data-body');
accounts.forEach(account => {
  const row = tbody.insertRow();
  row.insertCell(0).textContent = account.name;
});
```

Or use a modern grid library like ag-Grid or TanStack Table for advanced features.

#### Tree View

**XTB (Windows Forms)**:
```csharp
var treeView = new TreeView();
var rootNode = treeView.Nodes.Add("Entities");
rootNode.Nodes.Add("account");
```

**PPTB (HTML/JavaScript)**:
```html
<ul class="tree">
  <li>
    <span>Entities</span>
    <ul>
      <li>account</li>
    </ul>
  </li>
</ul>
```

With CSS for styling and JavaScript for expand/collapse behavior.

## Common Challenges and Solutions

### Challenge 1: Async/Await Pattern

**Issue**: .NET SDK uses synchronous calls, PPTB uses async JavaScript.

**Solution**: Embrace async/await pattern throughout your code:
```typescript
async function loadData() {
  try {
    const response = await window.dataverseAPI.retrieveMultiple('account');
    displayResults(response.data);
  } catch (error) {
    handleError(error);
  }
}
```

### Challenge 2: Type Safety

**Issue**: TypeScript requires type definitions, C# has built-in types.

**Solution**: Use `@pptb/types` package and define your own types:
```typescript
interface Account {
  accountid: string;
  name: string;
  revenue: number;
}

const account: Account = response.data;
```

### Challenge 3: XML Parsing

**Issue**: .NET has XmlDocument, JavaScript needs alternative.

**Solution**: Use DOMParser for XML:
```typescript
function parseFetchXml(xml: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(xml, 'text/xml');
}

function buildFetchXml(doc: Document): string {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}
```

### Challenge 4: State Management

**Issue**: Windows Forms has built-in state management, web apps need structure.

**Solution**: Use a state management pattern or library:
```typescript
class AppState {
  private _selectedEntity: string | null = null;
  private _listeners: Set<() => void> = new Set();
  
  get selectedEntity() { return this._selectedEntity; }
  
  setSelectedEntity(entity: string) {
    this._selectedEntity = entity;
    this.notify();
  }
  
  subscribe(listener: () => void) {
    this._listeners.add(listener);
  }
  
  private notify() {
    this._listeners.forEach(listener => listener());
  }
}

const state = new AppState();
```

### Challenge 5: Packaging and Dependencies

**Issue**: XTB uses NuGet packages, PPTB uses npm.

**Solution**: Find npm equivalents:
- XML parsing: Built-in DOMParser or `fast-xml-parser`
- HTTP requests: Built-in fetch API
- UI components: React, Vue, or Fluent UI Web Components
- Data grids: ag-Grid, TanStack Table, or Handsontable

## Best Practices

### 1. Follow PPTB Tool Patterns

- Use the sample tools as templates
- Structure your code consistently (src/, dist/)
- Follow the npm package conventions

### 2. Optimize Bundle Size

- Use tree-shaking (ES modules)
- Minimize dependencies
- Consider code splitting for large tools
- Use production builds

### 3. Handle Errors Gracefully

- Always wrap API calls in try-catch
- Provide user-friendly error messages
- Use PPTB's notification system
- Log errors for debugging

### 4. Design for Responsiveness

- Use responsive CSS (flexbox, grid)
- Test on different screen sizes
- Consider mobile layouts if applicable
- Use loading indicators

### 5. Leverage Modern Web Features

- Use CSS variables for theming
- Implement dark mode support
- Use web workers for heavy computation
- Add keyboard shortcuts

### 6. Maintain Code Quality

- Use TypeScript strict mode
- Write clean, documented code
- Follow consistent code style
- Add comments for complex logic

## Example: FetchXmlBuilder

See the complete example implementation in the `examples/fetchxmlbuilder-sample/` directory (if available), which demonstrates:

- FetchXML parsing and generation
- Entity/attribute metadata browsing
- Visual query builder interface
- Query execution and result display
- Export functionality
- Modern, responsive UI

Key features of the PPTB version:
- **Web-First Design**: Responsive layout that works on all screen sizes
- **Modern UI**: Uses Fluent UI components for consistent look and feel
- **Performance**: Fast loading and execution with minimal bundle size
- **Type Safety**: Full TypeScript support with compile-time checks
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Conclusion

While porting XTB tools to PPTB requires significant effort, the result is a modern, cross-platform tool that takes full advantage of web technologies. The full rewrite approach, though initially more work, provides:

- Better performance and user experience
- Easier maintenance and updates
- Cross-platform compatibility
- Modern development workflow
- Better integration with PPTB's architecture

By following this guide and leveraging PPTB's APIs and samples, you can successfully port any XTB tool to PPTB and potentially improve upon the original implementation.

## Resources

- [PPTB Tool Development Guide](./TOOL_DEVELOPMENT.md)
- [PPTB Architecture Documentation](./ARCHITECTURE.md)
- [PPTB Sample Tools Repository](https://github.com/PowerPlatformToolBox/sample-tools)
- [Dataverse API Reference](./DATAVERSE_API.md)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [MDN Web Docs](https://developer.mozilla.org/)
