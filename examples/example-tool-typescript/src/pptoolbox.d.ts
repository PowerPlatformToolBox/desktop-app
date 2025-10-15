/**
 * Type definitions for the PowerPlatform ToolBox API
 * This file provides TypeScript type definitions for tools
 */

/**
 * Tool context provided during activation
 */
export interface ToolContext {
  /** Unique identifier for the tool */
  toolId: string;
  
  /** Path to the tool's installation directory */
  extensionPath: string;
  
  /** Global state storage (persists across workspaces) */
  globalState: StateStorage;
  
  /** Workspace state storage (workspace-specific) */
  workspaceState: StateStorage;
  
  /** Array of disposables that will be cleaned up on deactivation */
  subscriptions: Disposable[];
}

/**
 * State storage interface for saving tool data
 */
export interface StateStorage {
  /**
   * Get a value from storage
   * @param key - Storage key
   * @returns The stored value or undefined
   */
  get<T>(key: string): T | undefined;
  
  /**
   * Get a value from storage with a default fallback
   * @param key - Storage key
   * @param defaultValue - Default value if key doesn't exist
   * @returns The stored value or default value
   */
  get<T>(key: string, defaultValue: T): T;
  
  /**
   * Update a value in storage
   * @param key - Storage key
   * @param value - Value to store
   */
  update(key: string, value: unknown): Promise<void>;
  
  /**
   * Get all storage keys
   * @returns Array of all keys
   */
  keys(): readonly string[];
}

/**
 * Disposable interface for cleanup
 */
export interface Disposable {
  /**
   * Dispose of the resource
   */
  dispose(): void;
}

/**
 * Notification options
 */
export interface NotificationOptions {
  title: string;
  body: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

/**
 * Event types that can be emitted by ToolBox
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

/**
 * Commands namespace - Command registration and execution
 */
export namespace commands {
  /**
   * Register a command handler
   * @param command - Command identifier (e.g., 'myTool.action')
   * @param callback - Function to execute when command is invoked
   * @returns Disposable to unregister the command
   */
  export function registerCommand(
    command: string,
    callback: (...args: unknown[]) => unknown | Promise<unknown>
  ): Disposable;

  /**
   * Execute a command
   * @param command - Command identifier
   * @param args - Arguments to pass to the command
   * @returns Result of the command execution
   */
  export function executeCommand(command: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * Window namespace - UI interactions
 */
export namespace window {
  /**
   * Show an information message
   * @param message - Message to display
   */
  export function showInformationMessage(message: string): Promise<void>;

  /**
   * Show a warning message
   * @param message - Message to display
   */
  export function showWarningMessage(message: string): Promise<void>;

  /**
   * Show an error message
   * @param message - Message to display
   */
  export function showErrorMessage(message: string): Promise<void>;

  /**
   * Copy text to clipboard
   * @param text - Text to copy
   */
  export function copyToClipboard(text: string): Promise<void>;
}

/**
 * Workspace namespace - File operations
 */
export namespace workspace {
  /**
   * Save file with dialog
   * @param defaultPath - Default file name
   * @param content - File content (string or Buffer)
   * @returns Path where file was saved, or null if cancelled
   */
  export function saveFile(defaultPath: string, content: string | Buffer): Promise<string | null>;
}

/**
 * Events namespace - Event subscription and emission
 */
export namespace events {
  /**
   * Subscribe to an event
   * @param event - Event type to listen for
   * @param callback - Function to call when event occurs
   * @returns Disposable to unsubscribe
   */
  export function onEvent(
    event: string | EventType,
    callback: (...args: unknown[]) => void
  ): Disposable;

  /**
   * Emit a custom event
   * @param event - Event name
   * @param data - Event data
   */
  export function emitEvent(event: string, data: unknown): Promise<void>;

  /**
   * Get event history
   * @param limit - Maximum number of events to return
   * @returns Array of recent events
   */
  export function getEventHistory(limit?: number): Promise<unknown[]>;
}

/**
 * Tool activation function signature
 */
export type ActivationFunction = (context: ToolContext) => void | Promise<void>;

/**
 * Tool deactivation function signature
 */
export type DeactivationFunction = () => void | Promise<void>;
