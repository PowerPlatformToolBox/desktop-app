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
