# PowerPlatform ToolBox

A modern desktop application built with Electron and TypeScript that serves as a replacement for XrmToolBox. This universal desktop app contains multiple tools to ease the customization and configuration of Power Platform.

## Features

- **🔧 Tool Management**: Install and manage external tools built by 3rd parties via npm
- **🔒 Secure Tool Host**: VS Code Extension Host-inspired architecture for isolated tool execution
- **🔗 Dataverse Connections**: Create and manage connections to Dataverse environments
- **⚙️ Settings Management**: 
  - User settings for the ToolBox application
  - Individual tool-specific settings
- **🎨 Modern Interface**: Clean, modern UI that showcases tools and their details
- **📡 Event-Driven API**: ToolBox provides its own APIs that emit events
- **🔔 Notifications**: Built-in notification system to keep users informed
- **🔄 Auto-Updates**: Automatic application updates with user control
- **📦 Contribution Points**: Tools declare capabilities (commands, menus) in package.json
- **💻 Integrated Terminal**: VSCode-like terminal with shell selection and command execution API for tools

## Architecture

The application uses a **robust Tool Host architecture** inspired by VS Code's Extension Host:

### Tool Host System (`src/main/toolHost/`)
- **Tool Host Manager**: Coordinates all tool host processes
- **Tool Host Process**: Each tool runs in an isolated Node.js process
- **Tool Host Protocol**: Secure IPC communication with message validation
- **Tool Host Runner**: Entry point for tool execution in isolated environment

### Main Process (`src/main/`)
- **index.ts**: Main Electron application entry point
- **settings-manager.ts**: Manages user and tool settings using electron-store
- **tool-manager.ts**: Handles tool installation, loading, and management via npm
- **auto-update-manager.ts**: Manages automatic application updates using electron-updater
- **preload.ts**: Secure bridge between main and renderer processes

### ToolBox API (`src/toolHost/api/`)
- **pptoolbox.ts**: API module injected into tools at runtime
- Tools import with: `const pptoolbox = require('pptoolbox');`
- Provides: commands, window, workspace, and events APIs

### API Layer (`src/api/`)
- **toolbox-api.ts**: Event-driven API system for tools and application events

### Renderer Process (`src/renderer/`)
- **index.html**: Main application UI
- **styles.css**: Modern, responsive styling
- **renderer.ts**: UI logic and interaction handlers

### Types (`src/types/`)
- Comprehensive TypeScript type definitions for all application entities
- Tool contribution points and Tool Host protocol types

## Security Model

- **Process Isolation**: Each tool runs in a separate Node.js process
- **Structured IPC**: All communication via validated message protocol
- **Limited API Surface**: Tools only access specific ToolBox APIs
- **No Direct Access**: Tools cannot access file system, Electron APIs, or other tools

## Tool Development

Tools are npm packages that follow a specific structure. See [TOOL_DEVELOPMENT.md](TOOL_DEVELOPMENT.md) for detailed guide.

### Quick Example

```javascript
// Tool entry point
const pptoolbox = require('pptoolbox');

function activate(context) {
  // Register a command
  const cmd = pptoolbox.commands.registerCommand(
    'myTool.action',
    async () => {
      await pptoolbox.window.showInformationMessage('Hello!');
    }
  );
  
  context.subscriptions.push(cmd);
}

function deactivate() {
  // Cleanup handled automatically
}

module.exports = { activate, deactivate };
```

### Contribution Points (package.json)

