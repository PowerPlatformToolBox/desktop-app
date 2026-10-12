import type { ConnectionSlotRange, ConnectionTarget } from "../../../src/common/connectionSlots";
import { connectionTargetLabel, normalizeConnectionTarget, resolveConnectionSlots } from "../../../src/common/connectionSlots";
import type { ToolFeatures } from "../../../src/common/types/tool";

describe("resolveConnectionSlots", () => {
    const cases: Array<[ToolFeatures | undefined, ConnectionSlotRange]> = [
        [undefined, { min: 1, max: 1 }],
        [{ multiConnection: "none" }, { min: 1, max: 1 }],
        [
            { multiConnection: "none", connectionRequirement: "optional" },
            { min: 0, max: 1 },
        ],
        [{ multiConnection: "optional" }, { min: 1, max: 2 }],
        [
            { multiConnection: "optional", connectionRequirement: "optional" },
            { min: 0, max: 2 },
        ],
        [{ multiConnection: "required" }, { min: 2, max: 2 }],
        [{ connections: 0 }, { min: 0, max: 0 }],
        [{ connections: 1 }, { min: 1, max: 1 }],
        [{ connections: { min: 1, max: 5 } }, { min: 1, max: 5 }],
        [{ connections: { max: 5 } }, { min: 1, max: 5 }],
        [{ connections: { min: 3 } }, { min: 3, max: 3 }],
        [{ connections: { min: 0, max: 5 } }, { min: 0, max: 5 }],
    ];

    it.each(cases)("resolves %p", (features, expected) => {
        expect(resolveConnectionSlots(features)).toEqual(expected);
    });
});

describe("connection target helpers", () => {
    const targetCases: Array<[ConnectionTarget, number]> = [
        ["primary", 0],
        ["secondary", 1],
        [0, 0],
        [1, 1],
        [4, 4],
    ];

    it.each(targetCases)("normalizes %p", (target, expected) => {
        expect(normalizeConnectionTarget(target)).toBe(expected);
    });

    it.each([-1, 1.5])("rejects invalid numeric target %p", (target) => {
        expect(() => normalizeConnectionTarget(target)).toThrow(RangeError);
    });

    const labelCases: Array<[number, string]> = [
        [0, "Primary"],
        [1, "Secondary"],
        [2, "Connection 3"],
    ];

    it.each(labelCases)("labels slot %i", (index, expected) => {
        expect(connectionTargetLabel(index)).toBe(expected);
    });
});
