import { EventEmitter } from 'events';
import { Tool, ToolHostMessage, ToolHostMessageType } from '../../types';
import { ToolHostProcess } from './toolHostProcess';
import { ToolBoxAPI } from '../../api/toolboxAPI';

/**
 * Tool Host Manager - Manages all tool host processes
 * Similar to VS Code's Extension Service
 */
export class ToolHostManager extends EventEmitter {
  private toolHosts: Map<string, ToolHostProcess> = new Map();
  private api: ToolBoxAPI;

  constructor(api: ToolBoxAPI) {
    super();
    this.api = api;
  }

  /**
   * Load and start a tool in its own host process
   */
  async loadTool(tool: Tool): Promise<void> {
    // Check if tool is already loaded
    if (this.toolHosts.has(tool.id)) {
      console.warn(`Tool ${tool.id} is already loaded`);
      return;
    }

    // Create tool host process
    const toolHost = new ToolHostProcess(tool);

    // Set up event listeners
    toolHost.on('error', (error) => {
      console.error(`Tool host error for ${tool.id}:`, error);
      this.emit('tool:error', { tool, error });
    });

    toolHost.on('exit', ({ code, signal }) => {
      console.log(`Tool host exited for ${tool.id}: code=${code}, signal=${signal}`);
      this.toolHosts.delete(tool.id);
      this.emit('tool:unloaded', tool);
    });

    toolHost.on('activated', () => {
      this.emit('tool:activated', tool);
    });

    toolHost.on('deactivated', () => {
      this.emit('tool:deactivated', tool);
    });

    // Handle API calls from the tool
    toolHost.on('api-call', (message: ToolHostMessage) => {
      this.handleToolAPICall(tool.id, message);
    });

    // Handle events from the tool
    toolHost.on('tool-event', (message: ToolHostMessage) => {
      this.emit('tool:event', { tool, event: message });
    });

    // Start the tool host process
    await toolHost.start();

    // Store the tool host
    this.toolHosts.set(tool.id, toolHost);

    this.emit('tool:loaded', tool);
  }

  /**
   * Activate a tool (triggers its activation function)
   */
  async activateTool(toolId: string): Promise<void> {
    const toolHost = this.toolHosts.get(toolId);
    if (!toolHost) {
      throw new Error(`Tool ${toolId} is not loaded`);
    }

    await toolHost.activate();
  }

  /**
   * Deactivate a tool
   */
  async deactivateTool(toolId: string): Promise<void> {
    const toolHost = this.toolHosts.get(toolId);
    if (!toolHost) {
      throw new Error(`Tool ${toolId} is not loaded`);
    }

    await toolHost.deactivate();
  }

  /**
   * Unload a tool and stop its host process
   */
  async unloadTool(toolId: string): Promise<void> {
    const toolHost = this.toolHosts.get(toolId);
    if (!toolHost) {
      return;
    }

    await toolHost.stop();
    this.toolHosts.delete(toolId);
  }

  /**
   * Handle API call from a tool
   */
  private async handleToolAPICall(toolId: string, message: ToolHostMessage): Promise<void> {
    const toolHost = this.toolHosts.get(toolId);
    if (!toolHost) {
      console.error(`Tool host not found for ${toolId}`);
      return;
    }

    try {
      let result: unknown;

      // Map API calls to ToolBoxAPI methods
      switch (message.method) {
        case 'showNotification':
          this.api.showNotification(message.args?.[0] as any);
          result = { success: true };
          break;

        case 'copyToClipboard':
          this.api.copyToClipboard(message.args?.[0] as string);
          result = { success: true };
          break;

        case 'saveFile':
          result = await this.api.saveFile(
            message.args?.[0] as string,
            message.args?.[1] as string | Buffer
          );
          break;

        case 'getEventHistory':
          result = this.api.getEventHistory(message.args?.[0] as number | undefined);
          break;

        case 'emitEvent':
          this.api.emitEvent(message.args?.[0] as any, message.args?.[1]);
          result = { success: true };
          break;

        case 'updateGlobalState':
          // Handle global state updates (persistence would be handled by settings manager)
          result = { success: true };
          break;

        default:
          throw new Error(`Unknown API method: ${message.method}`);
      }

      // Send response back to tool
      const response: ToolHostMessage = {
        type: ToolHostMessageType.RESPONSE,
        id: message.id,
        toolId: message.toolId,
        result,
        timestamp: Date.now(),
      };
      toolHost.sendMessage(response);
    } catch (error) {
      // Send error response back to tool
      const errorResponse: ToolHostMessage = {
        type: ToolHostMessageType.ERROR,
        id: message.id,
        toolId: message.toolId,
        error: (error as Error).message,
        timestamp: Date.now(),
      };
      toolHost.sendMessage(errorResponse);
    }
  }

  /**
   * Execute a command contributed by a tool
   */
  async executeCommand(toolId: string, command: string, ...args: unknown[]): Promise<unknown> {
    const toolHost = this.toolHosts.get(toolId);
    if (!toolHost) {
      throw new Error(`Tool ${toolId} is not loaded`);
    }

    return toolHost.callAPI(command, args);
  }

  /**
   * Get all loaded tools
   */
  getLoadedTools(): Tool[] {
    return Array.from(this.toolHosts.values()).map(host => host.getTool());
  }

  /**
   * Check if a tool is loaded
   */
  isToolLoaded(toolId: string): boolean {
    return this.toolHosts.has(toolId);
  }

  /**
   * Get a specific tool host
   */
  getToolHost(toolId: string): ToolHostProcess | undefined {
    return this.toolHosts.get(toolId);
  }

  /**
   * Dispose all tool hosts
   */
  async dispose(): Promise<void> {
    const unloadPromises = Array.from(this.toolHosts.keys()).map(toolId =>
      this.unloadTool(toolId)
    );
    await Promise.all(unloadPromises);
    this.toolHosts.clear();
  }
}
