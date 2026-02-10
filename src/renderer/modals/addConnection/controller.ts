export interface AddConnectionModalChannelIds {
    submit: string;
    submitReady: string;
    test: string;
    testReady: string;
    testFeedback: string;
}

/**
 * Returns the controller script that wires up DOM events for the add connection modal.
 */
export function getAddConnectionModalControllerScript(channels: AddConnectionModalChannelIds): string {
    const serializedChannels = JSON.stringify(channels);
    return `
<script>
(() => {
    const CHANNELS = ${serializedChannels};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        console.warn("modalBridge API is unavailable");
        return;
    }

    const authTypeSelect = document.getElementById("connection-authentication-type");
    const interactiveFields = document.getElementById("interactive-fields");
    const clientSecretFields = document.getElementById("client-secret-fields");
    const usernamePasswordFields = document.getElementById("username-password-fields");
    const connectionStringFields = document.getElementById("connection-string-fields");
    const testButton = document.getElementById("test-connection-btn");
    const addButton = document.getElementById("confirm-connection-btn");
    const testFeedback = document.getElementById("connection-test-feedback");
    const browserTypeSelect = document.getElementById("connection-browser-type");
    const browserProfileSelect = document.getElementById("connection-browser-profile");
    const browserWarning = document.getElementById("browser-not-installed-warning");
    const getBrowserProfileSelection = () => {
        const select = browserProfileSelect instanceof HTMLSelectElement ? browserProfileSelect : null;
        if (!select) {
            return { value: "", name: "" };
        }
        const value = (select.value || "").trim();
        if (!value) {
            return { value: "", name: "" };
        }
        const selectedOption = select.options[select.selectedIndex];
        const datasetName = selectedOption?.dataset?.profileName?.trim() || "";
        const fallbackName = selectedOption?.textContent?.trim() || "";
        return { value, name: datasetName || fallbackName };
    };

    const updateAuthVisibility = () => {
        const authType = authTypeSelect?.value || "interactive";
        if (interactiveFields) interactiveFields.style.display = authType === "interactive" ? "flex" : "none";
        if (clientSecretFields) clientSecretFields.style.display = authType === "clientSecret" ? "flex" : "none";
        if (usernamePasswordFields) usernamePasswordFields.style.display = authType === "usernamePassword" ? "flex" : "none";
        if (connectionStringFields) connectionStringFields.style.display = authType === "connectionString" ? "flex" : "none";
        if (testButton) testButton.style.display = (authType === "interactive" || authType === "connectionString") ? "none" : "inline-flex";
    };

    const loadBrowserProfiles = async () => {
        const browserType = browserTypeSelect?.value || "default";
        
        // Reset warning
        if (browserWarning) browserWarning.style.display = "none";
        
        if (browserType === "default") {
            // Reset profile dropdown for default browser
            if (browserProfileSelect) {
                browserProfileSelect.disabled = true;
                browserProfileSelect.innerHTML = '<option value="">No profile needed</option>';
            }
            return;
        }

        // Check if browser is installed
        const isInstalled = await window.toolboxAPI.connections.checkBrowserInstalled(browserType);
        
        if (!isInstalled) {
            // Show warning
            if (browserWarning) browserWarning.style.display = "block";
            if (browserProfileSelect) {
                browserProfileSelect.disabled = true;
                browserProfileSelect.innerHTML = '<option value="">Browser not installed</option>';
            }
            return;
        }

        // Load profiles
        if (browserProfileSelect) {
            browserProfileSelect.disabled = true;
            browserProfileSelect.innerHTML = '<option value="">Loading profiles...</option>';
        }

        try {
            const profiles = await window.toolboxAPI.connections.getBrowserProfiles(browserType);
            
            if (browserProfileSelect) {
                if (profiles.length === 0) {
                    browserProfileSelect.innerHTML = '<option value="">No profiles found</option>';
                    browserProfileSelect.disabled = true;
                } else {
                    browserProfileSelect.innerHTML = '<option value="">Use default profile</option>';
                    profiles.forEach(profile => {
                        const option = document.createElement("option");
                        option.value = profile.path;  // Use path as value for --profile-directory
                        option.textContent = profile.name;  // Display the friendly name
                        option.dataset.profileName = profile.name;
                        browserProfileSelect.appendChild(option);
                    });
                    browserProfileSelect.disabled = false;
                }
            }
        } catch (error) {
            if (browserProfileSelect) {
                browserProfileSelect.innerHTML = '<option value="">Error loading profiles</option>';
                browserProfileSelect.disabled = true;
            }
        }
    };

    const updateTestFeedback = (message) => {
        if (!testFeedback) return;
        if (typeof message === "string" && message.trim().length > 0) {
            testFeedback.textContent = message;
            testFeedback.style.display = "block";
        } else {
            testFeedback.textContent = "";
            testFeedback.style.display = "none";
        }
    };

    const getInputValue = (id) => {
        const el = document.getElementById(id);
        return el && "value" in el ? el.value.trim() : "";
    };

    const collectFormData = () => ({
        name: getInputValue("connection-name"),
        url: getInputValue("connection-url"),
        environment: (document.getElementById("connection-environment")?.value) || "Dev",
        authenticationType: authTypeSelect?.value || "interactive",
        clientId: getInputValue("connection-client-id"),
        clientSecret: getInputValue("connection-client-secret"),
        tenantId: getInputValue("connection-tenant-id-cs"),
        username: getInputValue("connection-username-up"),
        password: getInputValue("connection-password"),
        optionalClientId: getInputValue("connection-optional-client-id"),
        interactiveUsername: getInputValue("connection-username"),
        interactiveTenantId: getInputValue("connection-tenant-id"),
        usernamePasswordClientId: getInputValue("connection-optional-client-id-up"),
        usernamePasswordTenantId: getInputValue("connection-tenant-id-up"),
        connectionString: getInputValue("connection-string-input"),
        browserType: getInputValue("connection-browser-type") || "default",
        ...(() => {
            const selection = getBrowserProfileSelection();
            return {
                browserProfile: selection.value,
                browserProfileName: selection.name,
            };
        })(),
    });

    const setButtonState = (button, isLoading, loadingLabel, defaultLabel) => {
        if (!(button instanceof HTMLButtonElement)) return;
        if (isLoading) {
            button.dataset.defaultLabel = defaultLabel;
            button.disabled = true;
            button.textContent = loadingLabel;
        } else {
            button.disabled = false;
            button.textContent = button.dataset.defaultLabel || defaultLabel;
        }
    };

    const togglePasswordVisibility = (buttonId, inputId) => {
        const button = document.getElementById(buttonId);
        const input = document.getElementById(inputId);
        button?.addEventListener("click", () => {
            if (!input || !(input instanceof HTMLInputElement)) return;
            input.type = input.type === "password" ? "text" : "password";
        });
    };

    togglePasswordVisibility("toggle-client-secret", "connection-client-secret");
    togglePasswordVisibility("toggle-password", "connection-password");

    authTypeSelect?.addEventListener("change", updateAuthVisibility);
    updateAuthVisibility();

    // Browser type change listener
    browserTypeSelect?.addEventListener("change", () => {
        loadBrowserProfiles();
    });
    
    // Initial load - only load if default browser is selected (to set initial state)
    // This ensures the dropdown shows proper initial state
    if (browserTypeSelect?.value === "default") {
        if (browserProfileSelect) {
            browserProfileSelect.disabled = true;
            browserProfileSelect.innerHTML = '<option value="">No profile needed</option>';
        }
    }

    addButton?.addEventListener("click", () => {
        setButtonState(addButton, true, "Adding...", "Add");
        modalBridge.send(CHANNELS.submit, collectFormData());
    });

    testButton?.addEventListener("click", () => {
        if (!(testButton instanceof HTMLButtonElement)) return;
        setButtonState(testButton, true, "Testing...", "Test Connection");
        updateTestFeedback("");
        modalBridge.send(CHANNELS.test, collectFormData());
    });

    modalBridge.onMessage?.((payload) => {
        if (!payload || typeof payload !== "object") return;
        if (payload.channel === CHANNELS.submitReady) {
            setButtonState(addButton, false, "", "Add");
        }
        if (payload.channel === CHANNELS.testReady) {
            setButtonState(testButton, false, "", "Test Connection");
        }
        if (payload.channel === CHANNELS.testFeedback) {
            updateTestFeedback(typeof payload.data === "string" ? payload.data : "");
        }
    });

    ["cancel-connection-btn", "close-connection-modal"].forEach((id) => {
        const el = document.getElementById(id);
        el?.addEventListener("click", () => modalBridge.close());
    });
})();
</script>`;
}
