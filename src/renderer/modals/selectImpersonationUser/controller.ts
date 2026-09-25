export interface SelectImpersonationUserModalChannelIds {
    selectUser: string;
}

export function getSelectImpersonationUserModalControllerScript(channels: SelectImpersonationUserModalChannelIds): string {
    return `
<script>
(() => {
    const CHANNELS = ${JSON.stringify(channels)};
    const modalBridge = window.modalBridge;
    if (!modalBridge) return;

    const search = document.getElementById("select-impersonation-user-search");
    const empty = document.getElementById("impersonation-users-empty");
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
    document.getElementById("skip-select-impersonation-user-btn")?.addEventListener("click", () => modalBridge.send(CHANNELS.selectUser, { index: null }));
    document.getElementById("close-select-impersonation-user-modal")?.addEventListener("click", () => modalBridge.send(CHANNELS.selectUser, { index: null }));
    search?.focus();
})();
</script>`;
}
