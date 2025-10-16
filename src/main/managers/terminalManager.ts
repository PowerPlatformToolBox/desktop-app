import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { Terminal, TerminalOptions, CommandResult, ShellInfo } from '../../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Manages terminal instances and their lifecycle
 */
export class TerminalManager extends EventEmitter {
  private terminals: Map<string, TerminalInstance> = new Map();
  private commandBuffers: Map<string, CommandBuffer> = new Map();

  constructor() {
    super();
  }

  /**
   * Get available shells on the system
   */
  getAvailableShells(): ShellInfo[] {
    const shells: ShellInfo[] = [];
    const platform = os.platform();
    
    if (platform === 'win32') {
      // Windows shells
      const possibleShells = [
        { path: 'powershell.exe', name: 'PowerShell' },
        { path: 'cmd.exe', name: 'Command Prompt' },
        { path: 'C:\\Program Files\\Git\\bin\\bash.exe', name: 'Git Bash' },
        { path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', name: 'PowerShell' },
        { path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', name: 'PowerShell 7' },
      ];
      
      for (const shell of possibleShells) {
        if (this.shellExists(shell.path)) {
          shells.push({
            ...shell,
            isDefault: shell.path === 'powershell.exe',
          });
        }
      }
    } else if (platform === 'darwin') {
      // macOS shells
      const possibleShells = [
        { path: '/bin/zsh', name: 'Zsh' },
        { path: '/bin/bash', name: 'Bash' },
        { path: '/bin/sh', name: 'Sh' },
      ];
      
      for (const shell of possibleShells) {
        if (this.shellExists(shell.path)) {
          shells.push({
            ...shell,
            isDefault: shell.path === '/bin/zsh',
          });
        }
      }
    } else {
      // Linux/Unix shells
      const possibleShells = [
        { path: '/bin/bash', name: 'Bash' },
        { path: '/bin/zsh', name: 'Zsh' },
        { path: '/bin/sh', name: 'Sh' },
        { path: '/bin/fish', name: 'Fish' },
      ];
      
      for (const shell of possibleShells) {
        if (this.shellExists(shell.path)) {
          shells.push({
            ...shell,
            isDefault: shell.path === '/bin/bash',
          });
        }
      }
    }
    
    // If no shells found, return a default
    if (shells.length === 0) {
      const defaultShell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/sh';
      shells.push({
        path: defaultShell,
        name: path.basename(defaultShell),
        isDefault: true,
      });
    }
    
    return shells;
  }

  /**
   * Check if a shell exists
   */
  private shellExists(shellPath: string): boolean {
    try {
      // On Windows, check if it's a command in PATH or an absolute path
      if (os.platform() === 'win32' && !path.isAbsolute(shellPath)) {
        return true; // Assume commands like 'cmd.exe', 'powershell.exe' exist
      }
      return fs.existsSync(shellPath);
    } catch {
      return false;
    }
  }

  /**
   * Get default shell for the system
   */
  private getDefaultShell(): string {
    const shells = this.getAvailableShells();
    const defaultShell = shells.find(s => s.isDefault);
    return defaultShell ? defaultShell.path : (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash');
  }

  /**
   * Create a new terminal instance
   */
  createTerminal(options: TerminalOptions = {}): Terminal {
    const id = uuidv4();
    const shellPath = options.shellPath || this.getDefaultShell();
    const name = options.name || `Terminal ${this.terminals.size + 1}`;
    
    const ptyProcess = pty.spawn(shellPath, options.shellArgs || [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: options.cwd || process.env.HOME || process.env.USERPROFILE || os.homedir(),
      env: { ...process.env, ...options.env },
    });

    const terminal: Terminal = {
      id,
      name,
      shellPath,
      processId: ptyProcess.pid,
      createdAt: new Date().toISOString(),
    };

    const instance: TerminalInstance = {
      terminal,
      ptyProcess,
    };

    this.terminals.set(id, instance);

    // Handle terminal data output
    ptyProcess.onData((data: string) => {
      this.emit('terminal:data', { terminalId: id, data });
      
      // If there's a command buffer, accumulate output
      const buffer = this.commandBuffers.get(id);
      if (buffer) {
        buffer.output += data;
      }
    });

    // Handle terminal exit
    ptyProcess.onExit(({ exitCode }) => {
      const buffer = this.commandBuffers.get(id);
      if (buffer && !buffer.completed) {
        buffer.completed = true;
        buffer.exitCode = exitCode;
        this.emit('command:completed', {
          terminalId: id,
          output: buffer.output,
          exitCode,
          completed: true,
        });
      }
      
      this.emit('terminal:disposed', { terminalId: id });
      this.terminals.delete(id);
      this.commandBuffers.delete(id);
    });

    this.emit('terminal:created', terminal);
    return terminal;
  }

  /**
   * Write data to a terminal
   */
  writeToTerminal(terminalId: string, data: string): void {
    const instance = this.terminals.get(terminalId);
    if (!instance) {
      throw new Error(`Terminal ${terminalId} not found`);
    }
    instance.ptyProcess.write(data);
  }

  /**
   * Execute a command in a terminal and return the result
   */
  async executeCommand(terminalId: string, command: string, timeoutMs: number = 30000): Promise<CommandResult> {
    const instance = this.terminals.get(terminalId);
    if (!instance) {
      throw new Error(`Terminal ${terminalId} not found`);
    }

    // Create a command buffer to capture output
    const buffer: CommandBuffer = {
      command,
      output: '',
      completed: false,
    };
    this.commandBuffers.set(terminalId, buffer);

    // Write the command
    instance.ptyProcess.write(command + '\r');

    // Wait for completion or timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Timeout - return what we have
        this.commandBuffers.delete(terminalId);
        resolve({
          terminalId,
          output: buffer.output,
          completed: false,
        });
      }, timeoutMs);

      // Listen for completion
      const onComplete = (result: CommandResult) => {
        if (result.terminalId === terminalId) {
          clearTimeout(timeout);
          this.removeListener('command:completed', onComplete);
          this.commandBuffers.delete(terminalId);
          resolve(result);
        }
      };

      this.on('command:completed', onComplete);
    });
  }

  /**
   * Resize a terminal
   */
  resizeTerminal(terminalId: string, cols: number, rows: number): void {
    const instance = this.terminals.get(terminalId);
    if (!instance) {
      throw new Error(`Terminal ${terminalId} not found`);
    }
    instance.ptyProcess.resize(cols, rows);
  }

  /**
   * Dispose a terminal
   */
  disposeTerminal(terminalId: string): void {
    const instance = this.terminals.get(terminalId);
    if (!instance) {
      return;
    }
    
    instance.ptyProcess.kill();
    this.terminals.delete(terminalId);
    this.commandBuffers.delete(terminalId);
    this.emit('terminal:disposed', { terminalId });
  }

  /**
   * Get all active terminals
   */
  getAllTerminals(): Terminal[] {
    return Array.from(this.terminals.values()).map(instance => instance.terminal);
  }

  /**
   * Get a specific terminal
   */
  getTerminal(terminalId: string): Terminal | undefined {
    const instance = this.terminals.get(terminalId);
    return instance?.terminal;
  }

  /**
   * Dispose all terminals
   */
  disposeAll(): void {
    for (const [id] of this.terminals) {
      this.disposeTerminal(id);
    }
  }
}

/**
 * Internal terminal instance
 */
interface TerminalInstance {
  terminal: Terminal;
  ptyProcess: pty.IPty;
}

/**
 * Command buffer for tracking command execution
 */
interface CommandBuffer {
  command: string;
  output: string;
  completed: boolean;
  exitCode?: number;
}
