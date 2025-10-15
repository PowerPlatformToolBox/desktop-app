/**
 * Type definitions for the ToolBox application
 */

/**
 * Represents a tool that can be loaded into the ToolBox
 */
export interface Tool {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  settings?: ToolSettings;
  main: string; // Entry point for the tool
}

/**
 * Tool-specific settings
 */
export interface ToolSettings {
  [key: string]: unknown;
}

/**
 * User settings for the ToolBox application
 */
export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  autoUpdate: boolean;
  lastUsedTools: string[];
  connections: DataverseConnection[];
  installedTools: string[]; // List of installed tool package names
}

/**
 * Dataverse connection configuration
 */
export interface DataverseConnection {
  id: string;
  name: string;
  url: string;
  environment: 'Dev' | 'Test' | 'UAT' | 'Production';
  clientId?: string;
  tenantId?: string;
  createdAt: string;
  lastUsedAt?: string;
  isActive?: boolean;
}

/**
 * Notification options
 */
export interface NotificationOptions {
  title: string;
  body: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // Duration in milliseconds, 0 for persistent
}

/**
 * Event types that can be emitted by the ToolBox API
 */
export enum ToolBoxEvent {
  TOOL_LOADED = 'tool:loaded',
  TOOL_UNLOADED = 'tool:unloaded',
  CONNECTION_CREATED = 'connection:created',
  CONNECTION_UPDATED = 'connection:updated',
  CONNECTION_DELETED = 'connection:deleted',
  SETTINGS_UPDATED = 'settings:updated',
  NOTIFICATION_SHOWN = 'notification:shown',
}

/**
 * Event payload for ToolBox events
 */
export interface ToolBoxEventPayload {
  event: ToolBoxEvent;
  data: unknown;
  timestamp: string;
}

/**
 * Tool Host IPC Protocol
 */

/**
 * Message types for Tool Host communication
 */
export enum ToolHostMessageType {
  // Requests from Tool Host to Main
  REQUEST = 'request',
  RESPONSE = 'response',
  EVENT = 'event',
  ERROR = 'error',
  
  // Tool lifecycle
  ACTIVATE = 'activate',
  DEACTIVATE = 'deactivate',
  
  // API calls
  API_CALL = 'api:call',
}

/**
 * Tool Host IPC message structure
 */
export interface ToolHostMessage {
  type: ToolHostMessageType;
  id: string; // Unique message ID for request/response correlation
  toolId: string; // ID of the tool sending/receiving the message
  method?: string; // API method being called
  args?: unknown[]; // Arguments for the method
  result?: unknown; // Result of the method call
  error?: string; // Error message if any
  timestamp: number;
}

/**
 * Tool Host context provided to each tool
 */
export interface ToolHostContext {
  toolId: string;
  extensionPath: string;
  globalState: ToolStateStorage;
  workspaceState: ToolStateStorage;
  subscriptions: { dispose(): void }[];
}

/**
 * Tool state storage interface
 */
export interface ToolStateStorage {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
  keys(): readonly string[];
}

/**
 * Tool activation function signature
 */
export type ToolActivationFunction = (context: ToolHostContext) => void | Promise<void>;

/**
 * Tool deactivation function signature
 */
export type ToolDeactivationFunction = () => void | Promise<void>;
