# Tool Development Guide

This guide explains how to develop external tools for the PowerPlatform ToolBox.

## Tool Structure

A tool is an npm package that follows a specific structure. Here's an example `package.json`:

```json
{
  "name": "@powerplatform/my-tool",
  "version": "1.0.0",
  "description": "Description of what your tool does",
  "displayName": "My Tool",
  "main": "index.js",
  "author": "Your Name",
  "icon": "🔧",
  "keywords": ["powerplatform", "dataverse", "toolbox"],
  "peerDependencies": {
    "powerplatform-toolbox": "^1.0.0"
  }
}
```

## Required Fields

- **name**: Unique package name (preferably under `@powerplatform` scope)
- **version**: Semantic version of your tool
- **description**: Brief description of your tool's functionality
- **main**: Entry point JavaScript file

## Optional Fields

- **displayName**: Human-readable name (defaults to package name)
- **author**: Tool author information
- **icon**: Emoji or path to icon file

## Tool Entry Point

Your main file should export functions and UI that integrate with the ToolBox:

```javascript
// index.js
module.exports = {
  init: function(toolboxAPI, settings) {
    // Initialize your tool
    console.log('Tool initialized!');
    
    // Access ToolBox API
    toolboxAPI.showNotification({
      title: 'Tool Ready',
      body: 'My tool is ready to use',
      type: 'success'
    });
    
    // Subscribe to events
    toolboxAPI.subscribe('connection:created', (event) => {
      console.log('New connection created:', event.data);
    });
    
    return {
      // Tool interface
      getUI: () => {
        return '<div>Tool UI HTML</div>';
      },
      cleanup: () => {
        // Cleanup when tool is unloaded
      }
    };
  }
};
```

## Accessing ToolBox API

The ToolBox API provides several methods:

### Notifications
```javascript
toolboxAPI.showNotification({
  title: 'Title',
  body: 'Message',
  type: 'info' | 'success' | 'warning' | 'error',
  duration: 5000 // milliseconds
});
```

### Events
```javascript
// Subscribe to events
toolboxAPI.subscribe('tool:loaded', (event) => {
  console.log(event);
});

// Unsubscribe from events
toolboxAPI.unsubscribe('tool:loaded', callback);

// Get event history
const events = toolboxAPI.getEventHistory(10); // Last 10 events
```

### Available Events
- `tool:loaded` - When a tool is loaded
- `tool:unloaded` - When a tool is unloaded
- `connection:created` - When a Dataverse connection is created
- `connection:updated` - When a connection is updated
- `connection:deleted` - When a connection is deleted
- `settings:updated` - When settings are updated
- `notification:shown` - When a notification is shown

## Tool Settings

Tools can have their own settings that persist across sessions:

```javascript
// In your tool
const mySettings = await toolboxAPI.getToolSettings('my-tool-id');

// Update settings
await toolboxAPI.updateToolSettings('my-tool-id', {
  option1: true,
  option2: 'value'
});
```

## Accessing Dataverse Connections

```javascript
// Get all configured connections
const connections = await toolboxAPI.getConnections();

// Use a connection
connections.forEach(conn => {
  console.log(`Connection: ${conn.name} at ${conn.url}`);
});
```

## Publishing Your Tool

1. Develop and test your tool locally
2. Publish to npm:
   ```bash
   npm publish
   ```
3. Users can install your tool from the ToolBox UI by providing your package name

## Best Practices

1. **Error Handling**: Always handle errors gracefully
2. **Cleanup**: Implement proper cleanup in your tool's cleanup method
3. **Settings**: Store user preferences in tool settings
4. **Events**: Use the event system to react to ToolBox state changes
5. **Documentation**: Provide clear documentation for your tool
6. **Testing**: Test your tool with different Dataverse environments

## Example Tool

A complete example tool is available at: `@powerplatform/example-tool`

You can install it to see how a tool integrates with the ToolBox.
