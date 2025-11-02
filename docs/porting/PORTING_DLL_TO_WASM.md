# Porting XTB DLLs to PPTB with Minimal Effort Using WebAssembly

## Overview

This guide explores the **minimal-effort approach** to porting existing XrmToolBox (XTB) .NET DLL tools to Power Platform Tool Box (PPTB) using WebAssembly (WASM) and Blazor. While [our recommendation](./ADR_PORTING_STRATEGY.md) is a full rewrite for optimal results, this document provides a practical path for developers who want to reuse existing .NET code with minimal changes.

> ⚠️ **Important**: This approach is a **trade-off**. You gain code reuse but sacrifice performance, bundle size, and integration quality. See [When to Use This Approach](#when-to-use-this-approach) for guidance.

## Table of Contents

- [Understanding the Approach](#understanding-the-approach)
- [When to Use This Approach](#when-to-use-this-approach)
- [Prerequisites](#prerequisites)
- [Step-by-Step Guide](#step-by-step-guide)
- [Architecture Overview](#architecture-overview)
- [Code Reuse Patterns](#code-reuse-patterns)
- [PPTB Integration](#pptb-integration)
- [Limitations and Trade-offs](#limitations-and-trade-offs)
- [Optimization Tips](#optimization-tips)
- [Example: Converting a Simple XTB Tool](#example-converting-a-simple-xtb-tool)
- [Troubleshooting](#troubleshooting)

## Understanding the Approach

### What is WebAssembly (WASM)?

WebAssembly is a binary instruction format that allows code written in languages like C#, C++, and Rust to run in web browsers at near-native speed. Blazor WebAssembly is Microsoft's framework that compiles .NET applications to WASM.

### How This Works for XTB Tools

1. **Extract Business Logic**: Separate your XTB tool's business logic (FetchXML generation, data processing, etc.) from UI code
2. **Create Blazor WASM Project**: Set up a Blazor WebAssembly project that references the logic
3. **Build Blazor UI**: Replace Windows Forms UI with Blazor components
4. **Add PPTB Integration**: Use JavaScript interop to access PPTB APIs
5. **Package as npm**: Bundle the WASM output as an npm package for PPTB

### What You Can Reuse

✅ **Reusable**:
- Business logic classes and methods
- Data models and DTOs
- FetchXML generation/parsing logic
- Custom algorithms
- Helper utilities (date formatting, string manipulation, etc.)
- .NET SDK types and patterns

❌ **Cannot Reuse**:
- Windows Forms UI components (all UI must be rewritten)
- Direct `IOrganizationService` calls (must use PPTB APIs via interop)
- File system operations (must use PPTB APIs)
- Threading/Task patterns that don't work in browser
- Some .NET libraries not compatible with WASM

## When to Use This Approach

### Good Use Cases ✅

1. **Complex Business Logic**: Tools with sophisticated algorithms or calculations that are difficult to rewrite
2. **Large Existing Codebase**: Tools with 10,000+ lines of business logic
3. **Specialized Libraries**: Tools using .NET libraries with no JavaScript equivalent
4. **Team Constraints**: Team with .NET expertise but limited web development skills
5. **Quick Proof-of-Concept**: Need to demonstrate feasibility quickly

### Poor Use Cases ❌

1. **Simple CRUD Tools**: Tools that just query and display data
2. **UI-Heavy Tools**: Tools where the primary value is the UI/UX
3. **Performance-Critical**: Tools that need fast load times and small bundles
4. **Minimal Business Logic**: Tools with mostly UI and basic API calls
5. **New Development**: Starting from scratch (use TypeScript instead)

## Prerequisites

### Development Environment

- **Visual Studio 2022** or **Visual Studio Code** with C# extension
- **.NET 8.0 SDK** or later
- **Node.js 18+** and **npm/pnpm**
- **Existing XTB Tool Source Code**

### Required Knowledge

- C# and .NET development
- Basic understanding of Blazor
- JavaScript interop concepts
- npm packaging basics

### Install Blazor Templates

```bash
dotnet new install Microsoft.AspNetCore.Components.WebAssembly.Templates
```

## Step-by-Step Guide

### Step 1: Analyze Your XTB Tool

Before starting, identify what can be reused:

```bash
# Create analysis document
mkdir tool-analysis
cd tool-analysis
```

Create a file `reusability-analysis.md`:

```markdown
## Business Logic (Reusable)
- [ ] FetchXML generation logic
- [ ] Data transformation methods
- [ ] Custom algorithms
- [ ] Helper utilities

## UI Components (Must Rewrite)
- [ ] Windows Forms
- [ ] Data grids
- [ ] Tree views
- [ ] Custom controls

## Dependencies
- [ ] List all NuGet packages
- [ ] Check WASM compatibility
- [ ] Identify replacements needed
```

### Step 2: Extract Business Logic

Refactor your XTB tool to separate UI from logic:

**Before (Mixed):**
```csharp
// XTB Tool - UI and logic mixed
public partial class MyToolControl : PluginControlBase
{
    private void btnGenerate_Click(object sender, EventArgs e)
    {
        // Logic directly in UI handler
        var fetchXml = $"<fetch><entity name='{cmbEntity.Text}'>...</entity></fetch>";
        var results = Service.RetrieveMultiple(new FetchExpression(fetchXml));
        gridResults.DataSource = results.Entities;
    }
}
```

**After (Separated):**
```csharp
// Business Logic Library (Reusable)
public class FetchXmlBuilder
{
    public string BuildFetchXml(string entityName, List<string> attributes)
    {
        var xml = $"<fetch><entity name='{entityName}'>";
        foreach (var attr in attributes)
        {
            xml += $"<attribute name='{attr}'/>";
        }
        xml += "</entity></fetch>";
        return xml;
    }
}

// XTB Tool UI (Will be replaced with Blazor)
public partial class MyToolControl : PluginControlBase
{
    private readonly FetchXmlBuilder _builder = new FetchXmlBuilder();
    
    private void btnGenerate_Click(object sender, EventArgs e)
    {
        var fetchXml = _builder.BuildFetchXml(cmbEntity.Text, selectedAttributes);
        // Use fetchXml...
    }
}
```

### Step 3: Create Blazor WASM Project

```bash
# Create a new Blazor WASM project
dotnet new blazorwasm -o MyToolBlazor -f net8.0

cd MyToolBlazor
```

**Project Structure:**
```
MyToolBlazor/
├── wwwroot/
│   ├── index.html
│   └── css/
├── Pages/
│   └── Index.razor
├── Shared/
│   └── MainLayout.razor
├── Program.cs
├── App.razor
└── MyToolBlazor.csproj
```

### Step 4: Add Business Logic Reference

Add your extracted business logic as a project reference or NuGet package:

```xml
<!-- MyToolBlazor.csproj -->
<Project Sdk="Microsoft.NET.Sdk.BlazorWebAssembly">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <!-- Reference your business logic -->
    <ProjectReference Include="..\MyTool.BusinessLogic\MyTool.BusinessLogic.csproj" />
    
    <!-- Or via NuGet if packaged -->
    <!-- <PackageReference Include="MyTool.BusinessLogic" Version="1.0.0" /> -->
  </ItemGroup>
</Project>
```

### Step 5: Create Blazor UI

Replace Windows Forms with Blazor components:

**Index.razor:**
```razor
@page "/"
@using MyTool.BusinessLogic
@inject IJSRuntime JS

<h3>My Tool</h3>

<div class="container">
    <div class="form-group">
        <label>Entity Name:</label>
        <input type="text" class="form-control" @bind="entityName" />
    </div>

    <div class="form-group">
        <label>Attributes:</label>
        <select multiple class="form-control" @bind="selectedAttributes">
            @foreach (var attr in availableAttributes)
            {
                <option value="@attr">@attr</option>
            }
        </select>
    </div>

    <button class="btn btn-primary" @onclick="GenerateFetchXml">Generate FetchXML</button>

    @if (!string.IsNullOrEmpty(fetchXml))
    {
        <div class="result">
            <h4>Generated FetchXML:</h4>
            <pre>@fetchXml</pre>
        </div>
    }
</div>

@code {
    private FetchXmlBuilder builder = new FetchXmlBuilder();
    private string entityName = "";
    private List<string> selectedAttributes = new List<string>();
    private List<string> availableAttributes = new List<string> { "name", "createdon", "modifiedon" };
    private string fetchXml = "";

    private void GenerateFetchXml()
    {
        // Reuse your existing business logic!
        fetchXml = builder.BuildFetchXml(entityName, selectedAttributes);
    }
}
```

### Step 6: Add PPTB API Integration via JavaScript Interop

Create a JavaScript interop service to access PPTB APIs:

**PPTBService.cs:**
```csharp
using Microsoft.JSInterop;

public class PPTBService
{
    private readonly IJSRuntime _jsRuntime;

    public PPTBService(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    // Get active connection
    public async Task<PPTBConnection?> GetActiveConnectionAsync()
    {
        return await _jsRuntime.InvokeAsync<PPTBConnection>(
            "toolboxAPI.connections.getActiveConnection"
        );
    }

    // Execute FetchXML query
    public async Task<FetchXmlResult> ExecuteFetchXmlAsync(string fetchXml)
    {
        return await _jsRuntime.InvokeAsync<FetchXmlResult>(
            "dataverseAPI.fetchXmlQuery",
            fetchXml
        );
    }

    // Show notification
    public async Task ShowNotificationAsync(string title, string body, string type = "info")
    {
        await _jsRuntime.InvokeVoidAsync(
            "toolboxAPI.utils.showNotification",
            new { title, body, type }
        );
    }
}

public class PPTBConnection
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Url { get; set; }
}

public class FetchXmlResult
{
    public List<Dictionary<string, object>> Value { get; set; }
}
```

**Register in Program.cs:**
```csharp
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using MyToolBlazor;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// Register PPTB service
builder.Services.AddScoped<PPTBService>();

await builder.Build().RunAsync();
```

### Step 7: Use PPTB APIs in Components

**Enhanced Index.razor:**
```razor
@page "/"
@using MyTool.BusinessLogic
@inject PPTBService PPTB

<h3>My Tool</h3>

@if (!isConnected)
{
    <div class="alert alert-warning">
        Please connect to a Dataverse environment first.
    </div>
}
else
{
    <div class="container">
        <!-- Your UI here -->
        
        <button class="btn btn-success" @onclick="ExecuteQuery">Execute Query</button>
        
        @if (results != null)
        {
            <div class="results">
                <h4>Results (@results.Value.Count records)</h4>
                <table class="table">
                    <thead>
                        <tr>
                            @foreach (var key in results.Value.FirstOrDefault()?.Keys ?? new List<string>())
                            {
                                <th>@key</th>
                            }
                        </tr>
                    </thead>
                    <tbody>
                        @foreach (var record in results.Value)
                        {
                            <tr>
                                @foreach (var value in record.Values)
                                {
                                    <td>@value</td>
                                }
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }
    </div>
}

@code {
    private bool isConnected = false;
    private FetchXmlResult? results;

    protected override async Task OnInitializedAsync()
    {
        var connection = await PPTB.GetActiveConnectionAsync();
        isConnected = connection != null;
    }

    private async Task ExecuteQuery()
    {
        try
        {
            var fetchXml = builder.BuildFetchXml(entityName, selectedAttributes);
            results = await PPTB.ExecuteFetchXmlAsync(fetchXml);
            await PPTB.ShowNotificationAsync("Success", $"Retrieved {results.Value.Count} records", "success");
        }
        catch (Exception ex)
        {
            await PPTB.ShowNotificationAsync("Error", ex.Message, "error");
        }
    }
}
```

### Step 8: Build and Optimize

```bash
# Build for production
dotnet publish -c Release

# Output will be in bin/Release/net8.0/publish/wwwroot/
```

**Optimize the build** in `MyToolBlazor.csproj`:

```xml
<PropertyGroup>
    <!-- Enable trimming to reduce size -->
    <PublishTrimmed>true</PublishTrimmed>
    <TrimMode>link</TrimMode>
    
    <!-- AOT compilation (optional, increases build time) -->
    <!-- <RunAOTCompilation>true</RunAOTCompilation> -->
    
    <!-- Compression -->
    <CompressionEnabled>true</CompressionEnabled>
</PropertyGroup>
```

### Step 9: Package as npm Module

Create the npm package structure:

```bash
mkdir pptb-mytool-wasm
cd pptb-mytool-wasm
npm init -y
```

**package.json:**
```json
{
  "name": "pptb-mytool-wasm",
  "version": "1.0.0",
  "displayName": "My Tool (WASM)",
  "description": "XTB tool ported using Blazor WASM",
  "main": "index.html",
  "keywords": ["powerplatform", "dataverse", "pptb", "wasm"],
  "license": "GPL-3.0",
  "files": [
    "wwwroot",
    "index.html"
  ]
}
```

**Copy Blazor output:**
```bash
# Copy published wwwroot contents
cp -r ../MyToolBlazor/bin/Release/net8.0/publish/wwwroot/* ./

# Create index.html entry point
cat > index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Tool</title>
    <base href="/" />
    <link href="css/app.css" rel="stylesheet" />
    <link href="MyToolBlazor.styles.css" rel="stylesheet" />
</head>
<body>
    <div id="app">Loading...</div>
    <script src="_framework/blazor.webassembly.js"></script>
</body>
</html>
EOF
```

### Step 10: Publish to npm

```bash
npm login
npm publish
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    PPTB ToolBox                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Webview (Isolated)                   │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │         Blazor WASM Runtime                 │  │  │
│  │  │  ┌────────────────────────────────────────┐ │  │  │
│  │  │  │     Your .NET Business Logic          │ │  │  │
│  │  │  │  - FetchXML Builder                   │ │  │  │
│  │  │  │  - Data Processing                    │ │  │  │
│  │  │  │  - Custom Algorithms                  │ │  │  │
│  │  │  └────────────────────────────────────────┘ │  │  │
│  │  │                    ↕                         │  │  │
│  │  │  ┌────────────────────────────────────────┐ │  │  │
│  │  │  │        Blazor Components (UI)         │ │  │  │
│  │  │  └────────────────────────────────────────┘ │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  │                      ↕                             │  │
│  │          JavaScript Interop Layer                 │  │
│  │                      ↕                             │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │          PPTB APIs                          │  │  │
│  │  │  - window.toolboxAPI                       │  │  │
│  │  │  - window.dataverseAPI                     │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Code Reuse Patterns

### Pattern 1: Direct Logic Reuse

```csharp
// Original XTB business logic - NO CHANGES NEEDED!
public class FetchXmlBuilder
{
    public string BuildQuery(string entity, List<string> attributes)
    {
        // Your existing logic
        return generatedXml;
    }
}

// Use directly in Blazor
@code {
    private FetchXmlBuilder builder = new FetchXmlBuilder();
    
    void Generate()
    {
        var xml = builder.BuildQuery("account", new List<string> { "name" });
    }
}
```

### Pattern 2: Adapter for IOrganizationService

```csharp
// Create an adapter that translates IOrganizationService calls to PPTB
public class PPTBOrganizationServiceAdapter : IOrganizationService
{
    private readonly PPTBService _pptb;

    public PPTBOrganizationServiceAdapter(PPTBService pptb)
    {
        _pptb = pptb;
    }

    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet)
    {
        // Translate to PPTB API
        var result = await _pptb.RetrieveAsync(entityName, id, columnSet.Columns.ToArray());
        return ConvertToEntity(result);
    }

    // Implement other methods...
}

// Use in your existing code
@code {
    private IOrganizationService service;
    
    protected override void OnInitialized()
    {
        service = new PPTBOrganizationServiceAdapter(PPTB);
        
        // Now your existing code that uses IOrganizationService works!
        var myLogic = new MyBusinessLogic(service);
        myLogic.DoSomething();
    }
}
```

### Pattern 3: Shared Models

```csharp
// Your existing DTOs - NO CHANGES NEEDED!
public class QueryDefinition
{
    public string EntityName { get; set; }
    public List<string> Attributes { get; set; }
    public List<FilterCondition> Filters { get; set; }
}

// Use in both XTB and Blazor
var query = new QueryDefinition
{
    EntityName = "account",
    Attributes = new List<string> { "name", "revenue" }
};
```

## PPTB Integration

### Accessing PPTB APIs

All PPTB APIs are available via JavaScript interop. Here's a complete wrapper:

**PPTBApiWrapper.cs:**
```csharp
public class PPTBApiWrapper
{
    private readonly IJSRuntime _js;

    public PPTBApiWrapper(IJSRuntime js) => _js = js;

    // Connection API
    public async Task<Connection?> GetActiveConnection()
        => await _js.InvokeAsync<Connection>("toolboxAPI.connections.getActiveConnection");

    // Dataverse API - CRUD
    public async Task<CreateResult> Create(string entity, object record)
        => await _js.InvokeAsync<CreateResult>("dataverseAPI.create", entity, record);

    public async Task<Dictionary<string, object>> Retrieve(string entity, string id, string[] columns)
        => await _js.InvokeAsync<Dictionary<string, object>>("dataverseAPI.retrieve", entity, id, columns);

    public async Task Update(string entity, string id, object record)
        => await _js.InvokeVoidAsync("dataverseAPI.update", entity, id, record);

    public async Task Delete(string entity, string id)
        => await _js.InvokeVoidAsync("dataverseAPI.delete", entity, id);

    // Dataverse API - Query
    public async Task<FetchXmlResult> FetchXml(string fetchXml)
        => await _js.InvokeAsync<FetchXmlResult>("dataverseAPI.fetchXmlQuery", fetchXml);

    // Dataverse API - Metadata
    public async Task<EntityMetadata> GetEntityMetadata(string entityName)
        => await _js.InvokeAsync<EntityMetadata>("dataverseAPI.getEntityMetadata", entityName);

    public async Task<EntityMetadataCollection> GetAllEntitiesMetadata()
        => await _js.InvokeAsync<EntityMetadataCollection>("dataverseAPI.getAllEntitiesMetadata");

    // Utils API
    public async Task ShowNotification(string title, string body, string type = "info")
        => await _js.InvokeVoidAsync("toolboxAPI.utils.showNotification", new { title, body, type });

    public async Task CopyToClipboard(string text)
        => await _js.InvokeVoidAsync("toolboxAPI.utils.copyToClipboard", text);

    public async Task<string> GetTheme()
        => await _js.InvokeAsync<string>("toolboxAPI.utils.getCurrentTheme");
}
```

## Limitations and Trade-offs

### Bundle Size Impact

| Component | Size | Notes |
|-----------|------|-------|
| Blazor Runtime | 1.5-2 MB | Required for any Blazor WASM app |
| .NET Libraries | 500KB-2MB | Depends on what you use |
| Your Code | 50-500KB | Your business logic |
| **Total** | **2-4.5 MB** | Before compression |
| **Compressed** | **800KB-1.5MB** | With Brotli compression |

Compare to TypeScript: 50-200KB compressed

### Performance Impact

| Metric | Blazor WASM | TypeScript | Difference |
|--------|-------------|------------|------------|
| Initial Load | 3-6 seconds | 0.2-0.4 seconds | 15-30x slower |
| Memory Usage | 50-100 MB | 5-10 MB | 10x higher |
| Startup Time | 1-2 seconds | <100ms | 10-20x slower |
| Runtime Speed | ~1ms | ~0.1ms | 10x slower |

### Browser Compatibility

- ✅ Chrome/Edge (Chromium): Full support
- ✅ Firefox: Full support
- ✅ Safari: Full support (macOS 11.1+)
- ❌ Internet Explorer: Not supported

### Development Impact

**Advantages:**
- Reuse existing C# code
- Familiar tooling (Visual Studio)
- Strong typing with C#
- Easier for .NET teams

**Disadvantages:**
- Longer build times (1-2 minutes vs 5-10 seconds)
- Larger output files
- More complex debugging
- Less IDE support in PPTB context

## Optimization Tips

### 1. Enable Trimming

```xml
<PropertyGroup>
    <PublishTrimmed>true</PublishTrimmed>
    <TrimMode>link</TrimMode>
</PropertyGroup>
```

**Result**: Reduces bundle by 30-50%

### 2. Use AOT Compilation (Optional)

```xml
<PropertyGroup>
    <RunAOTCompilation>true</RunAOTCompilation>
</PropertyGroup>
```

**Result**: Faster runtime, but 2-3x larger files and much slower builds

### 3. Lazy Load Components

```razor
@page "/heavy-feature"

<Virtualize Items="items" Context="item">
    <ItemContent>
        <div>@item.Name</div>
    </ItemContent>
</Virtualize>
```

**Result**: Faster initial load

### 4. Minimize Dependencies

Only include what you need:

```xml
<ItemGroup>
    <!-- Don't include the entire SDK -->
    <PackageReference Include="Microsoft.PowerPlatform.Dataverse.Client" Version="1.0.0" />
    
    <!-- Instead, extract just the types you need -->
    <Compile Include="..\Shared\Entity.cs" />
</ItemGroup>
```

### 5. Use Compression

Enable Brotli compression in your web server or PPTB hosting:

```bash
# Reduces size by ~70%
brotli -f wwwroot/_framework/*.dll
```

## Example: Converting a Simple XTB Tool

Let's convert a simple "Entity Viewer" XTB tool:

### Original XTB Tool

**EntityViewerControl.cs (XTB):**
```csharp
public partial class EntityViewerControl : PluginControlBase
{
    private void btnLoad_Click(object sender, EventArgs e)
    {
        var fetchXml = $@"<fetch top='10'>
            <entity name='{cmbEntity.Text}'>
                <attribute name='createdon'/>
            </entity>
        </fetch>";
        
        var results = Service.RetrieveMultiple(new FetchExpression(fetchXml));
        gridResults.DataSource = results.Entities;
    }
}
```

### Step 1: Extract Business Logic

**EntityViewerLogic.cs (Reusable):**
```csharp
public class EntityViewerLogic
{
    public string BuildSimpleQuery(string entityName, int top = 10)
    {
        return $@"<fetch top='{top}'>
            <entity name='{entityName}'>
                <attribute name='createdon'/>
            </entity>
        </fetch>";
    }
}
```

### Step 2: Create Blazor UI

**EntityViewer.razor:**
```razor
@page "/"
@using EntityViewerBlazor.Logic
@inject PPTBApiWrapper PPTB

<h3>Entity Viewer</h3>

<div class="form-group">
    <label>Entity Name:</label>
    <input @bind="entityName" class="form-control" />
</div>

<button @onclick="LoadData" class="btn btn-primary">Load</button>

@if (isLoading)
{
    <p>Loading...</p>
}
else if (results != null)
{
    <table class="table">
        <thead>
            <tr>
                <th>Created On</th>
            </tr>
        </thead>
        <tbody>
            @foreach (var record in results.Value)
            {
                <tr>
                    <td>@record["createdon"]</td>
                </tr>
            }
        </tbody>
    </table>
}

@code {
    private EntityViewerLogic logic = new EntityViewerLogic();
    private string entityName = "account";
    private bool isLoading = false;
    private FetchXmlResult? results;

    private async Task LoadData()
    {
        isLoading = true;
        try
        {
            // Use your original business logic
            var fetchXml = logic.BuildSimpleQuery(entityName);
            
            // Execute via PPTB API
            results = await PPTB.FetchXml(fetchXml);
            
            await PPTB.ShowNotification("Success", $"Loaded {results.Value.Count} records", "success");
        }
        catch (Exception ex)
        {
            await PPTB.ShowNotification("Error", ex.Message, "error");
        }
        finally
        {
            isLoading = false;
        }
    }
}
```

**Result**: Original logic reused with ~50 lines of new Blazor UI code!

## Troubleshooting

### Issue: "WASM module not found"

**Cause**: Build output not copied correctly

**Solution**:
```bash
dotnet publish -c Release
cp -r bin/Release/net8.0/publish/wwwroot/* ../npm-package/
```

### Issue: "JavaScript interop timeout"

**Cause**: PPTB APIs not available yet

**Solution**: Wait for connection before calling APIs
```csharp
protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (firstRender)
    {
        await Task.Delay(500); // Wait for PPTB initialization
        await LoadConnection();
    }
}
```

### Issue: "Type X is not serializable"

**Cause**: Complex .NET types can't be passed to JavaScript

**Solution**: Use DTOs with simple types
```csharp
// Bad
await JS.InvokeAsync("method", complexEntityObject);

// Good
await JS.InvokeAsync("method", new { 
    id = entity.Id, 
    name = entity.Name 
});
```

### Issue: "Bundle too large (>5MB)"

**Cause**: Including too many dependencies

**Solution**: 
1. Enable trimming
2. Review dependencies with `dotnet-depend`
3. Consider extracting only needed code

## Conclusion

Using Blazor WASM to port XTB tools allows you to reuse existing .NET business logic with minimal changes. However, this comes at the cost of larger bundle sizes and slower performance compared to a full TypeScript rewrite.

### Decision Matrix

| Factor | Use WASM | Use TypeScript |
|--------|----------|----------------|
| Complex business logic (>5K lines) | ✅ Yes | ❌ No |
| Simple CRUD tool | ❌ No | ✅ Yes |
| Team knows .NET only | ✅ Yes | ❌ No |
| Performance critical | ❌ No | ✅ Yes |
| Quick PoC needed | ✅ Yes | ❌ No |
| Production deployment | ❌ No | ✅ Yes |

### Recommendation

- **For most tools**: Use the [Full Rewrite approach](./PORTING_XTB_TOOLS.md) with TypeScript
- **For complex tools with substantial logic**: Consider WASM as documented here
- **For quick experiments**: WASM can help validate ideas before committing to full rewrite

Remember: WASM is a pragmatic trade-off, not the optimal solution. Use it strategically where code reuse justifies the performance and size costs.

## Resources

- [Blazor WebAssembly Documentation](https://docs.microsoft.com/en-us/aspnet/core/blazor/)
- [JavaScript Interop in Blazor](https://docs.microsoft.com/en-us/aspnet/core/blazor/javascript-interoperability/)
- [Full Rewrite Guide](./PORTING_XTB_TOOLS.md) (Recommended approach)
- [ADR: Porting Strategy](./ADR_PORTING_STRATEGY.md)
- [PPTB Tool Development](./TOOL_DEVELOPMENT.md)
