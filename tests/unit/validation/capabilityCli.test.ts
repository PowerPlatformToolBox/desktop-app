import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("capability CLI", () => {
    let root: string;
    const cli = path.resolve(__dirname, "../../../packages/validation/src/cli.ts");
    const tsconfig = path.resolve(__dirname, "../../../packages/validation/tsconfig.json");

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-capability-cli-"));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    function run(...args: string[]) {
        return spawnSync(process.execPath, ["-r", require.resolve("ts-node/register"), cli, ...args], {
            cwd: root,
            encoding: "utf8",
            timeout: 15000,
            env: { HOME: root, PATH: process.env.PATH, TS_NODE_PROJECT: tsconfig },
        });
    }

    it("lists the bundled tags without a tool package or network access", () => {
        const result = run("capabilities", "--offline");
        expect(result.status).toBe(0);
        expect(result.stdout.trim().split("\n")).toHaveLength(7);
        expect(result.stdout).toContain("fetchxml\tAccept or process FetchXML queries");
        expect(result.stderr).toContain("Capability catalog: bundled");
        expect(result.stderr).toContain("not verified");
    }, 20000);

    it("writes parseable schema JSON to stdout, keeping diagnostics on stderr", () => {
        const result = run("schema", "--offline");
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
            type: "object",
            properties: { invocation: { properties: { capabilities: { uniqueItems: true } } }, agents: { type: "object" }, workers: { type: "object" } },
        });
        expect(result.stderr).toContain("not configured");
    }, 20000);

    it("requires a live catalog even when the tool has no config file", () => {
        fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "test-tool", version: "1.0.0" }));
        const result = run("--require-live");
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("requires PPTB_CAPABILITY_CATALOG_URL");
        expect(result.stdout).not.toContain("passed");
    }, 20000);

    it("reads the project .env and honors offline mode without fetching", () => {
        fs.writeFileSync(path.join(root, ".env"), "PPTB_CAPABILITY_CATALOG_URL=https://catalog.example.test/api/capabilities\n");
        const result = run("capabilities", "--offline");
        expect(result.status).toBe(0);
        expect(result.stderr).toContain("No usable cached catalog");
        expect(result.stderr).not.toContain("not configured");
    }, 20000);

    it.each([["--offline", "--require-live"], ["unknown-command"], ["--unknown-option"]])(
        "rejects invalid CLI arguments %p",
        (...args) => {
            const result = run(...args);
            expect(result.status).toBe(1);
            expect(result.stderr).toContain("Validation failed:");
        },
        20000,
    );
});
