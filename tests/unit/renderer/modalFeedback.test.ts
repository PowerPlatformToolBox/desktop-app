/// <reference types="jest" />

import { getAddConnectionModalControllerScript } from "../../../src/renderer/modals/addConnection/controller";
import { getEditConnectionModalControllerScript } from "../../../src/renderer/modals/editConnection/controller";
import { getModalStyles } from "../../../src/renderer/modals/sharedStyles";

const SUCCESS_FEEDBACK_BACKGROUND = "rgba(16, 124, 16, 0.12)";
const ERROR_FEEDBACK_BACKGROUND = "rgba(255, 77, 109, 0.12)";

describe("modal feedback styling", () => {
    it("includes explicit success and error feedback variants", () => {
        const styles = getModalStyles(false);

        expect(styles).toContain(".modal-feedback.success");
        expect(styles).toContain(".modal-feedback.error");
        expect(styles).toContain(SUCCESS_FEEDBACK_BACKGROUND);
        expect(styles).toContain(ERROR_FEEDBACK_BACKGROUND);
    });
});

describe("connection modal feedback controllers", () => {
    const channels = {
        submit: "submit",
        submitReady: "submitReady",
        test: "test",
        testReady: "testReady",
        testFeedback: "testFeedback",
        populateConnection: "populateConnection",
    };

    it("applies success/error classes in the add connection modal controller", () => {
        const script = getAddConnectionModalControllerScript(channels);

        expect(script).toMatch(/data\.type === "success"/);
        expect(script).toContain('? "success" : "error";');
        expect(script).toContain('testFeedback.className = "modal-feedback " + feedbackType;');
        expect(script).toContain('updateTestFeedback(payload.data);');
    });

    it("applies success/error classes in the edit connection modal controller", () => {
        const script = getEditConnectionModalControllerScript(channels);

        expect(script).toMatch(/data\.type === "success"/);
        expect(script).toContain('? "success" : "error";');
        expect(script).toContain('testFeedback.className = "modal-feedback " + feedbackType;');
        expect(script).toContain('updateTestFeedback(payload.data);');
    });
});
