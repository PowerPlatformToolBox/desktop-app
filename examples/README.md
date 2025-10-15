# Tool Examples Comparison

This document compares the JavaScript and TypeScript example tools to help you choose the right approach for your tool development.

## Quick Comparison

| Feature | JavaScript Example | TypeScript Example |
|---------|-------------------|-------------------|
| **File Extension** | `.js` | `.ts` → compiled to `.js` |
| **Type Safety** | Runtime only | Compile-time + Runtime |
| **IDE Support** | Basic | Enhanced with IntelliSense |
| **Build Step** | Not required | Required (`npm run build`) |
| **Learning Curve** | Lower | Moderate |
| **Error Detection** | Runtime | Compile-time |
| **Refactoring** | Manual, error-prone | Type-guided, safer |
| **Documentation** | Comments + docs | Types + comments + docs |

## JavaScript Example (`example-tool/`)

### Pros ✅
- **Quick to start** - No build step required
- **Simpler setup** - Just write code and run
- **Familiar** - Standard JavaScript developers know
- **Smaller package** - No compilation artifacts

### Cons ❌
- **No type safety** - Errors caught at runtime
- **Less IDE support** - Limited autocomplete
- **Harder to maintain** - No compile-time validation
- **Documentation separate** - Types not in code

### Best For
- Quick prototypes
- Simple tools with few APIs
- Developers new to TypeScript
- Tools that don't need complex data structures

### Example Code
```javascript
const pptoolbox = require('pptoolbox');

function activate(context) {
  const cmd = pptoolbox.commands.registerCommand(
    'example.sayHello',
    async () => {
      await pptoolbox.window.showInformationMessage('Hello!');
    }
  );
  
  context.subscriptions.push(cmd);
}

module.exports = { activate, deactivate };
```

## TypeScript Example (`example-tool-typescript/`)

### Pros ✅
- **Type safety** - Catch errors before runtime
- **Better IDE support** - Full IntelliSense and autocomplete
- **Self-documenting** - Types explain the API
- **Refactoring-friendly** - Compiler helps with changes
- **Scalable** - Better for large, complex tools

### Cons ❌
- **Build step required** - Must compile before running
- **More setup** - tsconfig.json, type definitions
- **Steeper learning curve** - Requires TypeScript knowledge
- **Larger dev dependencies** - TypeScript compiler

### Best For
- Production tools
- Complex tools with many features
- Teams with TypeScript experience
- Tools that evolve over time
- Tools with complex data structures

### Example Code
```typescript
import * as pptoolbox from './pptoolbox';

export async function activate(context: pptoolbox.ToolContext): Promise<void> {
  const cmd = pptoolbox.commands.registerCommand(
    'example.sayHello',
    async () => {
      await pptoolbox.window.showInformationMessage('Hello!');
    }
  );
  
  context.subscriptions.push(cmd);
}

export async function deactivate(): Promise<void> {
  // Cleanup
}
```

## Key Differences

### 1. Type Definitions

**JavaScript** - No types, runtime checks:
```javascript
function activate(context) {
  // context is any, no autocomplete
  const value = context.globalState.get('key');
  // value is any, no type safety
}
```

**TypeScript** - Full type safety:
```typescript
function activate(context: pptoolbox.ToolContext): void {
  // context is typed, full autocomplete
  const value = context.globalState.get<number>('key', 0);
  // value is number, type-checked
}
```

### 2. Error Handling

**JavaScript** - Errors at runtime:
```javascript
// No error until you run it
await pptoolbox.window.showInformationMesage('Hello'); // Typo!
```

**TypeScript** - Errors at compile time:
```typescript
// Compiler error: Property 'showInformationMesage' does not exist
await pptoolbox.window.showInformationMesage('Hello'); // Typo caught!
```

### 3. Data Structures

**JavaScript** - No structure enforcement:
```javascript
const data = {
  timestamp: new Date().toISOString(),
  mesage: 'Hello', // Typo goes unnoticed
  count: '5' // Should be number but it's string
};
```

**TypeScript** - Enforced structure:
```typescript
interface ExportData {
  timestamp: string;
  message: string; // Typo will be caught
  count: number; // Type must match
}

const data: ExportData = {
  timestamp: new Date().toISOString(),
  mesage: 'Hello', // Error: Property 'mesage' does not exist
  count: '5' // Error: Type 'string' is not assignable to type 'number'
};
```

### 4. IDE Experience

**JavaScript:**
- Basic autocomplete
- No parameter hints
- Manual documentation lookup

**TypeScript:**
- Full IntelliSense
- Parameter hints with types
- Inline documentation from types
- Jump to definition

## Migration Path

If you start with JavaScript and want to migrate to TypeScript:

1. Copy the TypeScript example structure
2. Rename your `.js` files to `.ts`
3. Copy `pptoolbox.d.ts` type definitions
4. Add `tsconfig.json`
5. Add type annotations gradually
6. Fix type errors
7. Update `package.json` build scripts
8. Test and build

## Recommendation

**Choose JavaScript if:**
- You're building a simple tool quickly
- You're new to TypeScript
- Your tool is less than 500 lines
- You don't need complex data structures

**Choose TypeScript if:**
- You're building a production tool
- You want type safety and better IDE support
- Your tool will grow over time
- You work in a team
- You want to catch errors early

## Both Examples Demonstrate

Regardless of which you choose, both examples show:

- ✅ Secure Tool Host architecture
- ✅ Contribution points in package.json
- ✅ Command registration
- ✅ Event subscriptions
- ✅ State management
- ✅ Error handling
- ✅ File operations
- ✅ Proper cleanup with disposables
- ✅ Webview-based user interfaces
- ✅ Interactive UI components

## User Interface

Both examples include complete webview UIs:

### JavaScript Example UI
- Clean, functional interface
- Command execution buttons
- Event log viewer
- Custom message input
- Real-time activity tracking

### TypeScript Example UI
- Advanced dashboard with statistics
- Configuration management panel
- Comprehensive command table
- Simulated Dataverse entity browser
- Type safety code examples
- Resource monitoring status bar

The UIs are built with standard HTML/CSS/JavaScript and are rendered in the ToolBox renderer as webviews, providing a native-like experience while maintaining security through process isolation.

## Resources

- [JavaScript Example](./example-tool/)
- [TypeScript Example](./example-tool-typescript/)
- [Tool Development Guide](../TOOL_DEVELOPMENT.md)
- [Tool Host Architecture](../TOOL_HOST_ARCHITECTURE.md)
