# Fluent UI Integration

## Overview

This application uses **Fluent UI Web Components** (v2.6.1) to align with the Microsoft ecosystem and Power Platform design language. Fluent UI provides a modern, accessible, and consistent user experience across the application.

## Why Fluent UI Web Components?

- **Framework-agnostic**: Works with vanilla JavaScript/TypeScript without requiring React
- **Microsoft Design Language**: Aligns with Power Platform and Microsoft 365 design
- **Accessible**: Built-in ARIA support and keyboard navigation
- **Themeable**: Supports light/dark themes with CSS custom properties
- **Modern**: Based on web standards (Custom Elements)

## Available Components

The application includes the full Fluent UI Web Components library. Common components include:

- **Buttons**: `<fluent-button>` with `appearance="primary"`, `"secondary"`, etc.
- **Text Fields**: `<fluent-text-field>` for input fields
- **Select**: `<fluent-select>` with `<fluent-option>` for dropdowns
- **Checkbox**: `<fluent-checkbox>` for boolean options
- **Badge**: `<fluent-badge>` for status indicators
- **Dialog**: `<fluent-dialog>` for modal dialogs (not yet migrated)
- **Tabs**: `<fluent-tabs>` for tabbed interfaces (not yet migrated)

For a complete list, see the [Fluent UI Web Components documentation](https://learn.microsoft.com/en-us/fluent-ui/web-components/).

## Usage Examples

### Button

```html
<fluent-button appearance="primary" id="my-button">Click Me</fluent-button>
```

### Text Field

```html
<fluent-text-field 
    type="text" 
    placeholder="Enter text..." 
    style="width: 100%;">
</fluent-text-field>
```

### Select

```html
<fluent-select id="my-select" style="width: 100%;">
    <fluent-option value="option1">Option 1</fluent-option>
    <fluent-option value="option2">Option 2</fluent-option>
</fluent-select>
```

### Checkbox

```html
<fluent-checkbox id="my-checkbox"></fluent-checkbox>
```

## TypeScript Integration

Fluent UI Web Components are custom elements that can be accessed in TypeScript:

```typescript
// Use 'any' type for Fluent UI components since they don't have built-in TypeScript definitions
const button = document.getElementById('my-button') as any;
button.appearance = 'primary';

// For form elements, use standard properties
const textField = document.getElementById('my-text-field') as any;
console.log(textField.value);

const checkbox = document.getElementById('my-checkbox') as any;
console.log(checkbox.checked);
```

## Theming

The application applies custom theme colors to Fluent UI components using CSS custom properties:

```css
fluent-button {
    --accent-fill-rest: var(--primary-color);
    --accent-fill-hover: var(--primary-hover);
}
```

Dark theme overrides are applied automatically based on the `body.dark-theme` class.

## Migration Status

The following components have been migrated to Fluent UI:

- ✅ Primary buttons (`appearance="primary"`)
- ✅ Secondary buttons (`appearance="secondary"`)
- ✅ Text input fields
- ✅ Select dropdowns
- ✅ Checkboxes
- ✅ Badge indicators

Components not yet migrated:

- ⏳ Activity bar buttons (use custom styling)
- ⏳ Tabs (can be migrated to `<fluent-tabs>`)
- ⏳ Modal dialogs (can be migrated to `<fluent-dialog>`)
- ⏳ Tooltips (can be migrated to `<fluent-tooltip>`)

## Design Tokens

The application also includes `@fluentui/tokens` (v1.0.0-alpha.22) which provides:

- Color tokens (grey scale, semantic colors)
- Typography tokens
- Spacing tokens
- Shadow tokens

These can be imported and used in TypeScript/JavaScript if needed for custom styling.

## Build Process

The Fluent UI Web Components bundle is automatically copied during the build:

```bash
npm run build
```

This copies `node_modules/@fluentui/web-components/dist/web-components.min.js` to `dist/renderer/vendor/fluent-web-components.js`.

## Resources

- [Fluent UI Web Components Documentation](https://learn.microsoft.com/en-us/fluent-ui/web-components/)
- [Fluent UI Design System](https://fluent2.microsoft.design/)
- [GitHub Repository](https://github.com/microsoft/fluentui/tree/master/packages/web-components)
