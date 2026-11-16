import { resolveToolApis } from "../../../packages/validation/src/apiFeatures";
import { getRequiredApis } from "../../../src/renderer/utils/connectionApis";

describe("API manifest compatibility", () => {
    it("preserves legacy required PP alongside optional Azure declarations", () => {
        expect(resolveToolApis({ enabledForPowerPlatformAPI: true, apis: { arm: {}, graph: { scopes: ["User.Read"] } } })).toEqual({
            errors: [],
            apis: { pp: { required: true }, arm: { required: false }, graph: { required: false, scopes: ["User.Read"] } },
        });
        expect(getRequiredApis({ enabledForPowerPlatformAPI: true, apis: { arm: {} } })).toEqual(["pp"]);
    });

    it("uses explicit declarations for optional access and required banner hints", () => {
        const features = { apis: { pp: {}, arm: { required: true }, graph: { required: true, scopes: ["Reports.Read.All"] } } };
        expect(resolveToolApis(features)).toEqual({
            errors: [],
            apis: { pp: { required: false }, arm: { required: true }, graph: { required: true, scopes: ["Reports.Read.All"] } },
        });
        expect(getRequiredApis(features)).toEqual(["arm", "graph"]);
        expect(getRequiredApis()).toEqual([]);
    });

    it("accepts matching dual declarations without changing legacy semantics", () => {
        expect(resolveToolApis({ enabledForPowerPlatformAPI: true, apis: { pp: { required: true }, arm: {}, graph: { scopes: ["User.Read"] } } }).errors).toEqual([]);
    });

    it.each([
        { enabledForPowerPlatformAPI: true, apis: { pp: { required: false } } },
        { enabledForPowerPlatformAPI: false, apis: { pp: { required: true } } },
    ])("rejects conflicting declarations without granting host access: %j", (features) => {
        const result = resolveToolApis(features);
        expect(result.apis).toEqual({});
        expect(result.errors.join(" ")).toContain("conflicts");
    });

    it.each([{ arm: true }, { graph: ["User.Read"] }, {}, undefined])("rejects the removed interim Azure schema: %j", (azure) => {
        const result = resolveToolApis({ azure, apis: { arm: { required: true } } });
        expect(result.apis).toEqual({});
        expect(result.errors.join(" ")).toContain("features.azure is not supported");
    });

    it.each([
        { graph: true },
        { graph: { required: true } },
        { graph: { scopes: [] } },
        { graph: { scopes: ["User.ReadWrite.All"] } },
        { graph: { scopes: ["https://graph.microsoft.com/User.Read"] } },
        { graph: { scopes: Array(21).fill("User.Read") } },
        { arm: { scopes: ["User.Read"] } },
        { arm: { required: "true" } },
        { pp: false },
        { typo: {} },
        [],
        null,
    ])("rejects malformed or unsafe declarations: %j", (apis) => {
        const result = resolveToolApis({ apis });
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.apis).toEqual({});
    });
});
