/**
 * Example PowerPlatform Tool - TypeScript Version
 * This demonstrates the Tool Host architecture with TypeScript type safety
 */

import * as pptoolbox from './pptoolbox';

/**
 * Interface for export data
 */
interface ExportData {
  timestamp: string;
  message: string;
  tool: string;
  version: string;
  connections?: number;
  settings?: Record<string, unknown>;
}

/**
 * Interface for Dataverse entity metadata (example)
 */
interface EntityMetadata {
  logicalName: string;
  displayName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
}

/**
 * Tool configuration from settings
 */
interface ToolConfig {
  enabled: boolean;
  message: string;
  apiTimeout: number;
}

/**
 * This function is called when your tool is activated
 * @param context - Tool context with state and subscriptions
 */
export async function activate(context: pptoolbox.ToolContext): Promise<void> {
  console.log('Example TypeScript tool is now active!');
  console.log(`Tool ID: ${context.toolId}`);
  console.log(`Extension Path: ${context.extensionPath}`);

  // Load tool configuration from state
  const config: ToolConfig = context.globalState.get('config', {
    enabled: true,
    message: 'Hello from TypeScript Tool!',
    apiTimeout: 5000,
  });

  // Register command: Say Hello
  const sayHelloCommand = pptoolbox.commands.registerCommand(
    'exampleTs.sayHello',
    async () => {
      try {
        const message = context.globalState.get('exampleTs.message', config.message);
        await pptoolbox.window.showInformationMessage(message);
        
        // Track usage
        const usageCount = context.globalState.get<number>('sayHelloUsageCount', 0);
        await context.globalState.update('sayHelloUsageCount', usageCount + 1);
      } catch (error) {
        await pptoolbox.window.showErrorMessage(
          `Error executing Say Hello: ${(error as Error).message}`
        );
      }
    }
  );

  // Register command: Show Notification
  const showNotificationCommand = pptoolbox.commands.registerCommand(
    'exampleTs.showNotification',
    async () => {
      await pptoolbox.window.showInformationMessage(
        'This is an example notification from the TypeScript Tool!'
      );
    }
  );

  // Register command: Export Data with type safety
  const exportDataCommand = pptoolbox.commands.registerCommand(
    'exampleTs.exportData',
    async () => {
      try {
        const exportData: ExportData = {
          timestamp: new Date().toISOString(),
          message: 'Example data export from TypeScript',
          tool: 'example-tool-typescript',
          version: '1.0.0',
          settings: {
            enabled: config.enabled,
            apiTimeout: config.apiTimeout,
          },
        };

        const jsonData = JSON.stringify(exportData, null, 2);
        const filePath = await pptoolbox.workspace.saveFile(
          'example-export-ts.json',
          jsonData
        );

        if (filePath) {
          await pptoolbox.window.showInformationMessage(
            `Data exported to: ${filePath}`
          );
          
          // Copy path to clipboard for convenience
          await pptoolbox.window.copyToClipboard(filePath);
          console.log(`Export completed: ${filePath}`);
        } else {
          await pptoolbox.window.showWarningMessage('Export cancelled by user');
        }
      } catch (error) {
        await pptoolbox.window.showErrorMessage(
          `Export failed: ${(error as Error).message}`
        );
      }
    }
  );

  // Register command: Fetch Dataverse Data (simulated)
  const fetchDataverseDataCommand = pptoolbox.commands.registerCommand(
    'exampleTs.fetchDataverseData',
    async () => {
      try {
        await pptoolbox.window.showInformationMessage('Fetching Dataverse data...');
        
        // Simulate API call with timeout
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Simulated entity metadata
        const entities: EntityMetadata[] = [
          {
            logicalName: 'account',
            displayName: 'Account',
            primaryIdAttribute: 'accountid',
            primaryNameAttribute: 'name',
          },
          {
            logicalName: 'contact',
            displayName: 'Contact',
            primaryIdAttribute: 'contactid',
            primaryNameAttribute: 'fullname',
          },
        ];

        // Store in workspace state
        await context.workspaceState.update('cachedEntities', entities);
        
        await pptoolbox.window.showInformationMessage(
          `Fetched ${entities.length} entities from Dataverse (simulated)`
        );
        
        console.log('Cached entities:', entities);
      } catch (error) {
        await pptoolbox.window.showErrorMessage(
          `Failed to fetch data: ${(error as Error).message}`
        );
      }
    }
  );

  // Subscribe to ToolBox events with typed handlers
  const connectionCreatedListener = pptoolbox.events.onEvent(
    pptoolbox.EventType.CONNECTION_CREATED,
    async (eventData: unknown) => {
      console.log('New connection created:', eventData);
      
      const data = eventData as { data?: { name?: string } };
      const connectionName = data.data?.name || 'Unknown';
      
      await pptoolbox.window.showInformationMessage(
        `Connection created: ${connectionName}`
      );
      
      // Track connection count
      const connectionCount = context.globalState.get<number>('connectionCount', 0);
      await context.globalState.update('connectionCount', connectionCount + 1);
    }
  );

  const settingsUpdatedListener = pptoolbox.events.onEvent(
    pptoolbox.EventType.SETTINGS_UPDATED,
    (eventData: unknown) => {
      console.log('Settings updated:', eventData);
      // Reload configuration if needed
      const newConfig = context.globalState.get<ToolConfig>('config');
      if (newConfig) {
        console.log('Configuration reloaded:', newConfig);
      }
    }
  );

  // Register all disposables for cleanup
  context.subscriptions.push(
    sayHelloCommand,
    showNotificationCommand,
    exportDataCommand,
    fetchDataverseDataCommand,
    connectionCreatedListener,
    settingsUpdatedListener
  );

  // Save activation metadata
  const activationData = {
    activatedAt: new Date().toISOString(),
    toolId: context.toolId,
    nodeVersion: process.version,
    platform: process.platform,
  };
  
  await context.globalState.update('lastActivation', activationData);
  
  console.log('TypeScript tool activation complete!');
  console.log('Activation data:', activationData);
}

/**
 * This function is called when your tool is deactivated
 */
export async function deactivate(): Promise<void> {
  console.log('Example TypeScript tool is now deactivated!');
  // Cleanup is handled automatically via context.subscriptions
  // Additional custom cleanup can be done here
}
