# Power Platform Tool Box - Sample Tools

This directory contains complete, production-ready sample tools demonstrating how to build tools for Power Platform Tool Box using different modern web frameworks.

## Available Samples

### 1. HTML Sample (`html-sample/`)
**Technology**: HTML, CSS, TypeScript

A vanilla TypeScript implementation demonstrating tool development without any framework dependencies.

**Key Features**:
- Pure TypeScript with no framework overhead
- Modern ES2022 features
- Clean separation of concerns
- Comprehensive API usage examples

**Best For**: Lightweight tools, simple utilities, learning the API basics

[→ View HTML Sample Documentation](./html-sample/README.md)

---

### 2. React Sample (`react-sample/`)
**Technology**: React 18, TypeScript, Vite

A modern React application using hooks and functional components.

**Key Features**:
- React 18 with concurrent features
- Custom hooks for API integration
- Component-based architecture
- Hot Module Replacement (HMR)
- Optimized production builds

**Best For**: Complex interactive tools, data visualization, tools requiring rich UI

[→ View React Sample Documentation](./react-sample/README.md)

---

### 3. Vue Sample (`vue-sample/`)
**Technology**: Vue 3, Composition API, TypeScript, Vite

A Vue 3 application using the Composition API and Single File Components.

**Key Features**:
- Vue 3 with Composition API
- `<script setup>` syntax for cleaner code
- Reactive composables
- Single File Components (.vue)
- Type-safe event handling

**Best For**: Progressive web apps, form-heavy tools, tools requiring two-way data binding

[→ View Vue Sample Documentation](./vue-sample/README.md)

---

### 4. Svelte Sample (`svelte-sample/`)
**Technology**: Svelte 5, TypeScript, Vite

A Svelte application leveraging Svelte's compiler-based reactivity.

**Key Features**:
- Svelte 5 with modern reactivity
- Minimal runtime overhead
- Built-in reactivity (no virtual DOM)
- Stores for state management
- Smaller bundle sizes

**Best For**: Performance-critical tools, embedded tools, tools with limited screen space

[→ View Svelte Sample Documentation](./svelte-sample/README.md)

---

## What Each Sample Demonstrates

All samples include comprehensive examples of:

### ToolBox API Integration
✅ Connection management with real-time updates  
✅ Notification system (success, info, warning, error)  
✅ Clipboard operations  
✅ File save/load dialogs  
✅ Theme detection (light/dark)  
✅ Terminal creation and command execution  
✅ Event subscription and handling  

### Dataverse API Integration
✅ FetchXML query execution  
✅ CRUD operations (Create, Read, Update, Delete)  
✅ Entity metadata retrieval  
✅ Error handling and validation  

### Development Best Practices
✅ TypeScript with full type safety (`@pptb/types`)  
✅ Modern build tooling (Vite)  
✅ Component-based architecture  
✅ State management patterns  
✅ Event-driven architecture  
✅ Responsive UI design  
✅ Production-ready builds  

---

## Quick Start

### Prerequisites
- Node.js 18 or higher
- Power Platform Tool Box desktop application

### Installation Steps

1. **Navigate to sample directory**:
   ```bash
   cd sample/[html|react|vue|svelte]-sample
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the sample**:
   ```bash
   npm run build
   ```

4. **Install in Power Platform Tool Box**:
   - Open Power Platform Tool Box
   - Go to Tools section
   - Click "Install Tool"
   - Enter the path to the built sample directory

---

## Choosing the Right Framework

### Choose **HTML/TypeScript** if you:
- Want minimal dependencies
- Need the smallest possible bundle size
- Are building a simple utility tool
- Want to learn the API without framework complexity

### Choose **React** if you:
- Need rich, complex user interfaces
- Want to leverage the React ecosystem
- Are familiar with React patterns
- Need extensive third-party component libraries

### Choose **Vue** if you:
- Want a progressive framework
- Prefer template-based syntax
- Need strong TypeScript support
- Want excellent documentation and tooling

### Choose **Svelte** if you:
- Want the smallest runtime bundle
- Need maximum performance
- Prefer compiler-based reactivity
- Want minimal boilerplate code

---

## Sample Comparison

| Feature | HTML | React | Vue | Svelte |
|---------|------|-------|-----|--------|
| **Bundle Size** | ~50KB | ~155KB | ~72KB | ~42KB |
| **Runtime Overhead** | Minimal | Medium | Medium | Minimal |
| **Learning Curve** | Easy | Moderate | Easy | Easy |
| **TypeScript Support** | Excellent | Excellent | Excellent | Excellent |
| **Build Time** | Fast | Fast | Fast | Fast |
| **HMR Support** | No | Yes | Yes | Yes |
| **Ecosystem** | Standard Web | Large | Large | Growing |

*Bundle sizes are approximate and include all sample features*

---

## Development Workflow

### Development Mode (React/Vue/Svelte only)
```bash
npm run dev
```
Starts development server with hot module replacement. Note: ToolBox APIs are only available when loaded within the application.

### Production Build
```bash
npm run build
```
Creates optimized production build in `dist/` directory.

### Type Checking
All samples include TypeScript for type safety:
```bash
# React/Vue/Svelte
npm run check  # or tsc for HTML

# Shows type errors without building
```

---

## Project Structure

Each sample follows a consistent structure:

```
[framework]-sample/
├── src/                  # Source code
│   ├── components/       # UI components (React/Vue/Svelte)
│   ├── hooks/           # Custom hooks (React)
│   ├── composables/     # Composables (Vue)
│   ├── lib/             # Utilities and stores (Svelte)
│   └── ...
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── vite.config.[ts|js]  # Vite configuration (React/Vue/Svelte)
├── index.html           # Entry point
└── README.md            # Sample-specific documentation
```

---

## Common Issues & Solutions

### Build Errors
**Problem**: TypeScript errors during build  
**Solution**: Ensure all dependencies are installed with `npm install`

### API Not Available
**Problem**: `window.toolboxAPI` is undefined  
**Solution**: The tool must be loaded within Power Platform Tool Box, not a standalone browser

### Connection Null
**Problem**: Connection is always null  
**Solution**: Create a connection in Power Platform Tool Box first

### HMR Not Working
**Problem**: Changes don't reflect immediately  
**Solution**: Restart dev server with `npm run dev`

---

## Additional Resources

- **[Tool Development Guide](../docs/TOOL_DEVELOPMENT.md)** - Complete guide to building tools
- **[API Reference](../packages/README.md)** - Full API documentation
- **[Architecture Guide](../docs/ARCHITECTURE.md)** - System architecture overview
- **[Main Repository](https://github.com/PowerPlatform-ToolBox/desktop-app)** - Source code and issues

---

## Contributing

Found an issue or want to improve the samples? 

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

---

## License

All samples are licensed under GPL-3.0. See [LICENSE](../LICENSE) for details.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/PowerPlatform-ToolBox/desktop-app/issues)
- **Discussions**: [GitHub Discussions](https://github.com/PowerPlatform-ToolBox/desktop-app/discussions)
- **Documentation**: [docs/](../docs/)

---

Happy coding! 🚀
