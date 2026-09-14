/// <reference types="jest" />

import * as path from "path";
import { describePath, parseLaunchArgs } from "../../../src/main/launchArgs";

const CWD = path.resolve("/projects/workspace");
const HOME = path.resolve("/home/tester");

describe("parseLaunchArgs", () => {
    it("returns defaults when no debug flags are present", () => {
        expect(parseLaunchArgs(["app.exe", "--some-chromium-switch"], CWD, HOME)).toEqual({
            debugToolPath: null,
            debugToolConnection: null,
            openDevTools: false,
        });
    });

    it("parses the space-separated --debug-tool form", () => {
        const result = parseLaunchArgs(["app.exe", "--debug-tool", "my-tool"], CWD, HOME);
        expect(result.debugToolPath).toBe(path.resolve(CWD, "my-tool"));
    });

    it("parses the --debug-tool=<path> form", () => {
        const result = parseLaunchArgs(["app.exe", "--debug-tool=my-tool"], CWD, HOME);
        expect(result.debugToolPath).toBe(path.resolve(CWD, "my-tool"));
    });

    it("resolves '.' against the supplied working directory", () => {
        const result = parseLaunchArgs(["app.exe", "--debug-tool", "."], CWD, HOME);
        expect(result.debugToolPath).toBe(CWD);
    });

    it("expands a leading ~ against the home directory", () => {
        const result = parseLaunchArgs(["app.exe", "--debug-tool", "~/tools/my-tool"], CWD, HOME);
        expect(result.debugToolPath).toBe(path.join(HOME, "tools/my-tool"));
    });

    it("does not consume a following switch as the path value", () => {
        const result = parseLaunchArgs(["app.exe", "--debug-tool", "--devtools"], CWD, HOME);
        expect(result.debugToolPath).toBeNull();
        expect(result.openDevTools).toBe(true);
    });

    it("does not treat --debug-tool-connection as a --debug-tool prefix match", () => {
        const result = parseLaunchArgs(["app.exe", "--debug-tool-connection", "Contoso Dev"], CWD, HOME);
        expect(result.debugToolPath).toBeNull();
        expect(result.debugToolConnection).toBe("Contoso Dev");
    });

    it("parses the --debug-tool-connection=<value> form", () => {
        const result = parseLaunchArgs(["app.exe", "--debug-tool-connection=conn-123"], CWD, HOME);
        expect(result.debugToolConnection).toBe("conn-123");
    });

    it("applies last-one-wins for repeated flags", () => {
        const result = parseLaunchArgs(["app.exe", "--debug-tool", "first", "--debug-tool=second", "--debug-tool-connection", "a", "--debug-tool-connection", "b"], CWD, HOME);
        expect(result.debugToolPath).toBe(path.resolve(CWD, "second"));
        expect(result.debugToolConnection).toBe("b");
    });

    it("scans the whole argv, including entries after Electron switches, and ignores non-strings", () => {
        const argv = ["electron", "--inspect=9229", ".", undefined as unknown as string, "--debug-tool", "my-tool", "--devtools", "--unknown-switch"];
        const result = parseLaunchArgs(argv, CWD, HOME);
        expect(result.debugToolPath).toBe(path.resolve(CWD, "my-tool"));
        expect(result.openDevTools).toBe(true);
    });

    it("rejects empty, null-byte, and absurdly long path values", () => {
        expect(parseLaunchArgs(["app.exe", "--debug-tool="], CWD, HOME).debugToolPath).toBeNull();
        expect(parseLaunchArgs(["app.exe", "--debug-tool", "bad\0path"], CWD, HOME).debugToolPath).toBeNull();
        expect(parseLaunchArgs(["app.exe", "--debug-tool", "x".repeat(4097)], CWD, HOME).debugToolPath).toBeNull();
    });
});

describe("describePath", () => {
    it("returns basename#hash8 and never the full path", () => {
        const described = describePath(path.join(HOME, "tools", "my-tool"));
        expect(described).toMatch(/^my-tool#[0-9a-f]{8}$/);
        expect(described).not.toContain(HOME);
    });

    it("is stable for the same input and differs for different inputs", () => {
        expect(describePath("/a/my-tool")).toBe(describePath("/a/my-tool"));
        expect(describePath("/a/my-tool")).not.toBe(describePath("/b/my-tool"));
    });

    it("returns 'unknown' for empty or non-string input", () => {
        expect(describePath("")).toBe("unknown");
        expect(describePath(undefined as unknown as string)).toBe("unknown");
    });
});
