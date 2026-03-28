export interface ImportSourceModalChannelIds {
    select: string;
}

/**
 * Returns the controller script that wires up DOM events for the import connection source modal.
 * The modal lets the user choose between XrmToolBox (XML) and PPTB (JSON) as the import source.
 */
export function getImportConnectionSourceModalControllerScript(channels: ImportSourceModalChannelIds): string {
    const serializedChannels = JSON.stringify(channels);
    return `
<script>
(async () => {
    const CHANNELS = ${serializedChannels};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        return;
    }

    let selectedSource = "xtb";

    const cardXtb = document.getElementById("card-xtb");
    const cardPptb = document.getElementById("card-pptb");
    const xtbHint = document.getElementById("xtb-hint");
    const closeBtn = document.getElementById("close-import-source-modal");
    const cancelBtn = document.getElementById("cancel-import-source-btn");
    const confirmBtn = document.getElementById("confirm-import-source-btn");

    const selectCard = (source) => {
        selectedSource = source;
        const isXtb = source === "xtb";

        if (cardXtb) {
            cardXtb.classList.toggle("selected", isXtb);
            cardXtb.setAttribute("aria-pressed", String(isXtb));
        }
        if (cardPptb) {
            cardPptb.classList.toggle("selected", !isXtb);
            cardPptb.setAttribute("aria-pressed", String(!isXtb));
        }
        if (xtbHint) {
            xtbHint.classList.toggle("visible", isXtb);
        }
    };

    cardXtb?.addEventListener("click", () => selectCard("xtb"));
    cardPptb?.addEventListener("click", () => selectCard("pptb"));

    closeBtn?.addEventListener("click", () => modalBridge.close());
    cancelBtn?.addEventListener("click", () => modalBridge.close());

    confirmBtn?.addEventListener("click", () => {
        modalBridge.send(CHANNELS.select, { source: selectedSource });
    });
})();
</script>`;
}
