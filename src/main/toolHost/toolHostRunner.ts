/**
 * Tool Host Runner - Runs in a separate Node.js process to execute tools in isolation
 * This is the entry point for the tool host process
 */

import { v4 as uuidv4 } from 'uuid';
import { ToolHostMessage, ToolHostMessageType, ToolHostContext, ToolDeactivationFunction } from '../../types';

// Global state for the tool
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let toolModule: any = null;
let toolContext: ToolHostContext | null = null;
let deactivateFunction: ToolDeactivationFunction | null = null;

/**
 * Send a message to the main process
 */
function sendMessage(message: ToolHostMessage): void {
  if (process.send) {
    process.send(message);
  }
}

/**
 * Create tool context
 */
function createToolContext(toolId: string, extensionPath: string): ToolHostContext {
  const globalState = new Map<string, unknown>();
  const workspaceState = new Map<string, unknown>();

  return {
    toolId,
    extensionPath,
    globalState: {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return globalState.has(key) ? (globalState.get(key) as T) : defaultValue;
      },
      async update(key: string, value: unknown): Promise<void> {
        globalState.set(key, value);
        // Send update to main process to persist
        sendMessage({
          type: ToolHostMessageType.API_CALL,
          id: uuidv4(),
          toolId,
          method: 'updateGlobalState',
          args: [key, value],
          timestamp: Date.now(),
        });
      },
      keys(): readonly string[] {
        return Array.from(globalState.keys());
      },
    },
    workspaceState: {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return workspaceState.has(key) ? (workspaceState.get(key) as T) : defaultValue;
      },
      async update(key: string, value: unknown): Promise<void> {
        workspaceState.set(key, value);
      },
      keys(): readonly string[] {
        return Array.from(workspaceState.keys());
      },
    },
    subscriptions: [],
  };
}

/**
 * Handle incoming messages from main process
 */
process.on('message', async (message: unknown) => {
  if (!isValidMessage(message)) {
    console.error('Invalid message received:', message);
    return;
  }

  const msg = message as ToolHostMessage;

  try {
    switch (msg.type) {
      case ToolHostMessageType.ACTIVATE:
        await handleActivate(msg);
        break;

      case ToolHostMessageType.DEACTIVATE:
        await handleDeactivate(msg);
        break;

      case ToolHostMessageType.REQUEST:
        await handleRequest(msg);
        break;

      default:
        console.warn('Unhandled message type:', msg.type);
    }
  } catch (error) {
    sendMessage({
      type: ToolHostMessageType.ERROR,
      id: msg.id,
      toolId: msg.toolId,
      error: (error as Error).message,
      timestamp: Date.now(),
    });
  }
});

/**
 * Handle tool activation
 */
async function handleActivate(message: ToolHostMessage): Promise<void> {
  const toolPath = process.env.TOOLBOX_TOOL_PATH;
  const extensionPath = process.env.TOOLBOX_EXTENSION_PATH;
  const toolId = process.env.TOOLBOX_TOOL_ID;

  if (!toolPath || !extensionPath || !toolId) {
    throw new Error('Missing tool environment variables');
  }

  // Load the tool module
  try {
    // Clear require cache to allow hot reload
    delete require.cache[require.resolve(toolPath)];
    toolModule = require(toolPath);
  } catch (error) {
    throw new Error(`Failed to load tool module: ${(error as Error).message}`);
  }

  // Create tool context
  toolContext = createToolContext(toolId, extensionPath);

  // Call activate function if it exists
  if (typeof toolModule.activate === 'function') {
    const result = toolModule.activate(toolContext);
    
    // Handle async activation
    if (result instanceof Promise) {
      await result;
    }

    // Store deactivate function if it exists
    if (typeof toolModule.deactivate === 'function') {
      deactivateFunction = toolModule.deactivate;
    }
  } else {
    console.warn(`Tool ${toolId} does not export an activate function`);
  }

  // Send success response
  sendMessage({
    type: ToolHostMessageType.RESPONSE,
    id: message.id,
    toolId: message.toolId,
    result: { success: true },
    timestamp: Date.now(),
  });
}

/**
 * Handle tool deactivation
 */
async function handleDeactivate(message: ToolHostMessage): Promise<void> {
  // Call deactivate function if it exists
  if (deactivateFunction) {
    const result = deactivateFunction();
    
    // Handle async deactivation
    if (result instanceof Promise) {
      await result;
    }
  }

  // Dispose all subscriptions
  if (toolContext) {
    for (const subscription of toolContext.subscriptions) {
      try {
        subscription.dispose();
      } catch (error) {
        console.error('Error disposing subscription:', error);
      }
    }
  }

  // Send success response
  sendMessage({
    type: ToolHostMessageType.RESPONSE,
    id: message.id,
    toolId: message.toolId,
    result: { success: true },
    timestamp: Date.now(),
  });

  // Clean up
  toolModule = null;
  toolContext = null;
  deactivateFunction = null;
}

/**
 * Handle API request from main process
 */
async function handleRequest(message: ToolHostMessage): Promise<void> {
  if (!message.method) {
    throw new Error('Request missing method');
  }

  // Check if the tool module has the requested method
  if (!toolModule || typeof toolModule[message.method] !== 'function') {
    throw new Error(`Tool does not implement method: ${message.method}`);
  }

  // Call the method
  const result = await toolModule[message.method](...(message.args || []));

  // Send response
  sendMessage({
    type: ToolHostMessageType.RESPONSE,
    id: message.id,
    toolId: message.toolId,
    result,
    timestamp: Date.now(),
  });
}

/**
 * Validate message structure
 */
function isValidMessage(message: unknown): message is ToolHostMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Partial<ToolHostMessage>;
  
  return (
    typeof msg.type === 'string' &&
    typeof msg.id === 'string' &&
    typeof msg.toolId === 'string' &&
    typeof msg.timestamp === 'number'
  );
}

/**
 * Initialize the tool host
 */
function initialize(): void {
  // Send ready message to main process
  sendMessage({
    type: ToolHostMessageType.EVENT,
    id: uuidv4(),
    toolId: process.env.TOOLBOX_TOOL_ID || 'unknown',
    method: 'ready',
    timestamp: Date.now(),
  });
}

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in tool host:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in tool host:', reason);
});

// Initialize when the script is loaded
initialize();
