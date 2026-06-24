#!/usr/bin/env node

/**
 * Power Platform ToolBox CLI - Headless MCP Tool Execution
 *
 * This entry point provides a pure Node.js CLI for running tools in headless mode
 * without requiring Electron GUI. It initializes the core managers needed for:
 * - Tool registry and discovery
 * - MCP server (for external agent invocation)
 * - Tool execution (headless mode)
 * - Connection and authentication management
 * - Invocation logging and job tracking
 *
 * Usage:
 *   pptb-cli serve --port 7340
 *   pptb-cli invoke <toolId> --input '{"key":"value"}' --token <token>
 *   pptb-cli job-status <jobId> --token <token>
 */

import { CLI_COMMANDS, CLI_CONSTANTS, EXIT_CODES } from "./constants";
import { CliError, createLogger, formatErrorMessage, loadEnvironmentConfig, parseArguments, printHelp, printVersion } from "./utils";

/**
 * Entry point for CLI application
 */
async function main(): Promise<void> {
    try {
        // Load environment configuration
        const env = loadEnvironmentConfig();

        // Parse command line arguments
        const argv = process.argv.slice(2);
        const { command, options } = parseArguments(argv);

        // Create logger based on log level
        const logLevel = (options["log-level"] as string) || CLI_CONSTANTS.LOG_LEVELS.INFO;
        const logger = createLogger(logLevel);

        logger.info(`[CLI] Power Platform ToolBox CLI starting in headless mode`);
        logger.debug(`[CLI] Command: ${command}`);
        logger.debug(`[CLI] Options: ${JSON.stringify(options)}`);

        // Handle help and version commands
        if (command === CLI_COMMANDS.HELP || options.help) {
            printHelp();
            process.exit(EXIT_CODES.SUCCESS);
        }

        if (command === CLI_COMMANDS.VERSION || options.version) {
            printVersion();
            process.exit(EXIT_CODES.SUCCESS);
        }

        // Route to appropriate command handler
        switch (command) {
            case CLI_COMMANDS.SERVE:
                await handleServeCommand(options, env, logger);
                break;

            case CLI_COMMANDS.INVOKE:
                await handleInvokeCommand(options, env, logger);
                break;

            case CLI_COMMANDS.JOB_STATUS:
                await handleJobStatusCommand(options, env, logger);
                break;

            case CLI_COMMANDS.CONFIG:
                await handleConfigCommand(options, env, logger);
                break;

            default:
                logger.error(`Unknown command: ${command}`);
                printHelp();
                process.exit(EXIT_CODES.INVALID_ARGUMENTS);
        }
    } catch (error) {
        const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.GENERAL_ERROR;
        const message = formatErrorMessage(error);
        process.stderr.write(`${message}\n`);
        process.exit(exitCode);
    }
}

/**
 * Handle 'serve' command - start MCP server in headless mode
 */
async function handleServeCommand(options: Record<string, string | boolean | number>, _env: Record<string, string>, logger: any): Promise<void> {
    const port = (options.port as number) || CLI_CONSTANTS.DEFAULT_MCP_PORT;
    const host = (options.host as string) || CLI_CONSTANTS.DEFAULT_MCP_HOST;

    logger.info(`[CLI] Starting MCP server on ${host}:${port}`);

    // TODO: Phase 2 - Initialize managers and start MCP server
    // For now, just log that we would start the server
    logger.info(`[CLI] MCP server would be started here (implementation in Phase 2)`);
    logger.info(`[CLI] Server listening on http://${host}:${port}`);

    // Keep the process alive
    await new Promise(() => {
        // Never resolves - server runs indefinitely
    });
}

/**
 * Handle 'invoke' command - invoke a headless tool
 */
async function handleInvokeCommand(_options: Record<string, string | boolean | number>, _env: Record<string, string>, logger: any): Promise<void> {
    // Get toolId from positional argument
    // Note: options.args is not provided in this simplified version
    // Will be enhanced in Phase 7

    logger.info(`[CLI] Invoking headless tool`);
    logger.info(`[CLI] Tool invocation would be handled here (implementation in Phase 3)`);

    throw new CliError("Tool invocation not yet implemented", EXIT_CODES.GENERAL_ERROR);
}

/**
 * Handle 'job-status' command - get status of a tool invocation job
 */
async function handleJobStatusCommand(_options: Record<string, string | boolean | number>, _env: Record<string, string>, logger: any): Promise<void> {
    logger.info(`[CLI] Checking job status`);
    logger.info(`[CLI] Job status polling would be handled here (implementation in Phase 5)`);

    throw new CliError("Job status polling not yet implemented", EXIT_CODES.GENERAL_ERROR);
}

/**
 * Handle 'config' command - manage CLI configuration
 */
async function handleConfigCommand(_options: Record<string, string | boolean | number>, _env: Record<string, string>, logger: any): Promise<void> {
    logger.info(`[CLI] Managing configuration`);
    logger.info(`[CLI] Configuration management would be handled here (implementation in Phase 7)`);

    throw new CliError("Configuration management not yet implemented", EXIT_CODES.GENERAL_ERROR);
}

// Run the CLI
main().catch((error) => {
    const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.GENERAL_ERROR;
    process.stderr.write(`${formatErrorMessage(error)}\n`);
    process.exit(exitCode);
});
