/// <reference types="jest" />

jest.mock("../../../src/renderer/utils/browserIcons", () => ({
    chromeIconUrl: "chrome-mock-icon",
    edgeIconUrl: "edge-mock-icon",
}));

import { getSelectConnectionModalControllerScript } from "../../../src/renderer/modals/selectConnection/controller";
import { getSelectConnectionModalView } from "../../../src/renderer/modals/selectConnection/view";
import { getSelectMultiConnectionModalControllerScript } from "../../../src/renderer/modals/selectMultiConnection/controller";
import { getSelectMultiConnectionModalView } from "../../../src/renderer/modals/selectMultiConnection/view";

describe("connection modal double-click controller wiring", () => {
    it("injects single-connection double-click toggle into controller script", () => {
        const script = getSelectConnectionModalControllerScript(
            {
                selectConnection: "select-connection:select",
                connectReady: "select-connection:connect:ready",
                populateConnections: "select-connection:populate",
            },
            false,
            true,
        );

        expect(script).toContain("const ENABLE_DOUBLE_CLICK_CONNECT = true;");
        expect(script).toContain("item.addEventListener('dblclick'");
        expect(script).toContain("triggerConnect();");
    });

    it("shows and wires the optional clear-secondary action", () => {
        const view = getSelectConnectionModalView(false, "Sample Tool", true);
        const script = getSelectConnectionModalControllerScript(
            {
                selectConnection: "select-connection:select",
                connectReady: "select-connection:connect:ready",
                populateConnections: "select-connection:populate",
            },
            false,
            false,
            true,
        );
        const standardView = getSelectConnectionModalView(false, "Sample Tool");

        expect(view.body).toContain('id="clear-selected-connection-btn"');
        expect(standardView.body).not.toContain('id="clear-selected-connection-btn"');
        expect(script).toContain("const ALLOW_CLEAR_SELECTION = true;");
        expect(script).toContain("{ clearConnection: true }");
    });

    it("injects multi-connection double-click toggle into controller script", () => {
        const script = getSelectMultiConnectionModalControllerScript(
            {
                selectConnections: "select-multi-connection:select",
                connectReady: "select-multi-connection:connect:ready",
                populateConnections: "select-multi-connection:populate",
            },
            true,
            false,
            true,
        );

        expect(script).toContain("const ENABLE_DOUBLE_CLICK_CONNECT = true;");
        expect(script).toContain("item.addEventListener('dblclick'");
        expect(script).toContain("await handleConnectClick(connectionId, listType);");
    });

    it("renders required and optional connection slots with a hard add cap", () => {
        const view = getSelectMultiConnectionModalView(false, {
            minConnections: 1,
            maxConnections: 3,
            toolName: "Solution Transfer",
            initialConnectionIds: ["source-id"],
        });

        expect(view.body).toContain('id="connection-slot-rail"');
        expect(view.body).toContain('data-slot-index="0"');
        expect(view.body).toContain("Required");
        expect(view.body).toContain('id="add-connection-slot-btn"');
        expect(view.body).not.toContain('id="secondary-connections-list"');
        expect(view.body).toContain('id="slot-connection-list"');
    });

    it("generates a controller that marks connected slots without changing focus", () => {
        const script = getSelectMultiConnectionModalControllerScript(
            {
                selectConnections: "select-multi-connection:select",
                connectReady: "select-multi-connection:connect:ready",
                populateConnections: "select-multi-connection:populate",
            },
            { minConnections: 1, maxConnections: 4, initialConnectionIds: ["source-id"] },
            false,
            true,
        );

        expect(script).toContain("const MIN_CONNECTIONS = 1;");
        expect(script).toContain("const MAX_CONNECTIONS = 4;");
        expect(script).toContain('listType: "slot-" + activeSlot');
        expect(script).toContain("const connectedSlots = new Set");
        expect(script).toContain('class="connection-slot-connected-check"');
        expect(script).toContain("connectedSlots.add(slotIndex)");
        expect(script).not.toContain("const nextEmpty = slotIds.findIndex");
        expect(script).not.toContain("activeSlot = slotIds.length - 1");
        expect(script).toContain("impersonateSlots.has(index)");
        expect(script).toContain('class="connection-slot-indicators"');
        expect(script).toContain('class="connection-slot-impersonation-icon"');
        expect(script).toContain('aria-label="Dataverse impersonation enabled"');
        expect(script).toContain("impersonateSlots.delete(activeSlot);\n            renderRail();");
        expect(script).toContain("connectionIds: slotIds");
        expect(script).toContain("ENABLE_DOUBLE_CLICK_CONNECT = true");
        expect(script).toContain('class="connection-selected-indicator" role="status"');
        expect(script).toContain('class="slot-duplicate-card-note"');
        expect(script).not.toContain('selected ? "Selected" : "Connect"');
        expect(script).toContain('(impersonateSlots.has(activeSlot) ? "checked" : "")');
        expect(script).not.toContain("slotIds[activeSlot] !== connectionId");

        const connectSuccessStart = script.indexOf("if (payload?.channel === CHANNELS.connectReady && payload.data?.success && payload.data?.connectionId)");
        const connectFailureStart = script.indexOf("if (payload?.channel === CHANNELS.connectReady && payload.data?.success === false)");
        expect(connectSuccessStart).toBeGreaterThanOrEqual(0);
        expect(script.slice(connectSuccessStart, connectFailureStart)).not.toContain("impersonateSlots.delete(slotIndex)");
    });

    it("accepts a CSP-safe impersonation icon data URL", () => {
        const script = getSelectMultiConnectionModalControllerScript(
            {
                selectConnections: "select-multi-connection:select",
                connectReady: "select-multi-connection:connect:ready",
                populateConnections: "select-multi-connection:populate",
            },
            { minConnections: 1, maxConnections: 2 },
            false,
            false,
            "data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E",
        );

        expect(script).toContain('const IMPERSONATION_ICON_URL = "data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E";');
    });

    it("spaces the active-slot duplicate warning away from the connection list", () => {
        const view = getSelectMultiConnectionModalView(false, { minConnections: 1, maxConnections: 2 });

        expect(view.body).toContain('id="slot-duplicate-warning"');
        expect(view.body).toContain('id="active-connection-slot-label"');
        expect(view.styles).toContain("#active-connection-slot-label { display: block; margin: 0 0 12px;");
        expect(view.styles).toContain(".slot-duplicate-warning { color: #9a6700; margin: 8px 0 14px;");
        expect(view.styles).toContain(".slot-duplicate-card-note { display: flex; align-items: center; gap: 6px;");
    });
});
