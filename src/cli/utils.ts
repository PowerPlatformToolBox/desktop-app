/**
 * CLI Utility functions for argument parsing, logging, and error handling
 */

import * as fs from "fs";
import * as path from "path";
import pino from "pino";
import { CLI_CONSTANTS, EXIT_CODES } from "./constants";

/**
 * Simple argument parser for CLI commands
 */
export interface ParsedArgs {
    command: string;
    args: string[];
    options: Record<string, string | boolean | number>;
}

/**
 * Parse command line arguments
 * @param argv Command line arguments (process.argv.slice(2))
 * @returns Parsed command, args, and options
 */
export function parseArguments(argv: string[]): ParsedArgs {
    const command = argv[0] || "help";
    const args: string[] = [];
    const options: Record<string, string | boolean | number> = {};

    for (let i = 1; i < argv.length; i++) {
        const arg = argv[i];

        if (arg.startsWith("--")) {
            const [key, ...valueParts] = arg.slice(2).split("=");
            const value = valueParts.join("=");

            if (value) {
                // Try to parse as number
                options[key] = isNaN(Number(value)) ? value : Number(value);
            } else {
                options[key] = true;
            }
        } else if (arg.startsWith("-")) {
            // Short options like -p 7340
            const key = arg.slice(1);
            if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
                const value = argv[++i];
                options[key] = isNaN(Number(value)) ? value : Number(value);
            } else {
                options[key] = true;
            }
        } else {
            args.push(arg);
        }
    }

    return { command, args, options };
}

/**
 * Create a logger instance for CLI output
 * @param level Log level (default: info)
 * @returns Pino logger instance
 */
export function createLogger(level: string = CLI_CONSTANTS.LOG_LEVELS.INFO) {
    return pino({ level });
}

/**
 * Custom error class for CLI operations
 */
export class CliError extends Error {
    constructor(
        message: string,
        public readonly exitCode: number = EXIT_CODES.GENERAL_ERROR,
        public readonly context?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "CliError";
    }
}

/**
 * Validate and load environment configuration
 * @param envPath Path to .env file (optional)
 * @returns Environment configuration object
 */
export function loadEnvironmentConfig(envPath?: string): Record<string, string> {
    const config: Record<string, string> = {};

    // Use provided path or default to project root
    const dotenvPath = envPath || path.join(process.cwd(), ".env");

    try {
        if (fs.existsSync(dotenvPath)) {
            const content = fs.readFileSync(dotenvPath, "utf-8");
            content.split("\n").forEach((line) => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith("#")) {
                    const [key, ...valueParts] = trimmed.split("=");
                    const value = valueParts.join("=").replace(/^["']|["']$/g, "");
                    if (key) {
                        config[key] = value;
                    }
                }
            });
        }
    } catch (error) {
        // Ignore if .env doesn't exist, use process.env fallback
    }

    // Merge with process.env (process.env takes precedence)
    Object.entries(process.env).forEach(([key, value]) => {
        if (typeof value === "string") {
            config[key] = value;
        }
    });

    return config;
}

/**
 * Validate that required environment variables are set
 * @param requiredVars Array of required environment variable names
 * @param env Environment object (default: process.env)
 * @throws CliError if any required variable is missing
 */
export function validateRequiredEnv(requiredVars: string[], env: Record<string, string>): void {
    const missing = requiredVars.filter((varName) => !env[varName]);

    if (missing.length > 0) {
        throw new CliError(`Missing required environment variables: ${missing.join(", ")}`, EXIT_CODES.INVALID_ARGUMENTS, { missing });
    }
}

/**
 * Get user data directory path for the application
 * @returns Path to user data directory
 */
export function getUserDataPath(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
    const appDataPath = path.join(homeDir, ".pptb");

    // Ensure directory exists
    if (!fs.existsSync(appDataPath)) {
        fs.mkdirSync(appDataPath, { recursive: true });
    }

    return appDataPath;
}

/**
 * Print help message
 */
export function printHelp(): void {
    process.stdout.write(`
Power Platform ToolBox CLI - Headless Tool Execution

Usage: pptb-cli [command] [options]

Commands:
  serve [options]           Start MCP server in headless mode
    --port <number>         MCP server port (default: 7340)
    --host <string>         MCP server host (default: 127.0.0.1)
    --log-level <level>     Log level: debug, info, warn, error (default: info)

  invoke <toolId> [options] Invoke a headless tool
    --input <json>          Tool input as JSON string
    --token <string>        Authentication token
    --timeout <ms>          Timeout in milliseconds (default: 300000)

  job-status <jobId>        Get status of a tool invocation job
    --token <string>        Authentication token

  config <action> [key] [value]
    set <key> <value>       Set configuration value
    get <key>               Get configuration value

  help                      Show this help message
  version                   Show version information

Options:
  --help, -h                Show this help message
  --version, -v             Show version information
  --verbose                 Enable verbose logging

Examples:
  # Start headless MCP server
  pptb-cli serve --port 7340

  # Invoke a tool
  pptb-cli invoke my-tool --input '{"param":"value"}' --token <token>

  # Check job status
  pptb-cli job-status <jobId> --token <token>
`);
}

/**
 * Print version information
 */
export function printVersion(): void {
    try {
        const packageJsonPath = path.join(__dirname, "../../package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        process.stdout.write(`Power Platform ToolBox CLI v${packageJson.version}\n`);
    } catch {
        process.stdout.write("Power Platform ToolBox CLI (version unknown)\n");
    }
}

/**
 * Format error message for display
 * @param error Error object or message string
 * @returns Formatted error message
 */
export function formatErrorMessage(error: unknown): string {
    if (error instanceof CliError) {
        return `Error: ${error.message}${error.context ? `\n${JSON.stringify(error.context, null, 2)}` : ""}`;
    }

    if (error instanceof Error) {
        return `Error: ${error.message}`;
    }

    return `Error: ${String(error)}`;
}
