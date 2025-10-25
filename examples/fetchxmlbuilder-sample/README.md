# FetchXML Builder Sample

A sample Power Platform Tool Box tool that demonstrates how to port XrmToolBox tools to PPTB. This is a simplified version of the popular FetchXML Builder from XrmToolBox, reimplemented using modern web technologies.

## Overview

This sample tool demonstrates:

- **Visual Query Building**: Select entities, attributes, and add filters through a graphical interface
- **FetchXML Generation**: Automatically generate FetchXML from visual selections
- **Query Execution**: Execute FetchXML queries against Dataverse and view results
- **Modern Web UI**: Responsive design using HTML/CSS/TypeScript
- **PPTB API Integration**: Full use of ToolBox and Dataverse APIs

## Features

### ✨ Query Builder
- Load and select from available Dataverse entities
- Browse and select entity attributes
- Add multiple filter conditions with various operators
- Set top record count
- Clear and rebuild queries easily

### 📄 FetchXML Generation
- Automatically generates FetchXML from visual builder
- View and edit generated FetchXML
- Copy FetchXML to clipboard

### 📊 Query Execution
- Execute FetchXML queries against connected Dataverse environment
- Display results in a formatted table
- Show record count

### 🎨 Modern UI
- Clean, responsive interface
- Works on different screen sizes
- Loading indicators and status messages
- Error handling with user-friendly messages

## Comparison with XrmToolBox Version

| Feature | XrmToolBox (XTB) | This PPTB Sample |
|---------|------------------|------------------|
| **Technology** | C# + Windows Forms | TypeScript + HTML/CSS |
| **Platform** | Windows only | Cross-platform (Windows, macOS, Linux) |
| **Entity Selection** | TreeView control | HTML Select + Metadata API |
| **Attribute Selection** | CheckedListBox | Custom checkbox list |
| **Filters** | Complex Windows Forms | Dynamic HTML form elements |
| **Results Display** | DataGridView | HTML table |
| **FetchXML View** | TextBox/RichTextBox | HTML textarea |
| **Bundle Size** | DLL (~500KB+) | ~50KB (compressed) |

## Architecture

This tool uses the **Full Rewrite** approach (Strategy 2 from the porting guide):

1. **Complete reimplementation** in TypeScript/HTML
2. **PPTB APIs** instead of .NET SDK:
   - `window.toolboxAPI` for connection, notifications, clipboard
   - `window.dataverseAPI` for entity operations and metadata
3. **Modern web patterns**:
   - Async/await for all API calls
   - Event-driven UI updates
   - Functional state management

## Building the Tool

### Prerequisites
- Node.js 18 or higher
- pnpm package manager

### Install Dependencies
```bash
cd examples/fetchxmlbuilder-sample
pnpm install
```

### Build
```bash
pnpm run build
```

This will:
1. Compile TypeScript to JavaScript
2. Copy HTML and CSS to the `dist/` folder

### Development
For continuous compilation during development:
```bash
pnpm run watch
```

## Installing in PPTB

### Local Installation for Testing

1. Build the tool (see above)
2. In PPTB, go to Tools → Install Tool
3. Select the `dist` folder or package the tool as a tarball
4. The tool will appear in your tools list

### Publishing to npm

Once ready for distribution:

```bash
# Login to npm
npm login

# Publish
npm publish
```

Users can then install via PPTB's tool marketplace or by package name.

## Code Walkthrough

### Entry Point: `src/app.ts`

The main TypeScript file that:
- Initializes the tool and checks connection
- Loads entities from Dataverse
- Manages application state (selected entity, attributes, filters)
- Generates FetchXML from user selections
- Executes queries and displays results

Key functions:
- `init()`: Initialize and check connection
- `loadEntities()`: Fetch entity list from Dataverse
- `onEntitySelected()`: Load attributes when entity is selected
- `generateFetchXml()`: Build FetchXML string from state
- `executeQuery()`: Run query and display results

### UI: `src/index.html`

Clean semantic HTML structure with:
- Connection status section
- Two-column layout (query builder | results)
- Form controls for entity/attribute selection
- Filter management UI
- FetchXML display and results table

### Styles: `src/styles.css`

Modern CSS with:
- CSS custom properties (variables) for theming
- Responsive grid layout
- Fluent Design-inspired styling
- Accessible form controls
- Clean, professional appearance

## Key Porting Techniques

### 1. API Translation

**XTB (.NET SDK)**:
```csharp
var metadata = service.Execute(new RetrieveEntityRequest {
    LogicalName = "account",
    EntityFilters = EntityFilters.Attributes
});
```

**PPTB (Dataverse API)**:
```typescript
const response = await window.dataverseAPI.getEntityMetadata("account");
const metadata = response.data;
```

### 2. UI Components

**XTB (Windows Forms)**:
```csharp
var comboBox = new ComboBox();
comboBox.DataSource = entities;
comboBox.DisplayMember = "DisplayName";
```

**PPTB (HTML)**:
```html
<select id="entity-select">
  <option>-- Select --</option>
</select>
```
```typescript
entitySelect.innerHTML = entities.map(e => 
  `<option value="${e.LogicalName}">${e.DisplayName}</option>`
).join('');
```

### 3. Async Patterns

All PPTB API calls are asynchronous:
```typescript
async function loadData() {
  try {
    const response = await window.dataverseAPI.retrieveMultiple('account');
    // Handle success
  } catch (error) {
    // Handle error
  }
}
```

### 4. State Management

Simple object-based state:
```typescript
let selectedEntity: string | null = null;
let selectedAttributes: Set<string> = new Set();
let filters: FilterCondition[] = [];
```

For complex tools, consider using a state management library like Redux or Zustand.

## Limitations of This Sample

This is a **simplified demonstration** and does not include all FetchXML Builder features:

**Not Implemented**:
- Link-entity (joins)
- Aggregate functions (sum, count, avg, etc.)
- Order by
- Distinct results
- Paging
- Save/load queries
- FetchXML to OData/SQL conversion
- Advanced filter operators
- Complex filter groups (OR conditions)

**Why These Are Excluded**:
- This sample focuses on **demonstrating the porting approach**
- Adding all features would make the code too complex for a sample
- Core patterns shown here can be extended for additional features

## Extending This Sample

To add more features:

1. **Link-entity (Joins)**:
   - Add relationship browser
   - Build nested XML structure
   - Display related entity attributes

2. **Aggregates**:
   - Add aggregate function dropdown
   - Modify FetchXML generation for `<attribute aggregate="sum">`

3. **Query Persistence**:
   - Use `window.toolboxAPI.utils.saveFile()` to export queries
   - Store queries in tool-specific settings

4. **Advanced UI Framework**:
   - Migrate to React/Vue for complex state
   - Use component libraries (Fluent UI React, etc.)
   - Add drag-and-drop query building

## Learning Resources

- [PPTB Porting Guide](../../docs/PORTING_XTB_TOOLS.md) - Complete porting documentation
- [PPTB Tool Development Guide](../../docs/TOOL_DEVELOPMENT.md) - Tool creation guide
- [PPTB Sample Tools Repository](https://github.com/PowerPlatformToolBox/sample-tools) - More examples
- [Dataverse Web API Reference](https://docs.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview) - API documentation

## Contributing

This is a sample/example tool. For improvements:
1. Fork the repository
2. Make your changes
3. Submit a pull request

## License

GPL-3.0 - Same as Power Platform Tool Box

## Questions?

- Open an issue in the [PPTB GitHub repository](https://github.com/PowerPlatform-ToolBox/desktop-app)
- Check the [discussions board](https://github.com/PowerPlatform-ToolBox/desktop-app/discussions)
