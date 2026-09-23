import { compareVerifiedFirst, isVerifiedTool, renderVerifiedBadge } from "../../../src/renderer/utils/toolMaturity";

describe("tool maturity", () => {
    it.each(["Verified", "verified", " VERIFIED "])("recognizes %s as Verified", (maturity) => {
        expect(isVerifiedTool(maturity)).toBe(true);
    });

    it.each([undefined, "", "Unverified", "Community Recommended"])("does not badge %s as Verified", (maturity) => {
        expect(isVerifiedTool(maturity)).toBe(false);
    });

    it("sorts Verified tools before other maturity values", () => {
        expect(compareVerifiedFirst("Verified", "Unverified")).toBeLessThan(0);
        expect(compareVerifiedFirst("Community Recommended", "Verified")).toBeGreaterThan(0);
        expect(compareVerifiedFirst(undefined, "Community Recommended")).toBe(0);
    });

    it("renders an accessible theme-aware badge only for Verified tools", () => {
        const lightBadge = renderVerifiedBadge("Verified", false);
        const darkBadge = renderVerifiedBadge("verified", true);

        expect(lightBadge).toContain('src="icons/light/verified.svg"');
        expect(lightBadge).toContain('aria-label="Verified tools have passed Power Platform ToolBox quality and safety checks."');
        expect(lightBadge).not.toContain(">Verified<");
        expect(darkBadge).toContain('src="icons/dark/verified.svg"');
        expect(renderVerifiedBadge("Community Recommended", false)).toBe("");
    });
});
