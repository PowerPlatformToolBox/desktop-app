import { ToolUpdateState } from "../../../src/renderer/utils/toolUpdateState";

describe("tool update state", () => {
    it("marks all bulk update targets until each one completes", () => {
        const state = new ToolUpdateState();
        state.markUpdating(["first", "second"]);

        expect(state.isUpdating("first")).toBe(true);
        expect(state.isUpdating("second")).toBe(true);
        expect(state.isUpdating("other")).toBe(false);

        state.markComplete("first");

        expect(state.isUpdating("first")).toBe(false);
        expect(state.isUpdating("second")).toBe(true);
    });

    it("clears any remaining bulk update targets", () => {
        const state = new ToolUpdateState();
        state.markUpdating(["first", "second"]);

        state.clear();

        expect(state.isUpdating("first")).toBe(false);
        expect(state.isUpdating("second")).toBe(false);
    });
});
