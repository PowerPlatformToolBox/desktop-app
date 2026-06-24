#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { validatePackageJson, validatePPTBConfig } from "./validate";

async function main(): Promise<void> {
    const cwd = process.cwd();

    // Print the pptb-validate version from package.json
    const cliPackageJsonPath = path.join(__dirname, "..", "package.json");
    if (fs.existsSync(cliPackageJsonPath)) {
        const cliPackageJson = JSON.parse(fs.readFileSync(cliPackageJsonPath, "utf-8"));
        console.log(`🔍 pptb-validate version ${cliPackageJson.version}`);
    }

    const packageJsonPath = path.join(cwd, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        console.error("❌ No package.json found in current directory");
        process.exit(1);
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const packageResult = await validatePackageJson(packageJson, { skipUrlChecks: false });

    console.log("\n📦 package.json validation");
    printResult(packageResult);

    const pptbConfigPath = path.join(cwd, "pptb.config.json");
    if (fs.existsSync(pptbConfigPath)) {
        const pptbConfig = JSON.parse(fs.readFileSync(pptbConfigPath, "utf-8"));
        const configResult = validatePPTBConfig(pptbConfig);
        console.log("\n⚙️  pptb.config.json validation");
        printResult(configResult);

        if (!configResult.valid) process.exit(1);
    } else {
        console.log("\nℹ️  No pptb.config.json found (optional)");
    }

    if (!packageResult.valid) process.exit(1);
}

function printResult(result: { valid: boolean; errors: string[]; warnings: string[] }): void {
    if (result.errors.length === 0 && result.warnings.length === 0) {
        console.log("  ✅ All checks passed");
        return;
    }
    result.errors.forEach((e) => console.error(`  ❌ ${e}`));
    result.warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));
    if (result.valid) console.log("  ✅ Valid (with warnings)");
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
