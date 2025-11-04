# Local Tool Testing Guide

This guide explains how to test Power Platform Tool Box tools locally during development without publishing to npm.

## Overview

The local tool testing feature allows you to:

- Load tools directly from your file system
- Test changes immediately without publishing
- Use watch mode for continuous development
- Iterate quickly on tool development

## Prerequisites

- Power Platform Tool Box installed
- A tool project with a valid `package.json`
- The tool must be built (have a `dist/index.html` file)

## Step-by-Step Guide

### 1. Set Up Your Tool Project

Create or navigate to your tool directory:

```bash
# Create a new tool (optional)
npx --package yo --package generator-pptb -- yo pptb my-tool
cd my-tool

# Install dependencies
npm install

# Build the tool
npm run build
```

Your directory should look like:

```
my-tool/
├── package.json          # Required
├── dist/                 # Required - created by build
│   ├── index.html       # Required - entry point
│   ├── app.js
│   └── styles.css
├── src/
│   ├── app.ts
│   └── styles.css
└── tsconfig.json
```

### 2. Start Watch Mode (Optional but Recommended)

For continuous development, start your build tool in watch mode:

```bash
# If using Vite
npm run build -- --watch

# If using webpack or custom scripts
npm run watch

# Or check your package.json for the watch command
```

This will automatically rebuild your tool whenever you save changes.

### 3. Load the Tool in ToolBox

1. **Open Power Platform Tool Box**

2. **Navigate to Debug Section**
   - Click the Debug icon in the activity bar (left sidebar)
   - It's the fourth icon from the top

3. **Load Your Local Tool**
   - In the "Load Local Tool" section
   - Click the **Browse** button
   - Navigate to your tool's root directory (the one with `package.json`)
   - Select the directory
   - Click **Load Tool**

4. **Tool Loaded Successfully**
   - You'll see a success notification
   - The tool will appear in the Installed Tools list with a `local:` prefix
   - Example: `local:@powerplatform/my-tool`

### 4. Launch and Test Your Tool

1. Click on your tool in the Installed Tools sidebar
2. The tool will open in the main content area
3. Test your tool's functionality
4. Check the developer console for logs:
   - View > Toggle Developer Tools
   - Console tab will show your tool's `console.log` output

### 5. Make Changes and Reload

When you make changes to your tool:

1. **Save your source files** - the watch mode will rebuild automatically
2. **Close the tool tab** in ToolBox (click the X on the tab)
3. **Reopen the tool** from the sidebar
4. Your changes will be reflected

> **Note**: Currently, hot module replacement is not supported. You need to close and reopen the tool to see changes.

## Troubleshooting

### Error: "No dist/index.html found"

**Problem**: Your tool hasn't been built yet.

**Solution**: Run `npm run build` in your tool directory.

### Error: "No package.json found"

**Problem**: The selected directory doesn't contain a `package.json` file.

**Solution**: Make sure you select the root directory of your tool (the one containing `package.json`).

### Tool Won't Load After Changes

**Problem**: The tool iframe is cached.

**Solution**: 
1. Close the tool tab completely
2. Reload it from the sidebar
3. If still not working, restart ToolBox

### Watch Mode Not Working

**Problem**: Changes aren't being reflected in the `dist/` directory.

**Solution**: 
1. Check that watch mode is running (you should see it in the terminal)
2. Check your build tool's configuration
3. Try running `npm run build` manually to verify the build works

## Workflow Examples

### React Tool Development

```bash
# Terminal 1 - Watch mode
cd my-react-tool
npm run build -- --watch

# The tool is now continuously building
# Any changes to src/ will update dist/
```

In ToolBox:
1. Load the tool once using the Debug section
2. Make changes to your React components
3. Close and reopen the tool to see changes

### TypeScript Tool Development

```bash
# Terminal 1 - TypeScript watch
cd my-ts-tool
tsc --watch

# Terminal 2 (optional) - Asset copying
npm run copy-assets -- --watch
```

In ToolBox:
1. Load the tool using the Debug section
2. Edit TypeScript files
3. Close and reopen to see changes

## Best Practices

1. **Always use watch mode** during active development
2. **Check the console** for errors and logs
3. **Test with different connections** to ensure compatibility
4. **Keep tools small** for faster reload times
5. **Use the developer console** to debug issues
6. **Remove local tools** before publishing (they won't auto-update)

## Comparing to npm Installation

| Feature | Local Tool | npm Package |
|---------|-----------|-------------|
| Publishing Required | ❌ No | ✅ Yes |
| Installation Speed | ⚡ Instant | 🐌 Depends on network |
| Changes Reflect | 🔄 On reload | ⬇️ Requires reinstall |
| Auto-updates | ❌ No | ✅ Yes (from registry) |
| Sharing with Others | ❌ No | ✅ Yes |
| Production Ready | ❌ No | ✅ Yes |

## When to Use Each Method

### Use Local Loading When:
- 🛠️ Actively developing a tool
- 🧪 Testing new features
- 🐛 Debugging issues
- 📚 Learning tool development

### Use npm Installation When:
- 📦 Testing published packages
- 🚀 Using production tools
- 👥 Sharing with team members
- ⚙️ Need auto-updates

### Use Registry Installation When:
- ✅ Tool is production-ready
- 📊 Want official marketplace distribution
- 🔒 Need verified, trusted tools

## Next Steps

Once you've tested your tool locally and it's working well:

1. **Build for production**: `npm run build`
2. **Update version**: Update `version` in `package.json`
3. **Publish to npm**: `npm publish --access public`
4. **Test from npm**: Use Debug > Install Tool by Package Name
5. **Submit to registry**: Follow the [Tool Intake Process](TOOL_INTAKE_PROCESS.md)

## Additional Resources

- [Tool Development Guide](TOOL_DEV.md) - Complete API documentation
- [Sample Tools Repository](https://github.com/PowerPlatformToolBox/sample-tools) - Working examples
- [Tool Intake Process](TOOL_INTAKE_PROCESS.md) - How to submit to the registry
- [Architecture Documentation](ARCHITECTURE.md) - How ToolBox works

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review the [Tool Development Guide](TOOL_DEV.md)
3. Open an issue on [GitHub](https://github.com/PowerPlatformToolBox/desktop-app/issues)
4. Ask in [Discussions](https://github.com/PowerPlatformToolBox/desktop-app/discussions)
