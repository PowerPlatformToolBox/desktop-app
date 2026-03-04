#!/usr/bin/env node
// @ts-check
"use strict";

/**
 * pptb-validate - CLI tool for validating Power Platform ToolBox tool packages
 *
 * Usage:
 *   pptb-validate [options] [path/to/package.json]
 *
 * Options:
 *   --skip-url-checks   Skip URL accessibility checks (faster, offline-friendly)
 *   --json              Output results as JSON
 *   --help, -h          Show help information
 */

const fs = require("fs");
const path = require("path");
const { validatePackageJson } = require("../lib/validate");

// ANSI colour helpers – gracefully degrade when colours are unsupported
const NO_COLOR = !process.stdout.isTTY || process.env.NO_COLOR;
const c = {
    red: (s) => (NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`),
    yellow: (s) => (NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`),
    green: (s) => (NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`),
    cyan: (s) => (NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`),
    bold: (s) => (NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`),
    dim: (s) => (NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`),
};

function printHelp() {
    console.log(`
${c.bold("pptb-validate")} – Power Platform ToolBox tool package validator

${c.bold("USAGE")}
  pptb-validate [options] [path/to/package.json]

  When no path is given the tool looks for ${c.cyan("package.json")} in the current
  working directory.

${c.bold("OPTIONS")}
  ${c.cyan("--skip-url-checks")}   Skip URL reachability checks (faster, works offline)
  ${c.cyan("--json")}              Print results as a JSON object instead of human-readable text
  ${c.cyan("--help")}, ${c.cyan("-h")}          Show this help message

${c.bold("EXAMPLES")}
  pptb-validate
  pptb-validate ./my-tool/package.json
  pptb-validate --skip-url-checks
  pptb-validate --json

${c.bold("ADD TO YOUR TOOL'S package.json")}
  ${c.dim(`"scripts": {
    "pptb-validate": "pptb-validate"
  }`)}

  Then run: ${c.cyan("npm run pptb-validate")}
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes("--help") || args.includes("-h")) {
        printHelp();
        process.exit(0);
    }

    const skipUrlChecks = args.includes("--skip-url-checks");
    const jsonOutput = args.includes("--json");

    // Find the package.json path from positional args (skip flags)
    const positional = args.filter((a) => !a.startsWith("-"));
    let packageJsonPath = positional[0] || path.join(process.cwd(), "package.json");

    // Resolve to absolute path
    if (!path.isAbsolute(packageJsonPath)) {
        packageJsonPath = path.resolve(process.cwd(), packageJsonPath);
    }

    // --- Load package.json ---
    if (!fs.existsSync(packageJsonPath)) {
        if (jsonOutput) {
            console.log(JSON.stringify({ valid: false, errors: [`package.json not found at: ${packageJsonPath}`], warnings: [] }, null, 2));
        } else {
            console.error(c.red(`✖ package.json not found at: ${packageJsonPath}`));
        }
        process.exit(1);
    }

    let packageJson;
    try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (jsonOutput) {
            console.log(JSON.stringify({ valid: false, errors: [`Failed to parse package.json: ${message}`], warnings: [] }, null, 2));
        } else {
            console.error(c.red(`✖ Failed to parse package.json: ${message}`));
        }
        process.exit(1);
    }

    // --- Run validation ---
    if (!jsonOutput) {
        console.log();
        console.log(c.bold("Power Platform ToolBox – Tool Validator"));
        console.log(c.dim("─".repeat(45)));
        console.log(c.dim(`File: ${packageJsonPath}`));
        if (skipUrlChecks) {
            console.log(c.yellow("⚠  URL reachability checks are skipped"));
        }
        console.log();
    }

    let result;
    try {
        result = await validatePackageJson(packageJson, { skipUrlChecks });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (jsonOutput) {
            console.log(JSON.stringify({ valid: false, errors: [`Unexpected validation error: ${message}`], warnings: [] }, null, 2));
        } else {
            console.error(c.red(`✖ Unexpected validation error: ${message}`));
        }
        process.exit(1);
    }

    // --- Output results ---
    if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
    }

    // Human-readable output
    if (result.errors.length > 0) {
        console.log(c.bold(c.red(`Errors (${result.errors.length})`)));
        result.errors.forEach((e) => console.log(`  ${c.red("✖")} ${e}`));
        console.log();
    }

    if (result.warnings.length > 0) {
        console.log(c.bold(c.yellow(`Warnings (${result.warnings.length})`)));
        result.warnings.forEach((w) => console.log(`  ${c.yellow("⚠")} ${w}`));
        console.log();
    }

    if (result.valid) {
        const info = result.packageInfo;
        console.log(c.green(c.bold("✔ Validation passed")));
        console.log();
        console.log(c.bold("Package summary"));
        console.log(c.dim("─".repeat(45)));
        console.log(`  Name        : ${info.name}`);
        console.log(`  Version     : ${info.version}`);
        console.log(`  Display name: ${info.displayName}`);
        console.log(`  Description : ${info.description}`);
        console.log(`  License     : ${info.license}`);
        console.log(`  Contributors: ${info.contributors.map((c) => c.name).join(", ")}`);
        if (info.icon) {
            console.log(`  Icon        : ${info.icon}`);
        }
        if (info.features) {
            console.log(`  Features    : multiConnection=${info.features.multiConnection}${info.features.minAPI ? `, minAPI=${info.features.minAPI}` : ""}`);
        }
        console.log();
    } else {
        console.log(c.red(c.bold("✖ Validation failed")));
        console.log();
        console.log(c.dim("Fix the errors listed above and re-run pptb-validate before publishing."));
        console.log();
    }

    process.exit(result.valid ? 0 : 1);
}

main().catch((err) => {
    console.error(c.red(`✖ Fatal error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
});
