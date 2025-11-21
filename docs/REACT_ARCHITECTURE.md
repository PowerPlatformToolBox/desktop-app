# React Architecture Documentation

## Overview

The Power Platform Tool Box renderer has been converted from vanilla TypeScript to React with Fluent UI components. This document describes the new architecture, component structure, and development patterns.

## Technology Stack

- **React 19.2.0**: Modern React with functional components and hooks
- **Fluent UI 9**: Microsoft's design system (@fluentui/react-components@9.72.7)
- **TypeScript**: Strict mode enabled with JSX support
- **Context API**: State management without external dependencies
- **Vite**: Build tool with React plugin
- **SCSS**: Styling with Sass preprocessor

## Project Structure

```
src/renderer/
├── App.tsx                      # Root application component
├── App.scss                     # Global styles
├── index.tsx                    # React entry point
├── index.html                   # HTML template
├── components/
│   ├── layout/                  # Layout components
│   │   ├── ActivityBar.tsx      # Left navigation bar
│   │   ├── Sidebar.tsx          # Context-sensitive sidebar
│   │   ├── MainContent.tsx      # Main content area
│   │   ├── HomeView.tsx         # Welcome/home view
│   │   └── AppFooter.tsx        # Status footer
│   └── features/                # Feature-specific components
│       ├── tools/               # Tool management
│       │   ├── ToolsSidebar.tsx
│       │   ├── ToolCard.tsx
│       │   └── *.scss
│       ├── connections/         # Connection management
│       │   └── ConnectionsSidebar.tsx
│       ├── marketplace/         # Tool marketplace
│       │   └── MarketplaceSidebar.tsx
│       ├── debug/              # Debug/dev tools
│       │   └── DebugSidebar.tsx
│       └── settings/           # Application settings
│           └── SettingsSidebar.tsx
├── contexts/                   # React Context providers
│   ├── AppContext.tsx          # Global app state (theme, navigation)
│   ├── ToolsContext.tsx        # Tools state management
│   └── ConnectionsContext.tsx  # Connections state management
└── theme/                      # Theme configuration
    └── tokens.ts               # Fluent UI theme tokens
```

## State Management

### Context Providers

The application uses React Context API for state management:

#### AppContext
- **Purpose**: Global app state (theme, active view, sidebar state)
- **Usage**: `const { theme, setTheme, activeView, activeSidebar } = useAppContext()`
- **Features**:
  - Theme switching (light/dark/system)
  - Active view management
  - Sidebar navigation state

#### ToolsContext
- **Purpose**: Tool management state
- **Usage**: `const { installedTools, marketplaceTools, launchTool } = useToolsContext()`
- **Features**:
  - Installed tools list
  - Marketplace tools catalog
  - Open tools tracking
  - Tool launch/close/switch operations

#### ConnectionsContext
- **Purpose**: Connection management state
- **Usage**: `const { connections, activeConnection, addConnection } = useConnectionsContext()`
- **Features**:
  - Connections list
  - Active connection tracking
  - Add/delete/update operations

### Context Hierarchy

```jsx
<AppProvider>
  <ConnectionsProvider>
    <ToolsProvider>
      <FluentProvider theme={...}>
        <App />
      </FluentProvider>
    </ToolsProvider>
  </ConnectionsProvider>
</AppProvider>
```

## Theme System

### Fluent UI Theme

The theme is based on the pptb-web repository with these brand colors:

- **Primary Blue**: `#0078D4` (Fluent/Copilot blue)
- **Primary Purple**: `#8A3FFC` (Fluent/Copilot purple)
- **Dark**: `#0F172A` (Primary dark text)
- **Mid**: `#1E293B` (Body text)
- **Light**: `#475569` (Secondary text)
- **Background**: `#F8FAFC` (Light mode background)
- **Surface**: `#FFFFFF` (Card/container background)

### CSS Custom Properties

```css
--pptb-color-blue: #0078D4;
--pptb-color-purple: #8A3FFC;
--pptb-gradient: linear-gradient(to right, #0078D4, #8A3FFC);
--pptb-shadow-fluent: 0 4px 12px rgba(0, 0, 0, 0.08);
--pptb-shadow-card: 0 2px 8px rgba(0, 0, 0, 0.05);
--pptb-activity-bar-width: 48px;
--pptb-sidebar-width: 280px;
--pptb-footer-height: 32px;
```