```json
{
  "contributes": {
    "commands": [
      {
        "command": "myTool.action",
        "title": "My Action",
        "category": "My Tool"
      }
    ]
  },
  "activationEvents": [
    "onCommand:myTool.action"
  ]
}
```

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/PowerPlatform-ToolBox/desktop-app.git
cd desktop-app
```

2. Install dependencies:
```bash
npm install
```

**Note**: The terminal feature uses `node-pty`, a native Node.js module that's now installed as an **optional dependency**. The app will work even if `node-pty` fails to build - terminal features will simply be disabled. To enable terminal functionality after installation, run:
```bash
npm run rebuild
```

If the rebuild succeeds, restart the app to use terminal features.

3. Build the application:
```bash
npm run build
```

4. Run the application:
```bash
npm start
```

### Development

For development with hot-reload:
```bash
npm run watch
```

In a separate terminal:
```bash
npm run dev
```

### Linting

Check code quality:
```bash
npm run lint
```

### Packaging

Build distributable packages:
```bash
npm run package
```

This will create installers for your platform in the `build/` directory.

## Tool Development

Tools are npm packages with specific structure and contribution points.

### Requirements

A tool must:
1. Be published as an npm package
2. Include proper metadata in `package.json`:
   - `name`: Unique package name (e.g., `@powerplatform/my-tool`)
   - `version`: Semantic version
   - `description`: Tool description
   - `displayName`: Human-readable name (optional)
   - `author`: Tool author
   - `main`: Entry point (e.g., `index.js`)
   - `contributes`: Contribution points (commands, menus, configuration)
   - `activationEvents`: When the tool should be loaded

3. Export `activate(context)` and `deactivate()` functions
4. Use the `pptoolbox` API for ToolBox integration

### Example Tool Structure

See `examples/example-tool/` for a complete example.

For detailed documentation, see [TOOL_DEVELOPMENT.md](TOOL_DEVELOPMENT.md).

### Installing Tools

Users can install tools directly from the application:
1. Click "Install Tool" button
2. Enter the npm package name (e.g., `@powerplatform/example-tool`)
3. The tool will be installed, loaded, and activated automatically

### Tool Security

- Each tool runs in an isolated Node.js process
- Tools communicate with ToolBox via secure IPC protocol
- Tools only have access to the `pptoolbox` API
- No direct access to file system, Electron, or Node.js APIs

## Dataverse Connections

Create connections to Dataverse environments:
1. Navigate to "Connections" tab
2. Click "Add Connection"
3. Provide:
   - Connection name
   - Environment URL
   - Client ID (optional)
   - Tenant ID (optional)

## Auto-Updates

The application supports automatic updates to keep your ToolBox up to date:

### Enabling Auto-Updates
1. Navigate to "Settings" tab
2. Check the "Auto Update" checkbox
3. The application will automatically check for updates every 6 hours

### Manual Update Check
1. Navigate to "Settings" tab
2. Click "Check for Updates" button
3. If an update is available, you'll be prompted to download it
4. Once downloaded, restart the application to install the update

### Update Process
- Updates are downloaded in the background
- You control when to install updates
- Updates are published via GitHub releases
- The application checks for updates on startup (if auto-update is enabled)

## Integrated Terminal

The ToolBox includes an integrated terminal similar to VS Code:

### Using the Terminal

1. **Open Terminal**: Click the Terminal button in the footer or use the keyboard shortcut
2. **Create New Terminal**: Click the "+" button in the terminal panel
3. **Select Shell**: Use the shell dropdown to choose your preferred shell (PowerShell, Bash, Zsh, etc.)
4. **Multiple Terminals**: Open multiple terminals with tabs to switch between them
5. **Resize**: Drag the resize handle to adjust terminal height

### Terminal Features

- **Shell Selection**: Choose from available shells on your system
- **Multiple Instances**: Open multiple terminal tabs
- **Resize Support**: Adjust terminal panel height
- **Integrated with Tools**: Tools can programmatically execute commands via the Terminal API

### Terminal API for Tools

Tools can interact with the terminal programmatically:

```javascript
// Create a terminal
const terminal = await pptoolbox.terminal.createTerminal({
  name: 'My Script',
  shellPath: '/bin/bash'
});

// Execute a command and get results
const result = await pptoolbox.terminal.executeCommand(
  terminal.id,
  'npm install',
  60000  // timeout in ms
);

if (result.completed) {
  console.log('Output:', result.output);
  console.log('Exit code:', result.exitCode);
}
```

See [TOOL_DEVELOPMENT.md](TOOL_DEVELOPMENT.md) for complete Terminal API documentation.

## Event System

The ToolBox emits events for various operations:

- `tool:loaded` - When a tool is loaded
- `tool:unloaded` - When a tool is unloaded
- `tool:activated` - When a tool is activated
- `tool:deactivated` - When a tool is deactivated
- `connection:created` - When a connection is created
- `connection:updated` - When a connection is updated
- `connection:deleted` - When a connection is deleted
- `settings:updated` - When settings are updated
- `notification:shown` - When a notification is shown
- `terminal:created` - When a terminal is created
- `terminal:disposed` - When a terminal is disposed
- `terminal:data` - When terminal outputs data

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Application architecture overview
- **[TOOL_HOST_ARCHITECTURE.md](TOOL_HOST_ARCHITECTURE.md)** - Detailed Tool Host architecture
- **[TOOL_DEVELOPMENT.md](TOOL_DEVELOPMENT.md)** - Complete guide for tool developers
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute to the project

## Troubleshooting

### Terminal Features Not Available

If the terminal button doesn't appear or terminal features are disabled:

1. This is expected if `node-pty` failed to build during installation
2. The app will work normally; only terminal features are disabled
3. To enable terminal features:

```bash
npm run rebuild
```

Then restart the app. If successful, the terminal button will appear in the footer.

### Terminal Module Version Error

If you encounter an error like:
```
Error: The module 'node_modules/node-pty/build/Release/pty.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION XXX. This version of Node.js requires
NODE_MODULE_VERSION YYY.
```

This happens when `node-pty` (used by the terminal feature) was compiled for a different Node.js version than the one Electron is using. To fix:

1. Run the rebuild script:
```bash
npm run rebuild
```

2. Restart the application

### Build Errors During Installation (Node.js v23+)

If `npm install` shows warnings or errors related to `node-pty`:

1. **This is normal and expected** - `node-pty` is now an optional dependency
2. **The app will still work** - Terminal features will be disabled, but everything else works
3. **To enable terminal features**, run after installation:
```bash
npm run rebuild
```

This rebuilds `node-pty` specifically for Electron's Node.js version (v20).

4. **Alternative**: Use Node.js LTS v20.x for development to avoid build issues.

### Architecture Notes

The terminal feature is designed to be **optional and non-breaking**:
- If `node-pty` fails to load, the app continues to work
- Terminal features are gracefully disabled with a clear message
- No TypeScript compilation errors occur if `node-pty` is missing
- The terminal toggle button is automatically hidden when unavailable

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
