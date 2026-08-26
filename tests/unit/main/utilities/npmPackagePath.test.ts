import { resolveNpmPackageDirectoryName } from "../../../../src/main/utilities/npmPackagePath";

describe("resolveNpmPackageDirectoryName", () => {
    it.each([
        ["@scope/tool", "@scope/tool"],
        ["@scope/tool@1.2.3", "@scope/tool"],
        ["@scope/tool@beta", "@scope/tool"],
        ["tool", "tool"],
        ["tool@1.2.3", "tool"],
        ["tool@beta", "tool"],
    ])("resolves %s to %s", (packageName, expected) => {
        expect(resolveNpmPackageDirectoryName(packageName)).toBe(expected);
    });
});
