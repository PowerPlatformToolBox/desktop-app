// scripts/afterPack.js
const { execSync } = require("child_process");
const path = require("path");
const os = require("os");

module.exports = async function (context) {
    try {
        if (os.platform() !== "darwin") {
            console.log("Skipping afterPack macOS steps: not running on macOS.");
            return;
        }

        const appOutDir = context.appOutDir;
        const productName = context.packager.appInfo.productFilename;
        const appPath = path.join(appOutDir, `${productName}.app`);
        console.log("afterPack hook running for:", appPath);

        // Show current extended attributes
        try {
            console.log("xattr before:");
            execSync(`xattr -l "${appPath}" || true`, { stdio: "inherit" });
        } catch (e) {}

        // Remove quarantine recursively
        try {
            console.log("Removing com.apple.quarantine (xattr -cr)...");
            execSync(`xattr -cr "${appPath}"`, { stdio: "inherit" });
            console.log("xattr removal completed.");
        } catch (e) {
            console.warn("xattr removal failed:", e && e.message);
        }

        // Show xattr after removal
        try {
            console.log("xattr after:");
            execSync(`xattr -l "${appPath}" || true`, { stdio: "inherit" });
        } catch (e) {}

        // Verify codesign (will fail if unsigned, expected)
        try {
            console.log("codesign verify (afterPack):");
            execSync(`codesign --verify --deep --strict --verbose=2 "${appPath}" || true`, { stdio: "inherit" });
        } catch (e) {
            console.warn("codesign verification (unsigned) warning:", e && e.message);
        }
    } catch (err) {
        console.error("afterPack hook failed:", err);
    }
};
