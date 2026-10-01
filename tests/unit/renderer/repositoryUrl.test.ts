/// <reference types="jest" />

import { buildToolIssueUrl } from "../../../src/renderer/utils/repositoryUrl";

describe("buildToolIssueUrl", () => {
    it("opens a new issue with the tool name prefilled", () => {
        const url = buildToolIssueUrl("https://github.com/PowerPlatformToolBox/sample-tool", "Sample Tool");

        expect(url).not.toBeNull();
        const parsed = new URL(url!);
        expect(parsed.pathname).toBe("/PowerPlatformToolBox/sample-tool/issues/new");
        expect(parsed.searchParams.get("title")).toBe("[Feedback]: Sample Tool");
        expect(parsed.searchParams.get("body")).toContain("Share feedback");
    });

    it("rejects non-GitHub and invalid repositories", () => {
        expect(buildToolIssueUrl("https://example.com/owner/tool", "Tool")).toBeNull();
        expect(buildToolIssueUrl("javascript:alert(1)", "Tool")).toBeNull();
    });
});
