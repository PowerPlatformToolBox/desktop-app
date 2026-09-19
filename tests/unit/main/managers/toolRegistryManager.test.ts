import { getSupabaseMaturityStatus } from "../../../../src/main/managers/toolRegistryManager";

describe("ToolRegistryManager maturity mapping", () => {
    it("reads a one-to-one Supabase relation object", () => {
        expect(getSupabaseMaturityStatus({ status: "verified" })).toBe("verified");
    });

    it("reads the array relation shape returned by some Supabase queries", () => {
        expect(getSupabaseMaturityStatus([{ status: "unverified" }])).toBe("unverified");
    });

    it.each([undefined, [], {}])("returns no maturity for a missing relation", (relation) => {
        expect(getSupabaseMaturityStatus(relation)).toBeUndefined();
    });
});
