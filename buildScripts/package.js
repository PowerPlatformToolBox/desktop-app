#!/usr/bin/env node

const { execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

function run(cmd) {
    console.log(`\n> ${cmd}\n`);
    execSync(cmd, { stdio: "inherit" });
}

const platform = os.platform();
const arch = os.arch();

// Get config file from command line argument or use platform defaults
const configArg = process.argv.find((arg) => arg.startsWith("--config="));
const configFile = configArg ? configArg.split("=")[1] : null;

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
    run(`electron-builder --config ${configFile}`);
} else {
    // Build with platform defaults
    switch (platform) {
        case "darwin": // macOS
            console.log(`📦 Building for macOS (${arch})`);
            run("electron-builder --config electron-builder-mac.json");
            break;

        case "win32": // Windows
            console.log(`📦 Building for Windows (${arch})`);
            if (arch === "arm64") {
                run("electron-builder --config electron-builder-win-arm64.json");
            } else {
                run("electron-builder --config electron-builder-win.json");
            }
            break;

        case "linux": // Linux
            console.log(`📦 Building for Linux (${arch})`);
            run("electron-builder --config electron-builder-linux.json");
            break;

        default:
            console.error(`❌ Unsupported platform: ${platform}`);
            process.exit(1);
    }
}
