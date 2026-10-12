import type { Connection } from "../../../src/common/types/connection";
import { getConnectionSlotSquarePresentation, getEmptyConnectionSlotPresentation } from "../../../src/renderer/utils/connectionSlotStatus";

const baseConnection: Connection = {
    id: "connection-1",
    name: "Power Maverick",
    url: "https://example.crm.dynamics.com",
    environment: "Dev",
    authenticationType: "interactive",
    createdAt: "2026-10-02T00:00:00.000Z",
};

describe("connection status square presentation", () => {
    it("marks unused optional capacity as an actionable placeholder", () => {
        expect(getEmptyConnectionSlotPresentation(2, false)).toEqual({
            label: "3",
            ariaLabel: "Add connection 3",
            title: "Add connection 3",
            className: "connection-slot-square available",
            disabled: false,
        });
    });

    it("keeps explicitly cleared slots visible but disabled", () => {
        expect(getEmptyConnectionSlotPresentation(2, true)).toEqual({
            label: "3",
            ariaLabel: "Connection 3 is cleared",
            title: "Connection 3 was cleared",
            className: "connection-slot-square cleared",
            disabled: true,
        });
    });

    it("uses one-based slot labels and accessible environment context", () => {
        const presentation = getConnectionSlotSquarePresentation(1, baseConnection, false);

        expect(presentation.label).toBe("2");
        expect(presentation.ariaLabel).toBe("Connection 2: Power Maverick, Dev");
        expect(presentation.title).toBe("Connection 2: Power Maverick (Dev)");
        expect(presentation.environmentToken).toBe("dev");
        expect(presentation.className).toBe("connection-slot-square");
    });

    it("maps Production to the app's prod token", () => {
        const presentation = getConnectionSlotSquarePresentation(1, { ...baseConnection, environment: "Production" }, false);

        expect(presentation.environmentToken).toBe("prod");
    });

    it("includes expiry and impersonation in the label and visual state", () => {
        const presentation = getConnectionSlotSquarePresentation(1, { ...baseConnection, environmentColor: "#12abef" }, true, "Ada Admin");

        expect(presentation.className).toBe("connection-slot-square expired");
        expect(presentation.environmentColor).toBe("#12abef");
        expect(presentation.ariaLabel).toBe("Connection 2: Power Maverick, Dev, token expired, impersonating Ada Admin");
        expect(presentation.title).toBe("Connection 2: Power Maverick (Dev) - token expired, impersonating Ada Admin");
    });
});
