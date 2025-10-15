import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ToolHostMessage, ToolHostMessageType, Tool } from '../../types';
import { ToolHostProtocol } from './toolHostProtocol';

/**
 * Tool Host Process - Manages a separate Node.js process for running tools in isolation
 * Similar to VS Code's Extension Host process
 */
export class ToolHostProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private protocol: ToolHostProtocol;
  private tool: Tool;
  private isActive = false;

  constructor(tool: Tool) {
    super();
    this.tool = tool;
    this.protocol = new ToolHostProtocol();

    // Forward protocol events
    this.protocol.on('error', (error) => this.emit('error', error));
  }

  /**
   * Start the tool host process
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Tool host process already started');
    }

    // Fork a new Node.js process for the tool host
    const toolHostRunner = path.join(__dirname, 'toolHostRunner.js');
    
    this.process = fork(toolHostRunner, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      execArgv: ['--no-warnings'], // Reduce noise
      env: {
        ...process.env,
        TOOLBOX_TOOL_ID: this.tool.id,
        TOOLBOX_TOOL_PATH: this.tool.main,
        TOOLBOX_EXTENSION_PATH: path.dirname(this.tool.main),
      },
    });

    // Set up IPC message handling
    this.process.on('message', (message: unknown) => {
      this.handleMessage(message);
    });

    this.process.on('error', (error) => {
      console.error(`Tool host process error for ${this.tool.id}:`, error);
      this.emit('error', error);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`Tool host process exited for ${this.tool.id}: code=${code}, signal=${signal}`);
      this.cleanup();
      this.emit('exit', { code, signal });
    });

    // Wait for the process to be ready
    await this.waitForReady();
  }

  /**
   * Wait for tool host process to be ready
   */
  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tool host process startup timeout'));
      }, 10000);

      const handler = (message: unknown) => {
        if (this.protocol.validateMessage(message)) {
          const msg = message as ToolHostMessage;
          if (msg.type === ToolHostMessageType.EVENT && msg.method === 'ready') {
            clearTimeout(timeout);
            this.process?.off('message', handler);
            resolve();
          }
        }
      };

      this.process?.on('message', handler);
    });
  }

  /**
   * Activate the tool
   */
  async activate(): Promise<void> {
    if (this.isActive) {
      return;
    }

    if (!this.process) {
      throw new Error('Tool host process not started');
    }

    await this.protocol.sendRequest(
      this.tool.id,
      'activate',
      [],
      (msg) => this.process?.send(msg)
    );

    this.isActive = true;
    this.emit('activated');
  }

  /**
   * Deactivate the tool
   */
  async deactivate(): Promise<void> {
    if (!this.isActive || !this.process) {
      return;
    }

    try {
      await this.protocol.sendRequest(
        this.tool.id,
        'deactivate',
        [],
        (msg) => this.process?.send(msg)
      );
    } catch (error) {
      console.error(`Error deactivating tool ${this.tool.id}:`, error);
    }

    this.isActive = false;
    this.emit('deactivated');
  }

  /**
   * Send an API call to the tool
   */
  async callAPI(method: string, args: unknown[]): Promise<unknown> {
    if (!this.process) {
      throw new Error('Tool host process not started');
    }

    return this.protocol.sendRequest(
      this.tool.id,
      method,
      args,
      (msg) => this.process?.send(msg)
    );
  }

  /**
   * Handle incoming message from tool host process
   */
  private handleMessage(message: unknown): void {
    if (!this.protocol.validateMessage(message)) {
      console.warn('Received invalid message from tool host process:', message);
      return;
    }

    const msg = message as ToolHostMessage;

    switch (msg.type) {
      case ToolHostMessageType.RESPONSE:
      case ToolHostMessageType.ERROR:
        this.protocol.handleResponse(msg);
        break;

      case ToolHostMessageType.API_CALL:
        // Tool is calling back to main process
        this.emit('api-call', msg);
        break;

      case ToolHostMessageType.EVENT:
        // Tool is emitting an event
        this.emit('tool-event', msg);
        break;

      default:
        console.warn('Unhandled message type:', msg.type);
    }
  }

  /**
   * Send a message to the tool host process
   */
  sendMessage(message: ToolHostMessage): void {
    if (!this.process) {
      throw new Error('Tool host process not started');
    }
    this.process.send(message);
  }

  /**
   * Stop the tool host process
   */
  async stop(): Promise<void> {
    if (this.isActive) {
      await this.deactivate();
    }

    if (this.process) {
      this.process.kill();
      this.cleanup();
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.protocol.dispose();
    this.process = null;
    this.isActive = false;
  }

  /**
   * Check if the process is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Get tool information
   */
  getTool(): Tool {
    return this.tool;
  }
}
