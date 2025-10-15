/**
 * Example PowerPlatform Tool
 * This demonstrates the new Tool Host architecture with secure IPC and contribution points
 */

// Import the PowerPlatform ToolBox API
// This is injected at runtime by the Tool Host
const pptoolbox = require('pptoolbox');

/**
 * This function is called when your tool is activated
 * @param {Object} context - Tool context with state and subscriptions
 */
function activate(context) {
  console.log('Example tool is now active!');

  // Register commands
  const sayHelloCommand = pptoolbox.commands.registerCommand(
    'example.sayHello',
    async () => {
      const message = context.globalState.get('example.message', 'Hello from Example Tool!');
      await pptoolbox.window.showInformationMessage(message);
    }
  );

  const showNotificationCommand = pptoolbox.commands.registerCommand(
    'example.showNotification',
    async () => {
      await pptoolbox.window.showInformationMessage(
        'This is an example notification from the PowerPlatform ToolBox!'
      );
    }
  );

  const exportDataCommand = pptoolbox.commands.registerCommand(
    'example.exportData',
    async () => {
      const data = JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 'Example data export',
        tool: 'example-tool',
        version: '1.0.0'
      }, null, 2);

      const filePath = await pptoolbox.workspace.saveFile(
        'example-export.json',
        data
      );

      if (filePath) {
        await pptoolbox.window.showInformationMessage(
          `Data exported to: ${filePath}`
        );
      }
    }
  );

  // Subscribe to ToolBox events
  const connectionListener = pptoolbox.events.onEvent(
    pptoolbox.EventType.CONNECTION_CREATED,
    (eventData) => {
      console.log('New connection created:', eventData);
      pptoolbox.window.showInformationMessage(
        `Connection created: ${eventData.data?.name || 'Unknown'}`
      );
    }
  );

  const settingsListener = pptoolbox.events.onEvent(
    pptoolbox.EventType.SETTINGS_UPDATED,
    (eventData) => {
      console.log('Settings updated:', eventData);
    }
  );

  // Store command disposables in context so they're cleaned up on deactivation
  context.subscriptions.push(sayHelloCommand);
  context.subscriptions.push(showNotificationCommand);
  context.subscriptions.push(exportDataCommand);
  context.subscriptions.push(connectionListener);
  context.subscriptions.push(settingsListener);

  // Example: Save some state
  context.globalState.update('lastActivated', new Date().toISOString());
}

/**
 * This function is called when your tool is deactivated
 */
function deactivate() {
  console.log('Example tool is now deactivated!');
  // Cleanup is handled automatically via context.subscriptions
}

// Export activation functions
module.exports = {
  activate,
  deactivate
};
