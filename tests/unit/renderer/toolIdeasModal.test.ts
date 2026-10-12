/// <reference types="jest" />

import { getToolIdeasModalControllerScript } from "../../../src/renderer/modals/toolIdeas/controller";
import { getToolIdeasModalView } from "../../../src/renderer/modals/toolIdeas/view";

describe("tool ideas modal", () => {
    it("renders a submission form and a community idea list", () => {
        const { body } = getToolIdeasModalView(false);

        expect(body).toContain('id="tool-ideas-list"');
        expect(body).toContain('id="tool-idea-title"');
        expect(body).toContain('id="tool-idea-description"');
        expect(body).toContain('id="tool-idea-email"');
        expect(body).toContain("Contact email (optional)");
    });

    it("loads ideas, submits new ones, and upvotes using the modal API", () => {
        const script = getToolIdeasModalControllerScript();

        expect(script).toContain("api.fetch()");
        expect(script).toContain("api.submit({ title: title.value, description: description.value, email: email.value })");
        expect(script).toContain("api.upvote(idea.id)");
        expect(script).toContain("idea.hasUpvoted");
    });
});
