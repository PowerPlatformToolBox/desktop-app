# SCSS Styles Organization

This directory contains modular SCSS partials for the PowerPlatform ToolBox application.

## File Structure

- **`_variables.scss`** - SCSS variables for colors, spacing, typography, and layout
- **`_mixins.scss`** - Reusable SCSS mixins for common patterns

## Usage

Import these files in your SCSS using the modern `@use` syntax:

```scss
@use './styles/variables' as *;
@use './styles/mixins' as *;

.my-component {
    background: $primary-color;
    padding: $spacing-md;
    @include flex-center;
}
```

## Variables Reference

### Colors
- `$primary-color`, `$primary-hover` - Primary brand colors
- `$text-color`, `$bg-color` - Default text and background
- `$dark-*` - Dark theme color variants

### Spacing
- `$spacing-xs` through `$spacing-xl` - Consistent spacing scale (4px to 32px)

### Layout
- `$activity-bar-width`, `$sidebar-width` - Fixed layout dimensions
- `$app-footer-height` - Footer height

### Z-Index
- `$z-activity-bar`, `$z-sidebar`, `$z-modal` - Layering system

## Mixins Reference

### Layout Mixins
- `@include flex-center` - Flexbox with centered content
- `@include flex-between` - Flexbox with space-between
- `@include flex-column` - Flexbox column layout

### Utility Mixins
- `@include card-shadow` - Card shadow with hover effect
- `@include button-reset` - Reset button styles
- `@include custom-scrollbar` - Custom scrollbar styling
- `@include truncate` - Truncate text with ellipsis

### Theme Mixins
- `@include dark-theme { }` - Styles for dark theme
- `@include light-theme { }` - Styles for light theme

## Adding New Variables

When adding new variables, follow these naming conventions:

- **Colors**: `$[element]-[state]-color` (e.g., `$button-hover-color`)
- **Spacing**: Use the existing scale or add to it
- **Layout**: `$[element]-[property]` (e.g., `$sidebar-width`)

## Adding New Mixins

Create reusable mixins for patterns used 3+ times in the codebase:

```scss
@mixin my-pattern($param: default) {
    // Mixin code here
}
```

## Best Practices

1. **Use variables** for all colors, spacing, and layout values
2. **Use mixins** for repeated CSS patterns
3. **Nest selectors** only when it improves readability (max 3 levels)
4. **Use @use** instead of @import (modern syntax)
5. **Keep partials focused** - split into multiple files if needed
6. **Document** complex mixins and variables

## Further Reading

- [Sass/SCSS Documentation](https://sass-lang.com/documentation)
- [BUILD_OPTIMIZATION.md](../../../docs/BUILD_OPTIMIZATION.md) - Full build optimization guide
