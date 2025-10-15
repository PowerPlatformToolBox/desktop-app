/**
 * PowerPlatform ToolBox API
 * This module is injected into tool host processes and provides the API that tools import
 * 
 * Usage in tools:
 * import * as pptoolbox from 'pptoolbox';
 */

import { EventEmitter } from 'events';
import { ToolHostMessageType, ToolHostMessage, NotificationOptions } from '../../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Global API instance (singleton in tool host process)
 */
class PPToolBoxAPI extends EventEmitter {
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor() {
    super();
    
    // Set up message handler from main process
    if (process.send) {
      process.on('message', (message: unknown) => {
        this.handleMessage(message);
      });
    }
  }

  /**
   * Send a request to the main process and wait for response
   */
  private async callMainAPI(method: string, ...args: unknown[]): Promise<unknown> {
    const id = uuidv4();
    const message: ToolHostMessage = {
      type: ToolHostMessageType.API_CALL,
      id,
      toolId: process.env.TOOLBOX_TOOL_ID || 'unknown',
      method,
      args,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      if (process.send) {
        process.send(message);
      } else {
        reject(new Error('No IPC channel available'));
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`API call timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /**
   * Handle incoming messages from main process
   */
  private handleMessage(message: unknown): void {
    if (!this.isValidMessage(message)) {
      return;
    }

    const msg = message as ToolHostMessage;

    // Handle responses to API calls
    if (msg.type === ToolHostMessageType.RESPONSE || msg.type === ToolHostMessageType.ERROR) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        
        if (msg.type === ToolHostMessageType.ERROR) {
          pending.reject(new Error(msg.error || 'Unknown error'));
        } else {
          pending.resolve(msg.result);
        }
      }
    }

    // Handle events from main process
    if (msg.type === ToolHostMessageType.EVENT && msg.method) {
      this.emit(msg.method, ...(msg.args || []));
    }
  }

  /**
   * Validate message structure
   */
  private isValidMessage(message: unknown): boolean {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const msg = message as Partial<ToolHostMessage>;
    return (
      typeof msg.type === 'string' &&
      typeof msg.id === 'string' &&
      typeof msg.toolId === 'string'
    );
  }

  /**
   * Show a notification to the user
   */
  async showNotification(options: NotificationOptions): Promise<void> {
    await this.callMainAPI('showNotification', options);
  }

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    await this.callMainAPI('copyToClipboard', text);
  }

  /**
   * Save file dialog and write content
   */
  async saveFile(defaultPath: string, content: string | Buffer): Promise<string | null> {
    return (await this.callMainAPI('saveFile', defaultPath, content)) as string | null;
  }

  /**
   * Get event history
   */
  async getEventHistory(limit?: number): Promise<unknown[]> {
    return (await this.callMainAPI('getEventHistory', limit)) as unknown[];
  }

  /**
   * Emit a custom event
   */
  async emitEvent(event: string, data: unknown): Promise<void> {
    await this.callMainAPI('emitEvent', event, data);
  }

  /**
   * Subscribe to toolbox events
   * Events are forwarded from the main process
   */
  onEvent(event: string, callback: (...args: unknown[]) => void): void {
    this.on(event, callback);
  }

  /**
   * Unsubscribe from toolbox events
   */
  offEvent(event: string, callback: (...args: unknown[]) => void): void {
    this.off(event, callback);
  }
}

// Create singleton instance
const api = new PPToolBoxAPI();

/**
 * Commands API
 */
export namespace commands {
  const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

  /**
   * Register a command handler
   */
  export function registerCommand(
    command: string,
    callback: (...args: unknown[]) => unknown
  ): { dispose: () => void } {
    registeredCommands.set(command, callback);

    return {
      dispose: () => {
        registeredCommands.delete(command);
      },
    };
  }

  /**
   * Execute a command
   */
  export async function executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    const handler = registeredCommands.get(command);
    if (!handler) {
      throw new Error(`Command not found: ${command}`);
    }
    return handler(...args);
  }
}

/**
 * Window API
 */
export namespace window {
  /**
   * Show notification
   */
  export async function showInformationMessage(message: string): Promise<void> {
    await api.showNotification({
      title: 'Information',
      body: message,
      type: 'info',
    });
  }

  /**
   * Show warning message
   */
  export async function showWarningMessage(message: string): Promise<void> {
    await api.showNotification({
      title: 'Warning',
      body: message,
      type: 'warning',
    });
  }

  /**
   * Show error message
   */
  export async function showErrorMessage(message: string): Promise<void> {
    await api.showNotification({
      title: 'Error',
      body: message,
      type: 'error',
    });
  }

  /**
   * Copy to clipboard
   */
  export async function copyToClipboard(text: string): Promise<void> {
    await api.copyToClipboard(text);
  }
}

/**
 * Workspace API
 */
export namespace workspace {
  /**
   * Save file with content
   */
  export async function saveFile(defaultPath: string, content: string | Buffer): Promise<string | null> {
    return api.saveFile(defaultPath, content);
  }
}

/**
 * Events API
 */
export namespace events {
  /**
   * Subscribe to an event
   */
  export function onEvent(event: string, callback: (...args: unknown[]) => void): { dispose: () => void } {
    api.onEvent(event, callback);
    
    return {
      dispose: () => {
        api.offEvent(event, callback);
      },
    };
  }

  /**
   * Emit a custom event
   */
  export async function emitEvent(event: string, data: unknown): Promise<void> {
    await api.emitEvent(event, data);
  }

  /**
   * Get event history
   */
  export async function getEventHistory(limit?: number): Promise<unknown[]> {
    return api.getEventHistory(limit);
  }
}

/**
 * Available event names
 */
export enum EventType {
  TOOL_LOADED = 'tool:loaded',
  TOOL_UNLOADED = 'tool:unloaded',
  CONNECTION_CREATED = 'connection:created',
  CONNECTION_UPDATED = 'connection:updated',
  CONNECTION_DELETED = 'connection:deleted',
  SETTINGS_UPDATED = 'settings:updated',
  NOTIFICATION_SHOWN = 'notification:shown',
}

// Export the main API object as default
export default api;
