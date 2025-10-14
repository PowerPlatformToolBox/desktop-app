import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { Tool } from '../types';

/**
 * Manages tool plugins loaded from npm packages
 */
export class ToolManager extends EventEmitter {
  private tools: Map<string, Tool> = new Map();
  private toolsDirectory: string;

  constructor(toolsDirectory: string) {
    super();
    this.toolsDirectory = toolsDirectory;
    this.ensureToolsDirectory();
  }

  /**
   * Ensure the tools directory exists
   */
  private ensureToolsDirectory(): void {
    if (!fs.existsSync(this.toolsDirectory)) {
      fs.mkdirSync(this.toolsDirectory, { recursive: true });
    }
  }

  /**
   * Load a tool from an npm package
   */
  async loadTool(packageName: string): Promise<Tool> {
    try {
      const toolPath = path.join(this.toolsDirectory, 'node_modules', packageName);
      const packageJsonPath = path.join(toolPath, 'package.json');

      if (!fs.existsSync(packageJsonPath)) {
        throw new Error(`Tool package not found: ${packageName}`);
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      const tool: Tool = {
        id: packageJson.name,
        name: packageJson.displayName || packageJson.name,
        version: packageJson.version,
        description: packageJson.description || '',
        author: packageJson.author || 'Unknown',
        icon: packageJson.icon,
        main: path.join(toolPath, packageJson.main || 'index.js'),
      };

      this.tools.set(tool.id, tool);
      this.emit('tool:loaded', tool);

      return tool;
    } catch (error) {
      throw new Error(`Failed to load tool ${packageName}: ${(error as Error).message}`);
    }
  }

  /**
   * Unload a tool
   */
  unloadTool(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (tool) {
      this.tools.delete(toolId);
      this.emit('tool:unloaded', tool);
    }
  }

  /**
   * Get a loaded tool
   */
  getTool(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all loaded tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if a tool is loaded
   */
  isToolLoaded(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Install a tool via npm
   */
  async installTool(packageName: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const install = spawn(npm, ['install', packageName, '--prefix', this.toolsDirectory]);

      install.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`npm install failed with code ${code}`));
        } else {
          resolve();
        }
      });

      install.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Uninstall a tool via npm
   */
  async uninstallTool(packageName: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const uninstall = spawn(npm, ['uninstall', packageName, '--prefix', this.toolsDirectory]);

      uninstall.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`npm uninstall failed with code ${code}`));
        } else {
          resolve();
        }
      });

      uninstall.on('error', (err: Error) => {
        reject(err);
      });
    });
  }
}
