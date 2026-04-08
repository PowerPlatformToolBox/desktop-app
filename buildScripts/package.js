#!/usr/bin/env node

const { execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

function run(cmd, env = {}) {
    console.log(`\n> ${cmd}\n`);
    execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
}

const platform = os.platform();
const arch = os.arch();

// Get config file from command line argument or use platform defaults
const configArg = process.argv.find((arg) => arg.startsWith("--config="));
const configFile = configArg ? configArg.split("=")[1] : null;

// Detect insider channel flag
const isInsider = process.argv.includes("--insider");
const channelEnv = isInsider ? { PPTB_CHANNEL: "insider" } : {};

if (isInsider) {
    console.log("🔬 Building INSIDER channel");
}

if (configFile) {
    // Validate config file exists
    const configPath = path.resolve(process.cwd(), configFile);
    if (!fs.existsSync(configPath)) {
        console.error(`❌ Error: Config file not found: ${configFile}`);
        console.error(`   Looked for: ${configPath}`);
        process.exit(1);
    }

    // Build with specific config file
    console.log(`📦 Building with config: ${configFile}`);
    run(`pnpm exec electron-builder --config ${configFile}`, channelEnv);
} else {
    // Build with platform defaults, selecting insider configs when --insider is passed
    switch (platform) {
        case "darwin": // macOS
            console.log(`📦 Building for macOS (${arch})`);
            run(
                isInsider
                    ? "pnpm exec electron-builder --config buildScripts/electron-builder-mac-insider.json"
                    : "pnpm exec electron-builder --config buildScripts/electron-builder-mac.json",
                channelEnv,
            );
            break;

        case "win32": // Windows
            console.log(`📦 Building for Windows (${arch})`);
            if (arch === "arm64") {
                run(
                    isInsider
                        ? "pnpm exec electron-builder --config buildScripts/electron-builder-win-arm64-insider.json"
                        : "pnpm exec electron-builder --config buildScripts/electron-builder-win-arm64.json",
                    channelEnv,
                );
            } else {
                run(
                    isInsider
                        ? "pnpm exec electron-builder --config buildScripts/electron-builder-win-insider.json"
                        : "pnpm exec electron-builder --config buildScripts/electron-builder-win.json",
                    channelEnv,
                );
            }
            break;

        case "linux": // Linux
            console.log(`📦 Building for Linux (${arch})`);
            run(
                isInsider
                    ? "pnpm exec electron-builder --config buildScripts/electron-builder-linux-insider.json"
                    : "pnpm exec electron-builder --config buildScripts/electron-builder-linux.json",
                channelEnv,
            );
            break;

        default:
            console.error(`❌ Unsupported platform: ${platform}`);
            process.exit(1);
    }
}
