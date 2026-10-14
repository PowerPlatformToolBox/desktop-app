import { resolveConnectionRequirements, resolveConnectionSlots } from "../../../src/common/connectionSlots";
import { validateConnectionAssignments } from "../../../src/common/connectionCompatibility";
import type { Connection } from "../../../src/common/types/connection";
import type { ToolFeatures } from "../../../src/common/types/tool";

const features: ToolFeatures = {
    connections: {
        slots: [
            { label: "Optional accounts", required: false },
            { label: "F&O customers", connectionTypes: ["financeOperations"] },
        ],
    },
};
const connections = new Map<string, Connection>([
    ["dv", { id: "dv", name: "Shared name", url: "https://dv.example", authenticationType: "interactive" } as Connection],
    ["fo", { id: "fo", name: "Shared name", url: "https://fo.example", connectionType: "financeOperations", authenticationType: "interactive" } as Connection],
]);
const getConnection = (id: string) => connections.get(id);

describe("explicit connection requirements", () => {
    it("defaults labels, products and required status without mutating the manifest", () => {
        const input: ToolFeatures = { connections: { slots: [{}, { label: "  Customers  ", required: false, connectionTypes: ["financeOperations"] }] } };
        const original = JSON.stringify(input);
        expect(resolveConnectionRequirements(input)).toEqual({
            explicit: true,
            min: 1,
            max: 2,
            slots: [
                { label: "Primary", connectionTypes: ["dataverse"], required: true },
                { label: "Customers", connectionTypes: ["financeOperations"], required: false },
            ],
        });
        expect(JSON.stringify(input)).toBe(original);
    });

    it("keeps integer/range behavior as the default and fallback", () => {
        for (const input of [undefined, {}, { connections: 2 }, { connections: { min: 0, max: 10 } }, { multiConnection: "optional" as const }]) {
            const resolved = resolveConnectionRequirements(input);
            expect(resolved.explicit).toBe(false);
            expect({ min: resolved.min, max: resolved.max }).toEqual(resolveConnectionSlots(input));
            expect(resolved.slots.map((slot) => slot.required)).toEqual(Array.from({ length: resolved.max }, (_, index) => index < resolved.min));
        }
    });

    it("preserves optional holes and validates required indexes rather than the filled count", () => {
        expect(validateConnectionAssignments([null, "fo"], features, getConnection)).toEqual([null, "fo"]);
        expect(() => validateConnectionAssignments(["dv", null], features, getConnection)).toThrow("slot 2 (F&O customers) is required");
    });

    it("pads omitted optional slots and accepts an unassigned draft", () => {
        expect(validateConnectionAssignments([], features, getConnection, false)).toEqual([null, null]);
        expect(validateConnectionAssignments(["dv"], { connections: { slots: [{}, { required: false }] } }, getConnection)).toEqual(["dv", null]);
    });

    it("rejects wrong products, missing connections and extra slots", () => {
        expect(() => validateConnectionAssignments([null, "dv"], features, getConnection)).toThrow("not compatible with slot 2");
        expect(() => validateConnectionAssignments([null, "missing"], features, getConnection)).toThrow("not found");
        expect(() => validateConnectionAssignments([null, "fo", null], features, getConnection)).toThrow("at most 2");
    });

    it("accepts mixed product choices and preserves legacy Dataverse defaults", () => {
        const mixed: ToolFeatures = { connections: { slots: [{ connectionTypes: ["dataverse", "financeOperations"] }] } };
        expect(validateConnectionAssignments(["dv"], mixed, getConnection)).toEqual(["dv"]);
        expect(validateConnectionAssignments(["fo"], mixed, getConnection)).toEqual(["fo"]);
    });

    it("keeps Power Platform requirements on each populated slot", () => {
        expect(() => validateConnectionAssignments(["dv"], { connections: { slots: [{}] }, enabledForPowerPlatformAPI: true }, getConnection)).toThrow("not compatible");
        expect(() => resolveConnectionRequirements({ connections: { slots: [{ connectionTypes: ["financeOperations"] }] }, enabledForPowerPlatformAPI: true })).toThrow("must support only Dataverse");
    });

    it("does not fall back when explicit definitions are invalid", () => {
        expect(() => resolveConnectionRequirements({ connections: { slots: [] } })).toThrow("1 to 10");
        expect(() => resolveConnectionRequirements({ connections: { slots: [{}] }, connectionTypes: ["dataverse"] })).toThrow("cannot be combined");
    });

    it("keeps incomplete runtime support gated rather than treating required slots as a prefix", () => {
        expect(() => resolveConnectionSlots(features)).toThrow("not enabled yet");
    });
});