### Theme Switching

Themes are managed via `AppContext` and apply to both Fluent UI components and custom CSS:

```tsx
// In component
const { theme, setTheme } = useAppContext();

// Set theme
setTheme("dark"); // "light" | "dark" | "system"
```

## Component Patterns

### Functional Components with Hooks

All components use functional components with React hooks:

```tsx
import React, { useState, useEffect } from "react";
import { Button } from "@fluentui/react-components";

export const MyComponent: React.FC = () => {
    const [count, setCount] = useState(0);
    
    useEffect(() => {
        // Side effects
    }, []);
    
    return <Button onClick={() => setCount(count + 1)}>Count: {count}</Button>;
};
```

### Fluent UI Components

Always use Fluent UI components for consistency:

```tsx
import { 
    Button, 
    Input, 
    Dropdown, 
    Menu, 
    MenuTrigger,
    Dialog 
} from "@fluentui/react-components";
import { 
    Play20Regular, 
    MoreHorizontal20Regular 
} from "@fluentui/react-icons";
```

### SCSS with Component Scope

Each component can have its own SCSS file:

```tsx
// Component.tsx
import "./Component.scss";

export const Component: React.FC = () => {
    return <div className="my-component">...</div>;
};
```

```scss
// Component.scss
.my-component {
    padding: 16px;
    background-color: var(--bg-color);
}
```

## API Integration

Components interact with the main process through the `window.toolboxAPI`:

```tsx
// Example: Loading tools
const loadTools = async () => {
    try {
        const tools = await window.toolboxAPI.getAllTools();
        setTools(tools);
    } catch (error) {
        console.error("Failed to load tools:", error);
    }
};

// Example: Launching a tool
const launchTool = async (toolId: string) => {
    const tool = await window.toolboxAPI.getTool(toolId);
    await window.toolboxAPI.launchToolWindow(toolId, tool);
};

// Example: Showing notification
await window.toolboxAPI.utils.showNotification({
    title: "Success",
    body: "Operation completed",
    type: "success"
});
```

## Building and Development

### Build Commands

```bash
# Install dependencies
pnpm install

# Type check
pnpm run typecheck

# Build for production
pnpm run build

# Development mode (requires display)
pnpm run dev

# Lint
pnpm run lint
```

### TypeScript Configuration

The renderer uses `tsconfig.renderer.json` with these key settings:

```json
{
    "compilerOptions": {
        "jsx": "react-jsx",
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "module": "ES2022",
        "moduleResolution": "bundler",
        "skipLibCheck": true
    }
}
```

## Migration Guide

### From Old Renderer to React

**Old Pattern (Vanilla TS):**
```typescript
const button = document.createElement("button");
button.textContent = "Click me";
button.addEventListener("click", handleClick);
container.appendChild(button);
```

**New Pattern (React):**
```tsx
<Button onClick={handleClick}>Click me</Button>
```

### State Management Migration

**Old Pattern:**
```typescript
let activeView = "home";
function setActiveView(view: string) {
    activeView = view;
    updateUI();
}
```

**New Pattern:**
```tsx
const { activeView, setActiveView } = useAppContext();
// State updates automatically trigger re-renders
```

## Best Practices

1. **Use Context for Shared State**: Don't prop-drill; use context providers
2. **Keep Components Focused**: Each component should have a single responsibility
3. **Use Fluent UI Components**: Don't create custom buttons, inputs, etc.
4. **Type Everything**: Use TypeScript interfaces for all props and state
5. **Handle Errors**: Always wrap async operations in try-catch
6. **Show Loading States**: Use loading indicators for async operations
7. **Accessibility**: Fluent UI components are accessible by default

## Future Enhancements

- [ ] Complete modal implementations (AddConnection, ToolDetail, etc.)
- [ ] Enhanced marketplace with filtering and search
- [ ] Complete debug/dev tools functionality
- [ ] Advanced settings UI
- [ ] Terminal panel integration
- [ ] Tool tabs management
- [ ] Animation and transitions
- [ ] Keyboard shortcuts
- [ ] Advanced theme customization

## Resources

- [React Documentation](https://react.dev/)
- [Fluent UI React Components](https://react.fluentui.dev/)
- [Fluent UI Icons](https://react.fluentui.dev/?path=/docs/icons-catalog--page)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [PPTB Web Theme Reference](https://github.com/PowerPlatformToolBox/pptb-web)
