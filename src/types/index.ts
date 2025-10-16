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
  TERMINAL_CREATED = 'terminal:created',
  TERMINAL_DISPOSED = 'terminal:disposed',
  TERMINAL_DATA = 'terminal:data',
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
 * Tool context provided to tools running in webviews
 */
export interface ToolContext {
  toolId: string;
  connectionUrl: string | null;
  accessToken: string | null;
}

/**
 * Terminal instance configuration
 */
export interface TerminalOptions {
  name?: string;
  shellPath?: string;
  shellArgs?: string[];
  cwd?: string;
  env?: { [key: string]: string };
}

/**
 * Terminal instance information
 */
export interface Terminal {
  id: string;
  name: string;
  shellPath: string;
  processId?: number;
  createdAt: string;
}

/**
 * Command execution result
 */
export interface CommandResult {
  terminalId: string;
  output: string;
  exitCode?: number;
  completed: boolean;
}

/**
 * Available shell information
 */
export interface ShellInfo {
  path: string;
  name: string;
  isDefault: boolean;
}
