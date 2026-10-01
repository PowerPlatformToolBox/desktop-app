import { getToolIdeasModalControllerScript } from "../modals/toolIdeas/controller";
import { getToolIdeasModalView } from "../modals/toolIdeas/view";
import { showBrowserWindowModal } from "./browserWindowModals";

export async function openToolIdeasModal(): Promise<void> {
    const { styles, body } = getToolIdeasModalView(document.body.classList.contains("dark-theme"));
    await showBrowserWindowModal({
        id: "tool-ideas-modal",
        html: `${styles}\n${body}\n${getToolIdeasModalControllerScript()}`,
        width: 560,
        height: 760,
    });
}
