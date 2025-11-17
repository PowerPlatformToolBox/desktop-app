# Getting Started with ToolBox development

-   [Getting Started with ToolBox development](#getting-started-with-toolbox-development)
    -   [Prerequisites](#prerequisites)
    -   [Development Setup](#development-setup)
    -   [Linting](#linting)
    -   [Packaging](#packaging)
    -   [Troubleshooting](#troubleshooting)
        -   [Electron won't start](#electron-wont-start)

## Prerequisites

-   Node.js 18 or higher
-   pnpm 10 or higher (recommended package manager)

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/PowerPlatformToolBox/desktop-app.git
cd desktop-app
```

2. Install pnpm (if not already installed):

```bash
npm install -g pnpm
```

3. Install dependencies:

```bash
pnpm install
```

4. Build the application:

```bash
pnpm run build
```

5. Run the application:

    - Start

    ```bash
    pnpm start
    ```

    - For development with Vite's built-in hot module replacement (HMR):

    ```bash
    pnpm run dev
    ```

    This starts the Vite dev server with Electron, providing fast refresh for renderer process changes.

    - For watch mode (continuous compilation):

    ```bash
    pnpm run watch
    ```

    - Run and Debug in VS Code

    Under "Run and Debug" activity bar menu option you'll find **Debug Main Process** as an option which you can use to debug the application with breakpoints in the main process. This will not break the code for any debug pointers in the renderer; for that you will have to run **Renderer (Chromium) Attach** process.

## Linting

Check code quality:

```bash
pnpm run lint
```

## Packaging

Build distributable packages:

```bash
pnpm run package
```

This will create installers for your platform in the `build/` directory.

## Troubleshooting

### Electron won't start

Getting the following error `throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');`

Manually trigger Electron's install script

```bash
node node_modules/electron/install.js
```
