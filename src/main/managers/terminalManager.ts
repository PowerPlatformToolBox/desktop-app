import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { captureMessage, logInfo } from "../../common/sentryHelper";
import { Terminal, TerminalCommandResult, TerminalOptions } from "../../common/types";

/**
 * Manages terminal instances for tools
 * Each tool can create its own terminal and execute commands
 */
export class TerminalManager extends EventEmitter {
    private terminals: Map<string, TerminalInstance> = new Map();
    private defaultShell: string;

    constructor() {
        super();
        this.defaultShell = this.getDefaultShell();
    }

    /**
     * Get the default shell for the current platform
     */
    private getDefaultShell(): string {
        if (process.platform === "win32") {
            return process.env.COMSPEC || "cmd.exe";
        } else {
            return process.env.SHELL || "/bin/bash";
        }
    }

    /**
     * Check if a shell exists and is executable
     */
    private async shellExists(shellPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            const testProcess = spawn(shellPath, ["--version"], { stdio: "ignore" });
            testProcess.on("error", () => resolve(false));
            testProcess.on("close", (code) => resolve(code !== null));
        });
    }

    /**
     * Create a new terminal for a tool
     */
    async createTerminal(toolId: string, toolInstanceId: string | null, options: TerminalOptions): Promise<Terminal> {
        const terminalId = randomUUID();
        let shell = options.shell || this.defaultShell;

        // Verify shell exists, fallback to default if not
        if (options.shell && !(await this.shellExists(options.shell))) {
            captureMessage(`Shell ${options.shell} not found, using default shell ${this.defaultShell}`, "warning");
            shell = this.defaultShell;
        }

        const cwd = options.cwd || process.cwd();

        // Default to visible unless explicitly set to false
        const isVisible = options.visible !== undefined ? options.visible : true;

        const terminal: Terminal = {
            id: terminalId,
            name: options.name,
            toolId,
            toolInstanceId: toolInstanceId ?? null,
            shell,
            cwd,
            isVisible,
            createdAt: new Date().toISOString(),
        };

        const instance = new TerminalInstance(terminal, options.env);
        this.terminals.set(terminalId, instance);

        // Forward terminal events with toolId for proper filtering
        instance.on("output", (data) => {
            this.emit("terminal:output", { terminalId, toolId, data });
        });

        instance.on("error", (error) => {
            this.emit("terminal:error", { terminalId, toolId, error });
        });

        instance.on("command:completed", (result) => {
            // Add toolId to result if not already present
            const resultWithToolId = { ...result, toolId };
            this.emit("terminal:command:completed", resultWithToolId);
        });

        this.emit("terminal:created", terminal);
        return terminal;
    }

    /**
     * Execute a command in a terminal
     */
    async executeCommand(terminalId: string, command: string): Promise<TerminalCommandResult> {
        const instance = this.terminals.get(terminalId);
        if (!instance) {
            throw new Error(`Terminal ${terminalId} not found`);
        }

        return instance.executeCommand(command);
    }

    /**
     * Close a terminal
     */
    closeTerminal(terminalId: string): void {
        const instance = this.terminals.get(terminalId);
        if (instance) {
            const toolId = instance.terminal.toolId;
            instance.close();
            this.terminals.delete(terminalId);
            this.emit("terminal:closed", { terminalId, toolId });
        }
    }

    /**
     * Get a terminal by ID
     */
    getTerminal(terminalId: string): Terminal | undefined {
        const instance = this.terminals.get(terminalId);
        return instance?.terminal;
    }

    /**
     * Get all terminals for a specific tool
     */
    getToolTerminals(toolId: string, toolInstanceId?: string | null): Terminal[] {
        const terminals: Terminal[] = [];
        this.terminals.forEach((instance) => {
            if (instance.terminal.toolId === toolId && (!toolInstanceId || instance.terminal.toolInstanceId === toolInstanceId)) {
                terminals.push(instance.terminal);
            }
        });
        return terminals;
    }

    /**
     * Get all terminals
     */
    getAllTerminals(): Terminal[] {
        const terminals: Terminal[] = [];
        this.terminals.forEach((instance) => {
            terminals.push(instance.terminal);
        });
        return terminals;
    }

    /**
     * Set terminal visibility
     */
    setTerminalVisibility(terminalId: string, visible: boolean): void {
        const instance = this.terminals.get(terminalId);
        if (instance) {
            instance.terminal.isVisible = visible;
            this.emit("terminal:visibility:changed", { terminalId, visible });
        }
    }

    /**
     * Close all terminals for a tool
     */
    closeToolTerminals(toolId: string): void {
        const terminalIds: string[] = [];
        this.terminals.forEach((instance, id) => {
            if (instance.terminal.toolId === toolId) {
                terminalIds.push(id);
            }
        });
        terminalIds.forEach((id) => this.closeTerminal(id));
    }

    /**
     * Close all terminals belonging to a specific tool instance
     */
    closeToolInstanceTerminals(toolInstanceId: string): void {
        const terminalIds: string[] = [];
        this.terminals.forEach((instance, id) => {
            if (instance.terminal.toolInstanceId === toolInstanceId) {
                terminalIds.push(id);
            }
        });
        terminalIds.forEach((id) => this.closeTerminal(id));
    }

    /**
     * Close all terminals
     */
    closeAllTerminals(): void {
        const terminalIds = Array.from(this.terminals.keys());
        terminalIds.forEach((id) => this.closeTerminal(id));
    }
}

