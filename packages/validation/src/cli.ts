#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { validatePackageJson, validatePPTBConfig } from "./validate";
import { readCatalogUrl, resolveCapabilityCatalog, type CatalogResolution } from "./catalog-node";
import { createPPTBConfigSchema } from "./schema";

async function main(): Promise<void> {
    const cwd = process.cwd();
    const args = process.argv.slice(2);
    const offline = args.includes("--offline");
    const requireLive = args.includes("--require-live");
    const command = args.find((arg) => !arg.startsWith("--"));
    if (args.includes("--help")) {
        process.stdout.write(
            "Usage: pptb-validate [capabilities|schema] [--offline|--require-live]\n" +
                "Configure PPTB_CAPABILITY_CATALOG_URL in the environment or project .env.\n" +
                "capabilities: list approved tags. schema: write the current config JSON Schema to stdout.\n" +
                "--offline: use cached/bundled catalog. --require-live: fail unless the current catalog can be fetched.\n",
        );
        return;
    }
    if (args.filter((arg) => !arg.startsWith("--")).length > 1 || (command !== undefined && command !== "capabilities" && command !== "schema")) {
        throw new Error("Unknown command. Run pptb-validate --help for usage.");
    }
    if (args.some((arg) => arg.startsWith("--") && arg !== "--offline" && arg !== "--require-live")) throw new Error("Unknown option. Run pptb-validate --help for usage.");
    if (offline && requireLive) throw new Error("--offline and --require-live cannot be combined");
    const resolveCatalog = async (): Promise<CatalogResolution> => {
        const result = await resolveCapabilityCatalog({ url: await readCatalogUrl(cwd), offline, requireLive });
        process.stderr.write(
            `Capability catalog: ${result.source}; revision ${result.catalog.revision}; published ${result.catalog.publishedAt}${result.fetchedAt ? `; fetched ${result.fetchedAt}` : ""}\n`,
        );
        result.warnings.forEach((warning) => process.stderr.write(`Warning: ${warning}\n`));
        return result;
    };
    if (command) {
        const { catalog } = await resolveCatalog();
        if (command === "schema") {
            process.stdout.write(`${JSON.stringify(createPPTBConfigSchema(catalog), null, 4)}\n`);
        } else {
            catalog.capabilities.forEach((entry) => process.stdout.write(`${entry.tag}\t${entry.description}\n`));
            if (catalog.capabilities.length === 0) process.stdout.write("No active capabilities are approved.\n");
        }
        return;
    }
    const requiredCatalog = requireLive ? await resolveCatalog() : undefined;

    // Print the pptb-validate version from package.json
    const cliPackageJsonPath = path.join(__dirname, "..", "package.json");
    if (fs.existsSync(cliPackageJsonPath)) {
        const cliPackageJson = JSON.parse(fs.readFileSync(cliPackageJsonPath, "utf-8"));
        process.stdout.write(`pptb-validate version ${cliPackageJson.version}\n`);
    }

    const packageJsonPath = path.join(cwd, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        process.stderr.write("No package.json found in current directory\n");
        process.exit(1);
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const packageResult = await validatePackageJson(packageJson, { skipUrlChecks: false });

    process.stdout.write("\npackage.json validation\n");
    printResult(packageResult);

    const pptbConfigPath = path.join(cwd, "pptb.config.json");
    if (fs.existsSync(pptbConfigPath)) {
        const pptbConfig = JSON.parse(fs.readFileSync(pptbConfigPath, "utf-8"));
        const resolved = requiredCatalog ?? (pptbConfig?.invocation?.capabilities !== undefined ? await resolveCatalog() : undefined);
        const configResult = validatePPTBConfig(pptbConfig, packageJson, { capabilityCatalog: resolved?.catalog });
        process.stdout.write("\npptb.config.json validation\n");
        printResult(configResult);

        if (!configResult.valid) process.exit(1);
    } else {
        process.stdout.write("\nNo pptb.config.json found (optional)\n");
    }

    if (!packageResult.valid) process.exit(1);
}

function printResult(result: { valid: boolean; errors: string[]; warnings: string[] }): void {
    if (result.errors.length === 0 && result.warnings.length === 0) {
        process.stdout.write("  All checks passed\n");
        return;
    }
    result.errors.forEach((error) => process.stderr.write(`  Error: ${error}\n`));
    result.warnings.forEach((warning) => process.stderr.write(`  Warning: ${warning}\n`));
    if (result.valid) process.stdout.write("  Valid (with warnings)\n");
}

main().catch((err) => {
    process.stderr.write(`Validation failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
});
