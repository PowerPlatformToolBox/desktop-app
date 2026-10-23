import * as fs from "node:fs/promises";
import * as path from "node:path";
import { format, resolveConfig } from "prettier";
import { BUNDLED_CAPABILITY_CATALOG, parseCapabilityCatalog } from "./capabilities";
import { createPPTBConfigSchema } from "./schema";
import { readCatalogUrl, resolveCapabilityCatalog } from "./catalog-node";

async function main(): Promise<void> {
    const refresh = process.argv.includes("--refresh");
    if (refresh && process.argv.includes("--check")) throw new Error("--refresh and --check cannot be combined");
    const root = path.resolve(__dirname, "../../..");
    const formatting = await resolveConfig(path.join(root, "package.json"));
    if (!formatting) throw new Error("Could not find repository Prettier configuration");
    const resolution = refresh ? await resolveCapabilityCatalog({ url: await readCatalogUrl(root), requireLive: true }) : undefined;
    if (resolution) resolution.warnings.forEach((warning) => process.stderr.write(`Warning: ${warning}\n`));
    const catalog = parseCapabilityCatalog(resolution?.catalog ?? BUNDLED_CAPABILITY_CATALOG);
    if (refresh) await fs.writeFile(path.join(__dirname, "../src/bundled-capabilities.json"), await format(JSON.stringify(catalog), { ...formatting, parser: "json" }), "utf8");
    const schema = `${JSON.stringify(createPPTBConfigSchema(catalog), null, 4)}\n`;
    const types = `// Generated from the bundled capability catalog by @pptb/validate. Do not edit.\n// Catalog revision: ${catalog.revision}\nexport type KnownCapabilityTag = ${catalog.capabilities.map((entry) => JSON.stringify(entry.tag)).join(" | ") || "never"};\n`;
    const outputs = [
        [path.join(__dirname, "capability-catalog.json"), `${JSON.stringify(catalog, null, 4)}\n`],
        [path.join(__dirname, "pptb.config.schema.json"), schema],
        [path.join(__dirname, "../../types/pptb.config.schema.json"), schema],
        [path.join(__dirname, "../../types/capabilityTags.d.ts"), types],
    ];
    for (const [file, content] of outputs) {
        const formatted = await format(content, { ...formatting, parser: file.endsWith(".json") ? "json" : "typescript" });
        if (process.argv.includes("--check")) {
            if (path.dirname(file) === __dirname) continue;
            const existing = await fs.readFile(file, "utf8");
            const matches = file.endsWith(".json") ? JSON.stringify(JSON.parse(existing)) === JSON.stringify(JSON.parse(formatted)) : existing === formatted;
            if (!matches) throw new Error(`Generated capability artifact is out of date: ${file}`);
        } else {
            await fs.writeFile(file, formatted, "utf8");
        }
    }
}

main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
