import type { DataverseUser, ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getSelectDataverseUserModalControllerScript } from "../modals/selectDataverseUser/controller";
import { getSelectDataverseUserModalView } from "../modals/selectDataverseUser/view";
import {
    closeBrowserWindowModal,
    offBrowserWindowModalClosed,
    offBrowserWindowModalMessage,
    onBrowserWindowModalClosed,
    onBrowserWindowModalMessage,
    showBrowserWindowModal,
} from "./browserWindowModals";

const CHANNELS = { selectUser: "select-dataverse-user:select" } as const;
const MODAL_ID = "select-dataverse-user-modal";

export function openSelectDataverseUserModal(users: DataverseUser[]): Promise<DataverseUser | null> {
    return new Promise((resolve) => {
        const settle = (user: DataverseUser | null) => {
            offBrowserWindowModalMessage(messageHandler);
            offBrowserWindowModalClosed(closedHandler);
            resolve(user);
        };
        const messageHandler = (payload: ModalWindowMessagePayload) => {
            if (payload.channel !== CHANNELS.selectUser) return;
            const index = (payload.data as { index?: number } | undefined)?.index;
            const selected = typeof index === "number" ? users[index] ?? null : null;
            settle(selected);
            void closeBrowserWindowModal();
        };
        const closedHandler = (payload: ModalWindowClosedPayload) => {
            if (payload.id === MODAL_ID) settle(null);
        };

        onBrowserWindowModalMessage(messageHandler);
        onBrowserWindowModalClosed(closedHandler);

        const isDarkTheme = document.body.classList.contains("dark-theme");
        const { styles, body } = getSelectDataverseUserModalView(isDarkTheme, users);
        const script = getSelectDataverseUserModalControllerScript(CHANNELS);
        void showBrowserWindowModal({ id: MODAL_ID, html: `${styles}\n${body}\n${script}`, width: 520, height: 620 }).catch(() => settle(null));
    });
}
