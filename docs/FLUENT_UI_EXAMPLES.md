# Fluent UI Migration Examples

This document shows before/after examples of UI components that were migrated to Fluent UI Web Components.

## Buttons

### Before
```html
<button class="btn btn-primary" id="confirm-connection-btn">Add</button>
<button class="btn btn-secondary" id="cancel-connection-btn">Cancel</button>
```

### After
```html
<fluent-button appearance="primary" id="confirm-connection-btn">Add</fluent-button>
<fluent-button appearance="secondary" id="cancel-connection-btn">Cancel</fluent-button>
```

## Text Input Fields

### Before
```html
<input type="text" id="tools-search-input" class="search-input" placeholder="Search installed tools..." />
```

### After
```html
<fluent-text-field type="text" id="tools-search-input" placeholder="Search installed tools..." style="width: 100%;"></fluent-text-field>
```

## Select Dropdowns

### Before
```html
<select id="sidebar-theme-select" class="setting-input">
    <option value="system">System</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
</select>
```

### After
```html
<fluent-select id="sidebar-theme-select" class="setting-input" style="width: 100%;">
    <fluent-option value="system">System</fluent-option>
    <fluent-option value="light">Light</fluent-option>
    <fluent-option value="dark">Dark</fluent-option>
</fluent-select>
```

## Checkboxes

### Before
```html
<input type="checkbox" id="sidebar-auto-update-check" class="setting-checkbox" />
```

### After
```html
<fluent-checkbox id="sidebar-auto-update-check"></fluent-checkbox>
```

## Status Badges

### Before
```html
<span class="tool-installed-badge" id="tool-detail-installed-badge" style="display: none;">Installed</span>
```

### After
```html
<fluent-badge appearance="success" id="tool-detail-installed-badge" style="display: none;">Installed</fluent-badge>
```

## TypeScript Integration

### Before
```typescript
const themeSelect = document.getElementById("sidebar-theme-select") as HTMLSelectElement;
const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as HTMLInputElement;
```

### After
```typescript
const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element
```

**Note**: Using `any` type is acceptable for Fluent UI components since they are custom elements without built-in TypeScript definitions. The standard properties like `value` and `checked` still work as expected.

## CSS Theming

### New Fluent UI Customization
```css
/* Apply theme colors to Fluent components */
fluent-button {
    --accent-fill-rest: var(--primary-color);
    --accent-fill-hover: var(--primary-hover);
}

fluent-text-field {
    --neutral-fill-input-rest: var(--bg-color);
    --neutral-stroke-rest: var(--border-color);
}

body.dark-theme fluent-text-field {
    --neutral-fill-input-rest: #3e3e42;
    --neutral-stroke-rest: #3e3e42;
    --neutral-foreground-rest: var(--text-color);
}
```

## Benefits

1. **Consistent Design**: All components now follow Microsoft Fluent Design System
2. **Better Accessibility**: Built-in ARIA attributes and keyboard navigation
3. **Theme Support**: Seamless integration with light/dark themes
4. **Modern Look**: Updated visual appearance aligned with Microsoft 365 and Power Platform
5. **Future-proof**: Easy to update and maintain with Microsoft's component library

## Backward Compatibility

- All existing IDs and event handlers remain unchanged
- Standard properties (`value`, `checked`, etc.) work the same way
- Existing CSS classes still apply where needed for layout
