/**
 * Modal management module
 * Handles opening and closing of modal dialogs
 */

/**
 * Open a modal dialog by ID
 */
export function openModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("active");
    }
}

/**
 * Close a modal dialog by ID
 */
export function closeModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");

        // Reset add-connection-modal when closed
        if (modalId === "add-connection-modal") {
            resetConnectionModal();
        }
    }
}

/**
 * Reset the connection modal form to default state
 */
function resetConnectionModal(): void {
    // Reset all form fields
    const nameInput = document.getElementById("connection-name") as HTMLInputElement;
    const urlInput = document.getElementById("connection-url") as HTMLInputElement;
    const environmentSelect = document.getElementById("connection-environment") as HTMLSelectElement;
    const authTypeSelect = document.getElementById("connection-authentication-type") as HTMLSelectElement;
    const clientIdInput = document.getElementById("connection-client-id") as HTMLInputElement;
    const clientSecretInput = document.getElementById("connection-client-secret") as HTMLInputElement;
    const tenantIdInput = document.getElementById("connection-tenant-id") as HTMLInputElement;
    const usernameInput = document.getElementById("connection-username") as HTMLInputElement;
    const passwordInput = document.getElementById("connection-password") as HTMLInputElement;
    const optionalClientIdInput = document.getElementById("connection-optional-client-id") as HTMLInputElement;
    const testBtn = document.getElementById("test-connection-btn") as HTMLButtonElement;

    if (nameInput) nameInput.value = "";
    if (urlInput) urlInput.value = "";
    if (environmentSelect) environmentSelect.value = "Dev";
    if (authTypeSelect) authTypeSelect.value = "interactive";
    if (clientIdInput) clientIdInput.value = "";
    if (clientSecretInput) clientSecretInput.value = "";
    if (tenantIdInput) tenantIdInput.value = "";
    if (usernameInput) usernameInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (optionalClientIdInput) optionalClientIdInput.value = "";

    // Reset test button state
    if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = "Test Connection";
    }

    // Reset field visibility
    updateAuthFieldsVisibility();
}

/**
 * Update visibility of authentication fields based on auth type selection
 */
export function updateAuthFieldsVisibility(): void {
    const authTypeSelect = document.getElementById("connection-authentication-type") as HTMLSelectElement;
    const clientSecretFields = document.getElementById("client-secret-fields");
    const usernamePasswordFields = document.getElementById("username-password-fields");
    const testConnectionBtn = document.getElementById("test-connection-btn");

    if (!authTypeSelect) return;

    const authType = authTypeSelect.value;

    // Hide all fields first
    if (clientSecretFields) clientSecretFields.style.display = "none";
    if (usernamePasswordFields) usernamePasswordFields.style.display = "none";

    // Show relevant fields based on auth type
    if (authType === "clientSecret") {
        if (clientSecretFields) clientSecretFields.style.display = "block";
        if (testConnectionBtn) testConnectionBtn.style.display = "inline-block";
    } else if (authType === "usernamePassword") {
        if (usernamePasswordFields) usernamePasswordFields.style.display = "block";
        if (testConnectionBtn) testConnectionBtn.style.display = "inline-block";
    } else if (authType === "interactive") {
        // Hide test connection button for interactive auth
        if (testConnectionBtn) testConnectionBtn.style.display = "none";
    }
}
