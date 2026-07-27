import { ChildProcessWithoutNullStreams, execFileSync, spawn } from "child_process";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { basename, isAbsolute } from "path";
import { logInfo, logWarn } from "../../common/logger";
import { Terminal, TerminalCommandResult, TerminalOptions } from "../../common/types";
import { BLOCKED_NPX_FLAGS, BLOCKED_TERMINAL_COMMANDS, BLOCKED_TERMINAL_ENV_KEYS } from "../constants";

type ShellType = "posix" | "pwsh" | "cmd";

interface ParsedTerminalCommand {
    executable: string;
    args: string[];
    /** The validated command string as entered by the user (leading/trailing whitespace trimmed), written verbatim to the shell's stdin. */
    rawCommand: string;
}

interface QueuedCommand {
    parsedCommand: ParsedTerminalCommand;
    commandId: string;
    resolve: (result: TerminalCommandResult) => void;
}

interface PendingCommand {
    commandId: string;
    resolve: (result: TerminalCommandResult) => void;
    output: string;
    stderrBuffer: string;
}

interface SanitizedTerminalEnv {
    env?: Record<string, string>;
    strippedKeys: string[];
}

function getNormalizedExecutableCandidates(rawExecutable: string): Set<string> {
    const lowerRaw = rawExecutable.toLowerCase();
    const pathSegments = lowerRaw.split(/[/\\]/);
    const base = (pathSegments[pathSegments.length - 1] || lowerRaw).trim();
    const baseWithoutExe = base.replace(/\.exe$/, "");

    const candidates = new Set<string>([lowerRaw, base, baseWithoutExe]);
    if (baseWithoutExe && !baseWithoutExe.endsWith(".exe")) {
        candidates.add(`${baseWithoutExe}.exe`);
    }

    return candidates;
}

function sanitizeTerminalEnv(env?: Record<string, string>): SanitizedTerminalEnv {
    if (!env) {
        return { strippedKeys: [] };
    }

    const strippedKeys: string[] = [];
    const sanitizedEnv = Object.entries(env).reduce<Record<string, string>>((result, [key, value]) => {
        const normalizedKey = key.toUpperCase();
        if (BLOCKED_TERMINAL_ENV_KEYS.has(normalizedKey)) {
            strippedKeys.push(key);
            return result;
        }

        result[key] = value;
        return result;
    }, {});

    return {
        env: Object.keys(sanitizedEnv).length > 0 ? sanitizedEnv : undefined,
        strippedKeys,
    };
}

