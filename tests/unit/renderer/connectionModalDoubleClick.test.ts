/// <reference types="jest" />

jest.mock("../../../src/renderer/utils/browserIcons", () => ({
    chromeIconUrl: "chrome-mock-icon",
    edgeIconUrl: "edge-mock-icon",
}));

import { getSelectConnectionModalControllerScript } from "../../../src/renderer/modals/selectConnection/controller";
import { getSelectMultiConnectionModalControllerScript } from "../../../src/renderer/modals/selectMultiConnection/controller";

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
});
