# Porting XTB Tools to PPTB - Quick Start Guide

This is a quick reference for developers looking to port XrmToolBox (XTB) tools to Power Platform Tool Box (PPTB).

## 📚 Full Documentation

For complete details, see:
- **[PORTING_XTB_TOOLS.md](./PORTING_XTB_TOOLS.md)** - Comprehensive porting guide (recommended approach)
- **[PORTING_DLL_TO_WASM.md](./PORTING_DLL_TO_WASM.md)** - Minimal-effort porting using WebAssembly/Blazor to reuse .NET DLLs
- **[ADR_PORTING_STRATEGY.md](./ADR_PORTING_STRATEGY.md)** - Technical decision rationale
- **[Sample Tool: FetchXML Builder](../examples/fetchxmlbuilder-sample/)** - Working example

## 🚀 Quick Summary

### Recommended Approach: Full Rewrite in TypeScript/HTML

**Why?**
- ✅ 10-40x smaller bundle size vs. Blazor WASM
- ✅ 10-40x faster load times
- ✅ Perfect integration with PPTB's architecture
- ✅ Native web performance
- ✅ Easier to maintain and debug

### Alternative Approaches

❌ **Blazor WASM** - Too large (3-8MB), slow, poor integration
- See **[PORTING_DLL_TO_WASM.md](./PORTING_DLL_TO_WASM.md)** if you need to reuse .NET DLLs with minimal effort

❌ **Hybrid Port** - Similar effort to full rewrite, carries legacy patterns

## 📋 Porting Checklist

### 1. Analyze the Original Tool
- [ ] List all features and user workflows
- [ ] Identify Dataverse API operations used
- [ ] Note any complex algorithms or third-party dependencies
- [ ] Map out UI structure

### 2. Setup Your PPTB Tool Project
```bash
mkdir my-tool-name
cd my-tool-name
npm init -y
npm install --save-dev @pptb/types typescript shx
```

### 3. Configure package.json
```json
{
  "name": "pptb-my-tool",
  "version": "1.0.0",
  "displayName": "My Tool Name",
  "main": "index.html",
  "scripts": {
    "build": "tsc && npm run copy-files",
    "copy-files": "shx cp src/*.html dist/ && shx cp src/*.css dist/"
  }
}
```

### 4. Translate Core Logic

