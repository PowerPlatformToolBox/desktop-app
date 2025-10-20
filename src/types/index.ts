/**
 * Type definitions for the ToolBox application
 */

/**
 * Content Security Policy configuration for a tool
 */
export interface ToolCSPConfig {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'connect-src'?: string[];
  'img-src'?: string[];
  'font-src'?: string[];
  'frame-src'?: string[];
  'media-src'?: string[];
  'object-src'?: string[];
  'worker-src'?: string[];
  'base-uri'?: string[];
  'form-action'?: string[];
}

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
  csp?: ToolCSPConfig;
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
  terminalFont: string;
  lastUsedTools: string[];
  connections: DataverseConnection[];
  installedTools: string[]; // List of installed tool package names
}

/**
 * Authentication type for Dataverse connection
 */
export type AuthenticationType = 'interactive' | 'clientSecret' | 'usernamePassword';

/**
 * Dataverse connection configuration
 */
export interface DataverseConnection {
  id: string;
  name: string;
  url: string;
  environment: 'Dev' | 'Test' | 'UAT' | 'Production';
  authenticationType: AuthenticationType;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  username?: string;
  password?: string;
  createdAt: string;
  lastUsedAt?: string;
  isActive?: boolean;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
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
  TERMINAL_CLOSED = 'terminal:closed',
  TERMINAL_OUTPUT = 'terminal:output',
  TERMINAL_COMMAND_COMPLETED = 'terminal:command:completed',
  TERMINAL_ERROR = 'terminal:error',
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
 * Terminal configuration options
 */
export interface TerminalOptions {
  name: string;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Terminal instance
 */
export interface Terminal {
  id: string;
  name: string;
  toolId: string;
  shell: string;
  cwd: string;
  isVisible: boolean;
  createdAt: string;
}

/**
 * Terminal command execution result
 */
export interface TerminalCommandResult {
  terminalId: string;
  commandId: string;
  output?: string;
  exitCode?: number;
  error?: string;
}

/**
 * Terminal event types
 */
export enum TerminalEvent {
  TERMINAL_CREATED = 'terminal:created',
  TERMINAL_CLOSED = 'terminal:closed',
  TERMINAL_OUTPUT = 'terminal:output',
  TERMINAL_COMMAND_COMPLETED = 'terminal:command:completed',
  TERMINAL_ERROR = 'terminal:error',
}