/**
 * Internal terminal instance that manages a shell process
 */
class TerminalInstance extends EventEmitter {
    public terminal: Terminal;
    private process: ChildProcessWithoutNullStreams | null = null;
    private commandQueue: Array<{ command: string; commandId: string; resolve: (result: TerminalCommandResult) => void; reject: (error: Error) => void }> = [];
    private currentCommand: { commandId: string; output: string; resolve: (result: TerminalCommandResult) => void; reject: (error: Error) => void } | null = null;
    private isProcessing = false;

    constructor(terminal: Terminal, env?: Record<string, string>) {
        super();
        this.terminal = terminal;
        this.startShellProcess(env);
    }

    /**
     * Start the shell process
     */
    private startShellProcess(env?: Record<string, string>): void {
        const shellArgs = this.getShellArgs();

        // Ensure critical environment variables are set for proper shell initialization
        const processEnv = {
            ...process.env,
            ...env,
            // Ensure TERM is set for proper terminal emulation (needed for Oh-My-Posh and colors)
            TERM: process.env.TERM || "xterm-256color",
            // Ensure COLORTERM is set to indicate true color support
            COLORTERM: process.env.COLORTERM || "truecolor",
        };

        // Log shell startup for debugging (can be removed in production)
        logInfo(`[Terminal ${this.terminal.id}] Starting shell: ${this.terminal.shell} with args: ${shellArgs.join(" ")}`);
        logInfo(`[Terminal ${this.terminal.id}] Working directory: ${this.terminal.cwd}`);
        logInfo(`[Terminal ${this.terminal.id}] TERM: ${processEnv.TERM}, COLORTERM: ${processEnv.COLORTERM}`);

        this.process = spawn(this.terminal.shell, shellArgs, {
            cwd: this.terminal.cwd,
            env: processEnv,
            shell: false,
        });

        this.process.stdout.on("data", (data: Buffer) => {
            const output = data.toString();
            this.emit("output", output);

            if (this.currentCommand) {
                this.currentCommand.output += output;
            }
        });

        this.process.stderr.on("data", (data: Buffer) => {
            const output = data.toString();
            this.emit("output", output);

            if (this.currentCommand) {
                this.currentCommand.output += output;
            }
        });

        this.process.on("error", (error: Error) => {
            this.emit("error", error.message);
            if (this.currentCommand) {
                this.currentCommand.reject(error);
                this.currentCommand = null;
            }
        });

        this.process.on("close", (code: number | null) => {
            if (this.currentCommand) {
                const result: TerminalCommandResult = {
                    terminalId: this.terminal.id,
                    commandId: this.currentCommand.commandId,
                    output: this.currentCommand.output,
                    exitCode: code ?? undefined,
                };
                this.currentCommand.resolve(result);
                this.emit("command:completed", result);
                this.currentCommand = null;
            }
        });
    }

    /**
     * Get appropriate shell arguments for interactive mode
     */
    private getShellArgs(): string[] {
        if (process.platform === "win32") {
            // Windows cmd.exe or PowerShell
            if (this.terminal.shell.toLowerCase().includes("powershell")) {
                return ["-NoLogo", "-NoExit"];
            }
            return ["/Q"]; // Quiet mode for cmd
        } else {
            // Unix-like shells - use both login and interactive modes
            // -l loads the login profile (e.g., .bash_profile, .zprofile)
            // -i makes it interactive (loads .bashrc, .zshrc)
            return ["-l", "-i"]; // Login + Interactive mode to load all profiles
        }
    }

    /**
     * Execute a command in the terminal
     */
    async executeCommand(command: string): Promise<TerminalCommandResult> {
        const commandId = randomUUID();

        return new Promise<TerminalCommandResult>((resolve, reject) => {
            this.commandQueue.push({ command, commandId, resolve, reject });
            this.processQueue();
        });
    }

    /**
     * Process the command queue
     */
    private processQueue(): void {
        if (this.isProcessing || this.commandQueue.length === 0 || !this.process) {
            return;
        }

        this.isProcessing = true;
        const queueItem = this.commandQueue.shift()!;
        this.currentCommand = {
            commandId: queueItem.commandId,
            output: "",
            resolve: queueItem.resolve,
            reject: queueItem.reject,
        };

        // Write command to stdin
        const commandWithNewline = queueItem.command + (process.platform === "win32" ? "\r\n" : "\n");
        this.process.stdin.write(commandWithNewline);

        // Set a timeout to resolve the command even if process doesn't close
        setTimeout(() => {
            if (this.currentCommand && this.currentCommand.commandId === queueItem.commandId) {
                const result: TerminalCommandResult = {
                    terminalId: this.terminal.id,
                    commandId: this.currentCommand.commandId,
                    output: this.currentCommand.output,
                };
                this.currentCommand.resolve(result);
                this.emit("command:completed", result);
                this.currentCommand = null;
                this.isProcessing = false;
                this.processQueue();
            }
        }, 5000); // 5 second timeout for command execution
    }

    /**
     * Close the terminal
     */
    close(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}
