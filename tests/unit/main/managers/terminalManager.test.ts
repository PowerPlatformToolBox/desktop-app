/// <reference types="jest" />

import { terminalManagerTestUtils } from "../../../../src/main/managers/terminalManager";

describe("terminalManager command hardening", () => {
    describe("parseTerminalCommand", () => {
        it("blocks node inline eval payloads", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand('node -e "console.log(1)"')).toThrow('Blocked unsafe terminal command "node"');
        });

        it("blocks node when invoked by absolute path", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand('/usr/local/bin/node -e "console.log(1)"')).toThrow('Blocked unsafe terminal command "/usr/local/bin/node"');
        });

        it("blocks quoted Windows node.exe absolute path payloads", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand('"C:\\Program Files\\nodejs\\node.exe" -e "console.log(1)"')).toThrow(
                'Blocked unsafe terminal command "C:\\Program Files\\nodejs\\node.exe"',
            );
        });

        it("blocks start cmd process spawn payloads", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand("start cmd")).toThrow('Blocked unsafe terminal command "start"');
        });

        it("blocks conhost process spawn payloads", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand("conhost.exe cmd /c echo hi")).toThrow('Blocked unsafe terminal command "conhost.exe"');
        });

        it("blocks dotnet inline compile/execute payloads", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand("dotnet hello.cs")).toThrow('Blocked unsafe terminal command "dotnet"');
        });

        it("blocks blocked executables in compound commands", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand('echo "safe" && node -e "console.log(1)"')).toThrow('Blocked unsafe terminal command "node"');
        });

        it("still allows non-blocked commands", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand("git status")).not.toThrow();
        });

        it("allows npm scripts with safe args", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand("npm run lint -- --fix")).not.toThrow();
        });

        it("allows npx when shell-execution flags are not used", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand("npx prettier --version")).not.toThrow();
        });

        it("allows compound commands when all segments are safe", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand("echo ok && git status || npm -v")).not.toThrow();
        });

        it("allows quoted literals containing shell metacharacters", () => {
            expect(() => terminalManagerTestUtils.parseTerminalCommand('echo "a|b;c&&d"')).not.toThrow();
        });

        it("trims whitespace and preserves the raw command text", () => {
            const parsed = terminalManagerTestUtils.parseTerminalCommand("   git status   ");
            expect(parsed.executable).toBe("git");
            expect(parsed.args).toEqual(["status"]);
            expect(parsed.rawCommand).toBe("git status");
        });
    });

    describe("getNormalizedExecutableCandidates", () => {
        it("normalizes full executable paths to basename variants", () => {
            const candidates = terminalManagerTestUtils.getNormalizedExecutableCandidates("C:\\Windows\\System32\\conhost.exe");
            expect(candidates.has("c:\\windows\\system32\\conhost.exe")).toBe(true);
            expect(candidates.has("conhost.exe")).toBe(true);
            expect(candidates.has("conhost")).toBe(true);
        });
    });
});
