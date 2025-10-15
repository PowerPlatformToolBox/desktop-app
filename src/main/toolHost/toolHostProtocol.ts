import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ToolHostMessage, ToolHostMessageType } from '../../types';

/**
 * Tool Host Protocol - Manages secure IPC communication between main process and tool host
 * Similar to VS Code's Extension Host Protocol
 */
export class ToolHostProtocol extends EventEmitter {
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  private requestTimeout = 30000; // 30 seconds

  /**
   * Send a request and wait for response
   */
  async sendRequest(
    toolId: string,
    method: string,
    args: unknown[],
    sendFunction: (message: ToolHostMessage) => void
  ): Promise<unknown> {
    const id = uuidv4();
    const message: ToolHostMessage = {
      type: ToolHostMessageType.REQUEST,
      id,
      toolId,
      method,
      args,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      sendFunction(message);
    });
  }

  /**
   * Handle incoming response
   */
  handleResponse(message: ToolHostMessage): void {
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      console.warn(`Received response for unknown request: ${message.id}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(message.id);

    if (message.type === ToolHostMessageType.ERROR) {
      pending.reject(new Error(message.error || 'Unknown error'));
    } else {
      pending.resolve(message.result);
    }
  }

  /**
   * Create a response message
   */
  createResponse(requestMessage: ToolHostMessage, result: unknown): ToolHostMessage {
    return {
      type: ToolHostMessageType.RESPONSE,
      id: requestMessage.id,
      toolId: requestMessage.toolId,
      result,
      timestamp: Date.now(),
    };
  }

  /**
   * Create an error response message
   */
  createErrorResponse(requestMessage: ToolHostMessage, error: Error): ToolHostMessage {
    return {
      type: ToolHostMessageType.ERROR,
      id: requestMessage.id,
      toolId: requestMessage.toolId,
      error: error.message,
      timestamp: Date.now(),
    };
  }

  /**
   * Create an event message
   */
  createEventMessage(toolId: string, method: string, args: unknown[]): ToolHostMessage {
    return {
      type: ToolHostMessageType.EVENT,
      id: uuidv4(),
      toolId,
      method,
      args,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate message structure
   */
  validateMessage(message: unknown): message is ToolHostMessage {
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
   * Clean up pending requests
   */
  dispose(): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Protocol disposed'));
    }
    this.pendingRequests.clear();
  }
}