**Before (C# / XTB)**:
```csharp
var entity = service.Retrieve("account", accountId, new ColumnSet("name"));
var name = entity.GetAttributeValue<string>("name");
```

**After (TypeScript / PPTB)**:
```typescript
const account = await window.dataverseAPI.retrieve("account", accountId, ["name"]);
const name = account.name;
```

### 5. Build Modern UI

Use HTML/CSS with optional frameworks:
- Plain HTML/CSS - Fastest, smallest
- React - Best for complex state
- Vue - Good balance
- Svelte - Smallest bundles

### 6. Test and Publish
```bash
npm run build
# Install locally in PPTB for testing
npm publish  # When ready
```

## 🔄 Common API Translations

### Retrieve Record
```typescript
// XTB (C#)
var entity = service.Retrieve("account", id, new ColumnSet("name", "revenue"));

// PPTB (TypeScript)
const account = await window.dataverseAPI.retrieve("account", id, ["name", "revenue"]);
```

### Create Record
```typescript
// XTB (C#)
var entity = new Entity("account");
entity["name"] = "Contoso";
var id = service.Create(entity);

// PPTB (TypeScript)
const result = await window.dataverseAPI.create("account", { name: "Contoso" });
const id = result.id;
```

### FetchXML Query
```typescript
// XTB (C#)
var result = service.RetrieveMultiple(new FetchExpression(fetchXml));

// PPTB (TypeScript)
const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);
const records = result.value;
```

### Get Entity Metadata
```typescript
// XTB (C#)
var request = new RetrieveEntityRequest { LogicalName = "account" };
var response = (RetrieveEntityResponse)service.Execute(request);
var metadata = response.EntityMetadata;

// PPTB (TypeScript)
const metadata = await window.dataverseAPI.getEntityMetadata("account");
```

## 🎨 UI Component Mapping

| XTB (Windows Forms) | PPTB (Web) |
|---------------------|------------|
| DataGridView | HTML `<table>` or ag-Grid |
| TreeView | HTML `<ul>`/`<li>` with CSS |
| ComboBox | HTML `<select>` |
| TextBox | HTML `<input>` or `<textarea>` |
| Button | HTML `<button>` |
| TabControl | HTML `<div>` with tabs or framework tabs |

## 💡 Best Practices

1. **Always escape user input** before inserting into HTML
   ```typescript
   function escapeHtml(text: string): string {
     const div = document.createElement('div');
     div.textContent = text;
     return div.innerHTML;
   }
   ```

2. **Use async/await** for all API calls
   ```typescript
   async function loadData() {
     try {
       const data = await window.dataverseAPI.retrieve(...);
       // Handle success
     } catch (error) {
       // Handle error
     }
   }
   ```

3. **Check for active connection** before using Dataverse API
   ```typescript
   const connection = await window.toolboxAPI.connections.getActiveConnection();
   if (!connection) {
     await window.toolboxAPI.utils.showNotification({
       title: 'No Connection',
       body: 'Please connect to a Dataverse environment first',
       type: 'warning'
     });
     return;
   }
   ```

4. **Provide user feedback** for long operations
   ```typescript
   button.textContent = 'Loading...';
   button.disabled = true;
   try {
     await longOperation();
   } finally {
     button.textContent = 'Load Data';
     button.disabled = false;
   }
   ```

5. **Use TypeScript strict mode** for type safety
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "types": ["@pptb/types"]
     }
   }
   ```

## 📊 Performance Benchmarks

| Metric | Blazor WASM | TypeScript/HTML | Winner |
|--------|-------------|-----------------|--------|
| Bundle Size | 3-8 MB | 50-200 KB | TS (15-40x smaller) |
| Load Time | 3-6 sec | 0.2-0.4 sec | TS (15-30x faster) |
| Runtime Speed | ~2ms | ~0.1ms | TS (20x faster) |

## 🔗 Resources

- [PPTB Tool Development Guide](./TOOL_DEVELOPMENT.md)
- [PPTB Architecture](./ARCHITECTURE.md)
- [Sample Tools Repository](https://github.com/PowerPlatformToolBox/sample-tools)
- [FetchXML Builder Sample](../examples/fetchxmlbuilder-sample/)
- [Dataverse Web API Docs](https://docs.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)

## 🆘 Getting Help

- **GitHub Issues**: [Report bugs or ask questions](https://github.com/PowerPlatformToolBox/desktop-app/issues)
- **Discussions**: [Join the community](https://github.com/PowerPlatformToolBox/desktop-app/discussions)
- **Sample Code**: Check out [working examples](../examples/)

## 🎯 Example: Minimal Tool

```typescript
/// <reference types="@pptb/types" />

async function init() {
  // Check connection
  const connection = await window.toolboxAPI.connections.getActiveConnection();
  if (!connection) {
    await window.toolboxAPI.utils.showNotification({
      title: 'No Connection',
      body: 'Please connect first',
      type: 'warning'
    });
    return;
  }

  // Query data
  const fetchXml = `
    <fetch top="10">
      <entity name="account">
        <attribute name="name" />
      </entity>
    </fetch>
  `;
  
  const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);
  console.log(`Found ${result.value.length} accounts`);
  
  // Display results
  const list = document.getElementById('results');
  result.value.forEach(account => {
    const li = document.createElement('li');
    li.textContent = account.name as string;
    list.appendChild(li);
  });
}

init();
```

## 📝 Key Takeaways

1. **Full rewrite is recommended** - Better results than trying to port .NET code
2. **Use modern web technologies** - HTML/CSS/TypeScript, with optional frameworks
3. **Leverage PPTB APIs** - Clean, structured access to Dataverse and ToolBox features
4. **Start with the sample** - FetchXML Builder shows all the patterns you need
5. **Follow security best practices** - Always escape user input, validate data
6. **Test thoroughly** - Build, install locally, test all features before publishing

---

**Ready to start porting?** Begin with the [FetchXML Builder sample](../examples/fetchxmlbuilder-sample/) and follow the [comprehensive guide](./PORTING_XTB_TOOLS.md)!
