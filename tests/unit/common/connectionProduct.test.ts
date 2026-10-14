import { connectionProductLabel, connectionProductScript } from "../../../src/common/connectionProduct";
import { connectionSlotFeatures, hasRequiredConnectionAssignments } from "../../../src/common/connectionSlots";

describe("connection product presentation and picker requirements", () => {
    it("labels legacy connections as Dataverse without labeling invalid explicit products as Dataverse", () => {
        expect(connectionProductLabel()).toBe("Dataverse");
        expect(connectionProductLabel("financeOperations")).toBe("F&O");
        expect(connectionProductLabel(null as any)).toBe("Unknown product");
        expect(connectionProductLabel("invalid" as any)).toBe("Unknown product");
        expect(connectionProductScript()).toContain("Dynamics 365 Finance & Operations");
    });
    it("selects products by slot and checks an optional-before-required declaration", () => {
        const features = { connections: { slots: [{ required: false }, { connectionTypes: ["financeOperations" as const] }] } };
        expect(connectionSlotFeatures(features, 1).connectionTypes).toEqual(["financeOperations"]);
        expect(hasRequiredConnectionAssignments(features, [null, "fo"])).toBe(true);
        expect(hasRequiredConnectionAssignments(features, ["dv", null])).toBe(false);
    });
});
