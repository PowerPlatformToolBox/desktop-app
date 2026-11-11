/// <reference types="jest" />

import { getToolIdeasModalControllerScript } from "../../../src/renderer/modals/toolIdeas/controller";
import { getToolIdeasModalView } from "../../../src/renderer/modals/toolIdeas/view";

describe("tool ideas modal", () => {
    it("renders a submission-only form with an explicitly selected type", () => {
        const { body } = getToolIdeasModalView(false);

        expect(body).not.toContain('id="tool-ideas-list"');
        expect(body).toContain('id="tool-idea-type"');
        expect(body).toContain('<option value="" selected disabled>');
        for (const type of ["pptb_desktop", "pptb_vscode", "tool"]) expect(body).toContain(`value="${type}"`);
        expect(body).toContain('id="tool-idea-title"');
        expect(body).toContain('id="tool-idea-description"');
        expect(body).toContain('id="tool-idea-email"');
        expect(body).toContain("Contact email (optional)");
    });

    it("submits the selected type, blocks concurrent requests, and notifies the board", () => {
        const script = getToolIdeasModalControllerScript();

        expect(script).toContain("api.submit({ ideaType: ideaType.value, title: title.value, description: description.value, email: email.value })");
        expect(script).toContain("if (saving || !api || !form.reportValidity()) return");
        expect(script).toContain('send("idea-submitted")');
        expect(script).not.toContain("api.fetch()");
    });
});
