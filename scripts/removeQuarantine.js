const { execSync } = require("child_process");
const path = require("path");

exports.default = async function (context) {
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.log(`Removing quarantine attribute from: ${appPath}`);
    try {
        execSync(`xattr -dr com.apple.quarantine "${appPath}"`);
        console.log("✅ Quarantine removed successfully.");
    } catch (e) {
        console.warn("⚠️ Failed to remove quarantine:", e.message);
    }
};