function tokenizeTerminalCommand(command: string): string[] {
    const tokens: string[] = [];
    let currentToken = "";
    let activeQuote: '"' | "'" | null = null;
    let isEscaped = false;

    for (let index = 0; index < command.length; index += 1) {
        const char = command[index];

        if (isEscaped) {
            currentToken += char;
            isEscaped = false;
            continue;
        }

        if (char === "\\" && activeQuote !== "'") {
            const nextChar = command[index + 1];
            // Commands are executed with shell:false, so tokenization only needs to preserve quoted
            // arguments and escaped whitespace/quotes without emulating full shell parsing.
            if (nextChar === '"' || nextChar === "'" || nextChar === "\\" || /\s/.test(nextChar || "")) {
                isEscaped = true;
                continue;
            }
        }

        if (activeQuote) {
            if (char === activeQuote) {
                activeQuote = null;
            } else {
                currentToken += char;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            activeQuote = char;
            continue;
        }

        if (/\s/.test(char)) {
            if (currentToken) {
                tokens.push(currentToken);
                currentToken = "";
            }
            continue;
        }

        currentToken += char;
    }

    if (activeQuote) {
        throw new Error("Terminal command contains an unterminated quote.");
    }

    if (isEscaped) {
        throw new Error("Terminal command ends with an incomplete escape sequence.");
    }

    if (currentToken) {
        tokens.push(currentToken);
    }

    return tokens;
}

/**
 * Checks for unquoted command substitution patterns ($(…) and backticks) that could
 * be used to execute blocked commands indirectly when the raw command string is passed
 * directly to the shell's stdin.
 */
function checkNoUnquotedSubstitution(command: string): void {
    let activeQuote: '"' | "'" | null = null;
    let isEscaped = false;

    for (let i = 0; i < command.length; i++) {
        const char = command[i];
        const nextChar = command[i + 1];

        if (isEscaped) {
            isEscaped = false;
            continue;
        }

        if (char === "\\" && activeQuote !== "'") {
            isEscaped = true;
            continue;
        }

        if (activeQuote) {
            if (char === activeQuote) activeQuote = null;
            continue;
        }

        if (char === '"' || char === "'") {
            activeQuote = char;
            continue;
        }

        if (char === "`") {
            throw new Error("Terminal command contains unquoted command substitution.");
        }
        if (char === "$" && nextChar === "(") {
            throw new Error("Terminal command contains unquoted command substitution.");
        }
    }
}

/**
 * Splits a command string on unquoted shell sequence/pipe operators: &&, ||, ;, |
 * Respects single and double quoted strings.  Returns trimmed, non-empty segments.
 */
function splitCompoundCommand(command: string): string[] {
    const segments: string[] = [];
    let current = "";
    let activeQuote: '"' | "'" | null = null;
    let isEscaped = false;

    for (let i = 0; i < command.length; i++) {
        const char = command[i];
        const nextChar = command[i + 1];

        if (isEscaped) {
            current += char;
            isEscaped = false;
            continue;
        }

        if (char === "\\" && activeQuote !== "'") {
            isEscaped = true;
            current += char;
            continue;
        }

        if (activeQuote) {
            if (char === activeQuote) activeQuote = null;
            current += char;
            continue;
        }

        if (char === '"' || char === "'") {
            activeQuote = char;
            current += char;
            continue;
        }

        // && or || (two-character operators)
        if ((char === "&" && nextChar === "&") || (char === "|" && nextChar === "|")) {
            if (current.trim()) segments.push(current.trim());
            current = "";
            i++; // skip the second operator character
            continue;
        }

        // Single | (pipe) or ; (sequence)
        if (char === "|" || char === ";") {
            if (current.trim()) segments.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim()) segments.push(current.trim());
    return segments.length > 0 ? segments : [command.trim()];
}

/**
 * Validates a single command segment (executable + args) against the blocklist.
 * A "segment" is one command from a compound expression, e.g. `git status` from
 * `cd /tmp && git status`.
 */
function validateCommandSegment(segment: string): void {
    const trimmed = segment.trim();
    if (!trimmed) return;

    const tokens = tokenizeTerminalCommand(trimmed);
    if (tokens.length === 0) return;

    const rawExecutable = tokens[0];
    const executable = rawExecutable.toLowerCase();
    const normalizedExecutableCandidates = getNormalizedExecutableCandidates(rawExecutable);

    if (/[;&|<>]/.test(rawExecutable)) {
        throw new Error(`Terminal command executable "${rawExecutable}" contains shell metacharacters.`);
    }

    if ([...normalizedExecutableCandidates].some((candidate) => BLOCKED_TERMINAL_COMMANDS.has(candidate))) {
        throw new Error(`Blocked unsafe terminal command "${rawExecutable}". Shell interpreters and privilege-escalation tools are not allowed.`);
    }

    if (executable === "npx" && tokens.slice(1).some((arg) => BLOCKED_NPX_FLAGS.has(arg.toLowerCase()))) {
        throw new Error("Blocked unsafe npx invocation. Shell execution flags are not allowed.");
    }
}

function parseTerminalCommand(command: string): ParsedTerminalCommand {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
        throw new Error("Terminal command cannot be empty.");
    }

    if (/[\r\n\u2028\u2029]/.test(trimmedCommand) || trimmedCommand.includes("\u000b") || trimmedCommand.includes("\u000c")) {
        throw new Error("Multi-line terminal commands are not allowed.");
    }

    // Reject unquoted command substitution so blocked commands cannot be reached via $() or backticks.
    checkNoUnquotedSubstitution(trimmedCommand);

    // Split on compound operators and validate every constituent command.
    const segments = splitCompoundCommand(trimmedCommand);
    for (const segment of segments) {
        validateCommandSegment(segment);
    }

    // Extract the first segment's executable for logging; the raw command string is passed
    // verbatim to the shell so that operators like && and || are handled natively.
    const firstTokens = tokenizeTerminalCommand(segments[0]);
    return {
        executable: firstTokens[0].toLowerCase(),
        args: firstTokens.slice(1),
        rawCommand: trimmedCommand,
    };
}

// Test-only helpers used by unit tests to validate command hardening behavior without spawning a shell process.
export const terminalManagerTestUtils = {
    parseTerminalCommand,
    validateCommandSegment,
    getNormalizedExecutableCandidates,
};

function getShellType(shell: string): ShellType {
    const name = basename(shell)
        .toLowerCase()
        .replace(/\.exe$/, "");
    if (name === "pwsh" || name === "powershell") return "pwsh";
    if (name === "cmd") return "cmd";
    return "posix";
}

function getShellInteractiveArgs(shellType: ShellType): string[] {
    if (shellType === "pwsh") return ["-NoLogo"];
    // cmd.exe with no args starts an interactive session that reads from stdin
    if (shellType === "cmd") return [];
    return ["-i"];
}

/**
 * Builds the text written to the shell's stdin to execute a validated command.
 * The raw command string is passed verbatim so that shell operators (&&, ||, ;, |)
 * are handled natively by the persistent shell process.
 * A unique sentinel marker is written to stderr after the command so the caller
 * can detect completion and extract the exit code without polluting visible output.
 */
function buildShellCommandInput(parsedCommand: ParsedTerminalCommand, commandId: string, shellType: ShellType): string {
    const cmd = parsedCommand.rawCommand;
    const sentinel = `PPTB_CMD_END_${commandId}`;

    if (shellType === "pwsh") {
        // Capture $? and $LASTEXITCODE immediately before any conditional to prevent them being overwritten
        return `${cmd}\n$__pptb_ok__ = $?; $__pptb_lec__ = $LASTEXITCODE; $__pptb__ = if ($null -ne $__pptb_lec__) { $__pptb_lec__ } elseif ($__pptb_ok__) { 0 } else { 1 }; [Console]::Error.WriteLine("${sentinel}_$__pptb__")\n`;
    }
    if (shellType === "cmd") {
        // Use >&2 (without the explicit 1) for stdout-to-stderr redirection in cmd.exe
        return `${cmd}\r\necho ${sentinel}_%ERRORLEVEL% >&2\r\n`;
    }
    // POSIX: capture $? immediately after the command; write sentinel to stderr via printf
    return `${cmd}\n__pptb__=$?; printf '%s\\n' "${sentinel}_$__pptb__" >&2\n`;
}

/**
 * Resolves the preferred shell requested by a tool, falling back to the system
 * default if the requested shell cannot be found on the current machine.
 */
function resolveShell(requestedShell: string, defaultShell: string, terminalId: string): string {
    // Reject paths containing null bytes or obvious shell metacharacters to prevent injection
    if (/[\0;&|<>]/.test(requestedShell)) {
        logWarn(`Requested shell "${requestedShell}" contains invalid characters for terminal ${terminalId}; falling back to ${defaultShell}`);
        return defaultShell;
    }

    if (isAbsolute(requestedShell)) {
        if (existsSync(requestedShell)) {
            return requestedShell;
        }
        logWarn(`Requested shell "${requestedShell}" not found for terminal ${terminalId}; falling back to ${defaultShell}`);
        return defaultShell;
    }

    try {
        const finder = process.platform === "win32" ? "where" : "which";
        execFileSync(finder, [requestedShell], { encoding: "utf8", timeout: 3000 });
        return requestedShell;
    } catch {
        logWarn(`Requested shell "${requestedShell}" not found in PATH for terminal ${terminalId}; falling back to ${defaultShell}`);
        return defaultShell;
    }
}

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
     * Create a new terminal for a tool
     */
    async createTerminal(toolId: string, toolInstanceId: string | null, options: TerminalOptions): Promise<Terminal> {
        const terminalId = randomUUID();
        const shell = options.shell ? resolveShell(options.shell, this.defaultShell, terminalId) : this.defaultShell;
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

        const { env: sanitizedEnv, strippedKeys: strippedEnvKeys } = sanitizeTerminalEnv(options.env);
        if (strippedEnvKeys.length > 0) {
            logWarn(`Ignoring restricted terminal environment variables for terminal ${terminalId}: ${strippedEnvKeys.join(", ")}`);
        }

        const instance = new TerminalInstance(terminal, sanitizedEnv);
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

        let parsedCommand: ParsedTerminalCommand;
        try {
            parsedCommand = parseTerminalCommand(command);
        } catch (error) {
            const blockedResult: TerminalCommandResult = {
                terminalId,
                commandId: randomUUID(),
                exitCode: 1,
                error: error instanceof Error ? error.message : "Blocked unsafe terminal command.",
            };

            this.emit("terminal:error", { terminalId, toolId: instance.terminal.toolId, error: blockedResult.error });
            this.emit("terminal:command:completed", { ...blockedResult, toolId: instance.terminal.toolId });
            return blockedResult;
        }

        return instance.executeCommand(parsedCommand);
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
 * Internal terminal instance that owns a persistent shell process.
 * Commands are written to the shell's stdin and completion is detected
 * via a unique sentinel marker written to stderr.
 */
class TerminalInstance extends EventEmitter {
    public terminal: Terminal;
    private shellProcess: ChildProcessWithoutNullStreams | null = null;
    private env?: Record<string, string>;
    private commandQueue: QueuedCommand[] = [];
    private isProcessing = false;
    private pendingCommand: PendingCommand | null = null;
    private shellType: ShellType;
    /** Holds partial stdout data while a command is executing so sentinel echo lines can be filtered out before display. */
    private stdoutLineBuffer: string = "";

    constructor(terminal: Terminal, env?: Record<string, string>) {
        super();
        this.terminal = terminal;
        this.env = env;
        this.shellType = getShellType(terminal.shell);
        this.startShellProcess();
    }

    /**
     * Start the persistent shell process so the terminal is not blank when a tool loads.
     * Wires up stdout/stderr for display output and sentinel-based command completion.
     */
    startShellProcess(): void {
        const processEnv = {
            ...process.env,
            ...this.env,
            TERM: process.env.TERM || "xterm-256color",
            COLORTERM: process.env.COLORTERM || "truecolor",
        };

        logInfo(`[Terminal ${this.terminal.id}] Starting shell: ${this.terminal.shell}`);

        this.shellProcess = spawn(this.terminal.shell, getShellInteractiveArgs(this.shellType), {
            cwd: this.terminal.cwd,
            env: processEnv,
            shell: false,
        });

        this.shellProcess.stdout.on("data", (data: Buffer) => {
            this.handleStdoutChunk(data.toString());
        });

        this.shellProcess.stderr.on("data", (data: Buffer) => {
            this.handleStderrChunk(data.toString());
        });

        this.shellProcess.on("error", (error: Error) => {
            logWarn(`[Terminal ${this.terminal.id}] Shell process error: ${error.message}`);
            this.emit("error", error.message);
            if (this.pendingCommand) {
                this.failPendingCommand(error.message);
            }
        });

        this.shellProcess.on("close", () => {
            logInfo(`[Terminal ${this.terminal.id}] Shell process exited`);
            this.shellProcess = null;
            if (this.pendingCommand) {
                this.failPendingCommand("Shell process exited unexpectedly.");
            }
        });
    }

    /**
     * Handle a chunk of stdout output from the shell.
     * When a command is executing, stdout is buffered by line so that any echoed sentinel
     * command text (written to stdin for exit-code tracking) can be stripped before display.
     * When no command is in flight the data is forwarded immediately.
     */
    private handleStdoutChunk(text: string): void {
        if (!this.pendingCommand) {
            // No command in flight — pass through immediately.
            this.emit("output", text);
            return;
        }

        // Buffer and filter sentinel echoes while a command is executing.
        this.stdoutLineBuffer += text;

        const lastNewline = this.stdoutLineBuffer.lastIndexOf("\n");
        if (lastNewline === -1) {
            // No complete line yet; hold in buffer until the next chunk.
            return;
        }

        const completeLines = this.stdoutLineBuffer.substring(0, lastNewline + 1);
        this.stdoutLineBuffer = this.stdoutLineBuffer.substring(lastNewline + 1);

        // Split on newlines, drop sentinel echo lines, then rejoin.
        const filtered = completeLines
            .split("\n")
            .filter((line) => !this.isSentinelEchoLine(line))
            .join("\n");

        if (filtered) {
            this.emit("output", filtered);
            this.pendingCommand.output += filtered;
        }
    }

    /**
     * Returns true when a stdout line is the shell's echo of the internal sentinel command
     * that was written to stdin for exit-code detection.  Such lines must not be shown to
     * the user because they are an implementation detail of the terminal manager.
     */
    private isSentinelEchoLine(line: string): boolean {
        // Strip a trailing \r so both \n and \r\n line endings are handled.
        const trimmed = line.replace(/\r$/, "");
        if (this.shellType === "pwsh") {
            return trimmed.includes("$__pptb_ok__ = $?;");
        }
        if (this.shellType === "cmd") {
            return trimmed.includes("echo PPTB_CMD_END_");
        }
        // posix
        return trimmed.includes("__pptb__=$?;");
    }

    /**
     * Handle a chunk of stderr output from the shell.
     * Normal stderr lines are forwarded to the terminal display.
     * Sentinel lines (written after each command) are used to detect completion
     * and extract the exit code without polluting the visible output.
     */
    private handleStderrChunk(text: string): void {
        if (!this.pendingCommand) {
            this.emit("output", text);
            return;
        }

        this.pendingCommand.stderrBuffer += text;
        const sentinel = `PPTB_CMD_END_${this.pendingCommand.commandId}_`;
        const sentinelIdx = this.pendingCommand.stderrBuffer.indexOf(sentinel);

        if (sentinelIdx !== -1) {
            // Emit any stderr output that preceded the sentinel line
            const beforeSentinel = this.pendingCommand.stderrBuffer.substring(0, sentinelIdx);
            if (beforeSentinel) {
                this.emit("output", beforeSentinel);
                this.pendingCommand.output += beforeSentinel;
            }
            const afterSentinel = this.pendingCommand.stderrBuffer.substring(sentinelIdx + sentinel.length);
            const exitCodeMatch = afterSentinel.match(/^(\d+)/);
            // Default to 1 (failure) if the exit code portion is malformed or missing
            if (!exitCodeMatch) {
                logWarn(`Malformed command sentinel for command ${this.pendingCommand.commandId} in terminal ${this.terminal.id}; defaulting exit code to 1`);
            }
            const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 1;
            this.resolvePendingCommand(exitCode);
        } else {
            // Sentinel not yet received; emit complete stderr lines in real-time
            const lastNewline = this.pendingCommand.stderrBuffer.lastIndexOf("\n");
            if (lastNewline !== -1) {
                const safeToEmit = this.pendingCommand.stderrBuffer.substring(0, lastNewline + 1);
                this.emit("output", safeToEmit);
                this.pendingCommand.output += safeToEmit;
                this.pendingCommand.stderrBuffer = this.pendingCommand.stderrBuffer.substring(lastNewline + 1);
            }
        }
    }

    /**
     * Flushes any remaining buffered stdout, filtering sentinel echo lines.
     * Called before a pending command is resolved or failed so no output is lost.
     */
    private flushStdoutBuffer(): void {
        if (!this.stdoutLineBuffer || !this.pendingCommand) return;
        const remaining = this.stdoutLineBuffer;
        this.stdoutLineBuffer = "";
        if (!this.isSentinelEchoLine(remaining)) {
            this.emit("output", remaining);
            this.pendingCommand.output += remaining;
        }
    }

    private resolvePendingCommand(exitCode: number): void {
        if (!this.pendingCommand) return;

        // Flush any stdout that arrived after the last newline boundary.
        this.flushStdoutBuffer();

        const pending = this.pendingCommand;
        this.pendingCommand = null;
        this.isProcessing = false;

        const result: TerminalCommandResult = {
            terminalId: this.terminal.id,
            commandId: pending.commandId,
            output: pending.output,
            exitCode,
        };
        pending.resolve(result);
        this.emit("command:completed", result);
        this.processQueue();
    }

    private failPendingCommand(errorMsg: string): void {
        if (!this.pendingCommand) return;

        // Flush any stdout that arrived after the last newline boundary.
        this.flushStdoutBuffer();

        const pending = this.pendingCommand;
        this.pendingCommand = null;
        this.isProcessing = false;

        const result: TerminalCommandResult = {
            terminalId: this.terminal.id,
            commandId: pending.commandId,
            output: pending.output,
            exitCode: 1,
            error: errorMsg,
        };
        pending.resolve(result);
        this.emit("command:completed", result);
        this.processQueue();
    }

    /**
     * Execute a validated command by writing it to the shell's stdin.
     */
    async executeCommand(parsedCommand: ParsedTerminalCommand): Promise<TerminalCommandResult> {
        const commandId = randomUUID();
        return new Promise<TerminalCommandResult>((resolve) => {
            this.commandQueue.push({ parsedCommand, commandId, resolve });
            this.processQueue();
        });
    }

    /**
     * Dequeue the next command and write it to the shell's stdin.
     */
    private processQueue(): void {
        if (this.isProcessing || this.commandQueue.length === 0) {
            return;
        }

        const queueItem = this.commandQueue.shift()!;

        if (!this.shellProcess || this.shellProcess.stdin.destroyed) {
            const result: TerminalCommandResult = {
                terminalId: this.terminal.id,
                commandId: queueItem.commandId,
                exitCode: 1,
                error: "Shell process is not running.",
            };
            queueItem.resolve(result);
            this.emit("command:completed", result);
            this.processQueue();
            return;
        }

        this.isProcessing = true;
        this.pendingCommand = {
            commandId: queueItem.commandId,
            resolve: queueItem.resolve,
            output: "",
            stderrBuffer: "",
        };

        logInfo(`[Terminal ${this.terminal.id}] Executing: ${queueItem.parsedCommand.executable}`);
        this.shellProcess.stdin.write(buildShellCommandInput(queueItem.parsedCommand, queueItem.commandId, this.shellType));
    }

    /**
     * Kill the shell process and clean up.
     */
    close(): void {
        if (this.shellProcess) {
            this.shellProcess.kill();
            this.shellProcess = null;
        }
    }
}
