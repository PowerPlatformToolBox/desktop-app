import { validatePPTBConfig, type PPTBConfig } from "../../../packages/validation/src/validate";

describe("validatePPTBConfig agents.headless", () => {
    it("allows configs without agents", () => {
        expect(validatePPTBConfig({}).valid).toBe(true);
    });

    it.each([true, false])("accepts headless: %s", (headless) => {
        expect(validatePPTBConfig({ agents: { version: "1.0.0", headless } })).toMatchObject({ valid: true, errors: [] });
    });

    it("requires headless when agents is present", () => {
        const config = { agents: { version: "1.0.0" } } as PPTBConfig;
        expect(validatePPTBConfig(config)).toMatchObject({ valid: false, errors: ["agents.headless is required"] });
    });

    it.each([null, "false", 0, [], {}])("rejects non-boolean headless: %p", (headless) => {
        const config = { agents: { version: "1.0.0", headless } } as unknown as PPTBConfig;
        expect(validatePPTBConfig(config)).toMatchObject({ valid: false, errors: ["agents.headless must be a boolean (true or false)"] });
    });
});
