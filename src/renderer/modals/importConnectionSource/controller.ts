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

    const copyPathBtn = document.getElementById("copy-path-btn");
    const COPY_ICON = '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h6A1.5 1.5 0 0 1 13 4.5v8a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 4 12.5v-8ZM5.5 4a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-6ZM2 6.5A1.5 1.5 0 0 1 3.5 5H4v1h-.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V14h1v.5A1.5 1.5 0 0 1 10 16H4a1.5 1.5 0 0 1-1.5-1.5v-8Z"/>';
    const CHECK_ICON = '<path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0Z"/>';
    let copyResetTimer = null;

    copyPathBtn?.addEventListener("click", () => {
        const path = copyPathBtn.dataset.path ?? "";
        const icon = document.getElementById("copy-path-icon");

        // Show feedback immediately
        copyPathBtn.classList.add("copied");
        if (icon) icon.innerHTML = CHECK_ICON;
        if (copyResetTimer) clearTimeout(copyResetTimer);
        copyResetTimer = setTimeout(() => {
            copyPathBtn.classList.remove("copied");
            if (icon) icon.innerHTML = COPY_ICON;
            copyResetTimer = null;
        }, 2000);

        // Write to clipboard (best-effort, feedback already shown)
        const tryWrite = async () => {
            try {
                await navigator.clipboard.writeText(path);
            } catch (_) {
                // Fallback: execCommand
                try {
                    const ta = document.createElement("textarea");
                    ta.value = path;
                    ta.style.position = "fixed";
                    ta.style.opacity = "0";
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                } catch (_2) { /* give up */ }
            }
        };
        tryWrite();
    });

    closeBtn?.addEventListener("click", () => modalBridge.close());
    cancelBtn?.addEventListener("click", () => modalBridge.close());

    confirmBtn?.addEventListener("click", () => {
        modalBridge.send(CHANNELS.select, { source: selectedSource });
    });
})();
</script>`;
}
