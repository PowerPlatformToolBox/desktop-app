export interface SelectImpersonationUserModalChannelIds {
    selectUser: string;
    searchUsers: string;
    usersReady: string;
}

export function getSelectImpersonationUserModalControllerScript(channels: SelectImpersonationUserModalChannelIds): string {
    return `
<script>
(() => {
    const CHANNELS = ${JSON.stringify(channels)};
    const modalBridge = window.modalBridge;
    if (!modalBridge) return;

    const search = document.getElementById("select-impersonation-user-search");
    const list = document.getElementById("impersonation-users-list");
    const status = document.getElementById("impersonation-users-status");
    const more = document.getElementById("impersonation-users-more");
    let requestId = 0;
    let nextLink = null;
    let loading = false;
    let timer;

    const requestUsers = (append = false) => {
        if (loading && append) return;
        loading = true;
        if (!append) {
            list.replaceChildren();
            nextLink = null;
        }
        more.hidden = true;
        status.textContent = append ? "Loading more users..." : "Searching users...";
        modalBridge.send(CHANNELS.searchUsers, { search: search.value.trim(), nextLink: append ? nextLink : null, requestId: ++requestId, append });
    };

    search?.addEventListener("input", () => {
        clearTimeout(timer);
        list.replaceChildren();
        more.hidden = true;
        status.textContent = "Searching users...";
        ++requestId;
        timer = setTimeout(() => requestUsers(), 300);
    });
    more?.addEventListener("click", () => requestUsers(true));
    modalBridge.onMessage?.((payload) => {
        if (payload.channel !== CHANNELS.usersReady || payload.data?.requestId !== requestId) return;
        loading = false;
        const data = payload.data;
        if (data.error) {
            status.textContent = "Could not load users. Please try searching again.";
            more.hidden = !nextLink;
            return;
        }
        for (const user of data.users) {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "user-row";
            const name = document.createElement("strong");
            name.textContent = user.fullname || "";
            row.append(name);
            if (user.internalemailaddress) {
                const email = document.createElement("span");
                email.textContent = user.internalemailaddress;
                row.append(email);
            }
            row.addEventListener("click", () => modalBridge.send(CHANNELS.selectUser, { index: Number(row.dataset.index) }));
            row.dataset.index = String(list.children.length);
            list.append(row);
        }
        nextLink = data.nextLink;
        more.hidden = !nextLink;
        status.textContent = list.children.length === 0 ? "No matching users. Try a different name or email." : nextLink ? "Showing " + list.children.length + " users. Search all users or load more." : "Showing all " + list.children.length + " matching users.";
    });
    document.getElementById("skip-select-impersonation-user-btn")?.addEventListener("click", () => modalBridge.send(CHANNELS.selectUser, { index: null }));
    document.getElementById("close-select-impersonation-user-modal")?.addEventListener("click", () => modalBridge.send(CHANNELS.selectUser, { index: null }));
    search?.focus();
    requestUsers();
})();
</script>`;
}
