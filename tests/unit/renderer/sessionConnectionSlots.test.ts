import { authenticateRestoredSlots, copyConnectionSlots } from "../../../src/renderer/utils/sessionConnectionSlots";

describe("session connection slots", () => {
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
