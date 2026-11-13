import { ToolUpdateState } from "../../../src/renderer/utils/toolUpdateState";

describe("tool update state", () => {
    it("keeps queued tools distinct from the tool currently updating", () => {
        const state = new ToolUpdateState();
        state.markQueued(["first", "second"]);
        state.markUpdating("first");

        expect(state.isUpdating("first")).toBe(true);
        expect(state.isUpdating("second")).toBe(false);
        expect(state.isUpdating("other")).toBe(false);
        expect(state.getStatus("second")?.status).toBe("queued");

        state.markComplete("first");

        expect(state.isUpdating("first")).toBe(false);
        expect(state.getStatus("first")?.status).toBe("updated");
        expect(state.getStatus("second")?.status).toBe("queued");
    });

    it("retains failures for the sidebar result and supports clearing state", () => {
        const state = new ToolUpdateState();
        state.markFailed("first", "check-failed", "Registry unavailable");

        expect(state.getStatus("first")).toEqual({ status: "check-failed", message: "Registry unavailable" });

        state.clear();

        expect(state.getStatus("first")).toBeUndefined();
    });

    it("clears all batch statuses", () => {
        const state = new ToolUpdateState();
        state.markQueued(["first", "second"]);

        state.clear();

        expect(state.isUpdating("first")).toBe(false);
        expect(state.isUpdating("second")).toBe(false);
    });
});
