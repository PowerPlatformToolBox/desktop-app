import { authenticateRestoredSlots, copyConnectionSlots, revalidateSavedConnectionSlots } from "../../../src/renderer/utils/sessionConnectionSlots";
import type { Connection } from "../../../src/common/types/connection";

describe("session connection slots", () => {
    it("clears changed-product and removed assignments before authentication without remapping slots", async () => {
        const getConnection = jest.fn(async (id: string) =>
            id === "removed" ? null : ({ id, name: id, connectionType: id === "fo" ? "financeOperations" : "dataverse", authenticationType: "interactive" } as Connection),
        );
        const ids = await revalidateSavedConnectionSlots(
            ["fo", "dv", "removed", "obsolete"],
            {
                connections: { slots: [{ required: false }, { connectionTypes: ["financeOperations"] }, { required: false }] },
            },
            getConnection,
        );
        expect(ids).toEqual([null, null, null]);
        expect(getConnection).not.toHaveBeenCalledWith("obsolete");
        const authenticate = jest.fn();
        await authenticateRestoredSlots(ids, authenticate, jest.fn());
        expect(authenticate).not.toHaveBeenCalled();
    });

    it("pads optional holes and keeps a compatible required later slot at its index", async () => {
        const ids = await revalidateSavedConnectionSlots(
            [null, "fo"],
            {
                connections: { slots: [{ required: false }, { connectionTypes: ["financeOperations"] }, { required: false }] },
            },
            async (id) => ({ id, connectionType: "financeOperations", authenticationType: "interactive" }) as Connection,
        );
        expect(ids).toEqual([null, "fo", null]);
    });
    it("copies all slots for duplication and serialization without aliasing or compacting gaps", () => {
        const original = ["first", null, "third"];
        const copied = copyConnectionSlots({ connectionIds: original, connectionId: "first", secondaryConnectionId: null });
        expect(JSON.parse(JSON.stringify({ connectionIds: copied })).connectionIds).toEqual(original);
        copied[2] = "replacement";
        expect(original).toEqual(["first", null, "third"]);
    });

    it("supports legacy sessions and explicitly empty modern arrays", () => {
        expect(copyConnectionSlots({ connectionId: "first", secondaryConnectionId: "second" })).toEqual(["first", "second"]);
        expect(copyConnectionSlots({ connectionIds: [], connectionId: "stale" })).toEqual([]);
    });

    it("restores later slots and nulls only failed authentication without shifting indexes", async () => {
        const authenticate = jest.fn(async (id: string) => {
            if (id === "second") throw new Error("expired");
        });
        const onFailure = jest.fn();
        expect(await authenticateRestoredSlots(["first", "second", "third"], authenticate, onFailure)).toEqual(["first", null, "third"]);
        expect(authenticate).toHaveBeenCalledWith("third");
        expect(onFailure).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it("limits authentication to two concurrent operations", async () => {
        let active = 0;
        let peak = 0;
        const authenticate = async (): Promise<void> => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>((resolve) => setImmediate(resolve));
            active--;
        };
        expect(await authenticateRestoredSlots(["first", "second", "third", "fourth"], authenticate, jest.fn())).toHaveLength(4);
        expect(peak).toBe(2);
    });
});
