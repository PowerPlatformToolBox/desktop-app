export interface SelectDataverseUserModalChannelIds {
    selectUser: string;
}

export function getSelectDataverseUserModalControllerScript(channels: SelectDataverseUserModalChannelIds): string {
    return `
<script>
(() => {
    const CHANNELS = ${JSON.stringify(channels)};
    const modalBridge = window.modalBridge;
    if (!modalBridge) return;

    const search = document.getElementById("select-dataverse-user-search");
    const empty = document.getElementById("dataverse-users-empty");
    const filterUsers = () => {
        const query = (search?.value || "").trim().toLowerCase();
        let visible = 0;
        document.querySelectorAll(".user-row").forEach((row) => {
            const match = !query || (row.dataset.search || "").toLowerCase().includes(query);
            row.style.display = match ? "flex" : "none";
            if (match) visible += 1;
        });
        if (empty) empty.style.display = visible > 0 ? "none" : "block";
    };

    search?.addEventListener("input", filterUsers);
    document.querySelectorAll(".user-row").forEach((row) => {
        row.addEventListener("click", () => modalBridge.send(CHANNELS.selectUser, { index: Number(row.dataset.index) }));
    });
    document.getElementById("cancel-select-dataverse-user-btn")?.addEventListener("click", () => modalBridge.close());
    document.getElementById("close-select-dataverse-user-modal")?.addEventListener("click", () => modalBridge.close());
    search?.focus();
})();
</script>`;
}
