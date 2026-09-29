/// <reference types="jest" />

import { getSelectImpersonationUserModalControllerScript } from "../../../src/renderer/modals/selectImpersonationUser/controller";
import { getSelectImpersonationUserModalView } from "../../../src/renderer/modals/selectImpersonationUser/view";

describe("impersonation user picker", () => {
    it("explains bounded results and exposes load-more, search, and status controls", () => {
        const { body } = getSelectImpersonationUserModalView(false, { connectionName: "Production" });
        expect(body).toContain("Search all users by name or email");
        expect(body).toContain('id="impersonation-users-more"');
        expect(body).toContain('role="status"');
        expect(body).toContain("Production");
    });

    it("requests server results with a continuation and uses text nodes for user data", () => {
        const script = getSelectImpersonationUserModalControllerScript({ selectUser: "select", searchUsers: "search", usersReady: "ready" });
        expect(script).toContain("nextLink: append ? nextLink : null");
        expect(script).toContain("payload.data?.requestId !== requestId");
        expect(script).toContain("name.textContent = user.fullname");
        expect(script).toContain("email.textContent = user.internalemailaddress");
        expect(script).toContain("Search all users or load more.");
    });
});
