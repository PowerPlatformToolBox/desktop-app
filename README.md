# PowerPlatform ToolBox

A modern desktop application built with Electron and TypeScript that serves as a replacement for XrmToolBox. This universal desktop app contains multiple tools to ease the customization and configuration of Power Platform.

## Features

- **🔧 Tool Management**: Install and manage external tools built by 3rd parties via npm
- **🔗 Dataverse Connections**: Create and manage connections to Dataverse environments
- **⚙️ Settings Management**: 
  - User settings for the ToolBox application
  - Individual tool-specific settings
- **🎨 Modern Interface**: Clean, modern UI that showcases tools and their details
- **📡 Event-Driven API**: ToolBox provides its own APIs that emit events
- **🔔 Notifications**: Built-in notification system to keep users informed

## Architecture

The application is structured into several key components:

### Main Process (`src/main/`)
- **index.ts**: Main Electron application entry point
- **settings-manager.ts**: Manages user and tool settings using electron-store
- **tool-manager.ts**: Handles tool installation, loading, and management via npm
- **preload.ts**: Secure bridge between main and renderer processes

### API Layer (`src/api/`)
- **toolbox-api.ts**: Event-driven API system for tools and application events

### Renderer Process (`src/renderer/`)
- **index.html**: Main application UI
- **styles.css**: Modern, responsive styling
- **renderer.ts**: UI logic and interaction handlers

### Types (`src/types/`)
- Comprehensive TypeScript type definitions for all application entities

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

Tools are external npm packages that can be integrated into the ToolBox. Each tool should:

1. Be published as an npm package
2. Include proper metadata in `package.json`:
   - `name`: Unique package name
   - `version`: Semantic version
   - `description`: Tool description
   - `displayName`: Human-readable name (optional)
   - `author`: Tool author
   - `icon`: Tool icon (optional)
   - `main`: Entry point

3. Expose compatible APIs for integration with ToolBox

### Installing Tools

Users can install tools directly from the application:
1. Click "Install Tool" button
2. Enter the npm package name (e.g., `@powerplatform/my-tool`)
3. The tool will be installed and loaded automatically

## Dataverse Connections

Create connections to Dataverse environments:
1. Navigate to "Connections" tab
2. Click "Add Connection"
3. Provide:
   - Connection name
   - Environment URL
   - Client ID (optional)
   - Tenant ID (optional)

## Event System

The ToolBox emits events for various operations:

- `tool:loaded` - When a tool is loaded
- `tool:unloaded` - When a tool is unloaded
- `connection:created` - When a connection is created
- `connection:updated` - When a connection is updated
- `connection:deleted` - When a connection is deleted
- `settings:updated` - When settings are updated
- `notification:shown` - When a notification is shown

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
