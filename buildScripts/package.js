#!/usr/bin/env node

const { execSync } = require("child_process");
const os = require("os");

function run(cmd) {
    console.log(`\n> ${cmd}\n`);
    execSync(cmd, { stdio: "inherit" });
}

const platform = os.platform();

switch (platform) {
    case "darwin": // macOS
        run("electron-builder --mac");
        break;

    case "win32": // Windows
        run("electron-builder --win nsis");
        break;

    case "linux": // Linux
        run("electron-builder --linux AppImage");
        break;

    default:
        console.error(`❌ Unsupported platform: ${platform}`);
        process.exit(1);
}
