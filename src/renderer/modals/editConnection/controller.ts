import { getModalFeedbackScriptHelpers } from "../feedbackScript";

export interface EditConnectionModalChannelIds {
    submit: string;
    submitReady: string;
    test: string;
    testReady: string;
    testFeedback: string;
    populateConnection: string;
}

/**
 * Returns the controller script that wires up DOM events for the edit connection modal.
 */
export function getEditConnectionModalControllerScript(channels: EditConnectionModalChannelIds): string {
    const serializedChannels = JSON.stringify(channels);
    return `
<script>
(async () => {
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
    const saveButton = document.getElementById("confirm-connection-btn");
    const configureButton = document.getElementById("configure-app-btn");
    const copyScriptSaveButton = document.getElementById("copy-script-save-btn");
    const configureNote = document.getElementById("connection-configure-note");
    const testFeedback = document.getElementById("connection-test-feedback");
    const ppApiCheckbox = document.getElementById("connection-enabled-for-powerplatform-api");
    const ppApiWrapper = document.getElementById("power-platform-api-wrapper");
    const ppApiHelp = document.getElementById("power-platform-api-help");
    const browserTypeSelect = document.getElementById("connection-browser-type");
    const browserProfileSelect = document.getElementById("connection-browser-profile");
    const browserWarning = document.getElementById("browser-not-installed-warning");
    const interactiveClientIdInput = document.getElementById("connection-optional-client-id");
    const usernamePasswordClientIdInput = document.getElementById("connection-optional-client-id-up");
    const interactiveClientIdLabel = document.getElementById("connection-optional-client-id-label");
    const usernamePasswordClientIdLabel = document.getElementById("connection-optional-client-id-up-label");
    const POWER_PLATFORM_ADMIN_PERMISSIONS = [
        "Connectivity.Connections.Read",
        "EnvironmentManagement.Environments.Read",
        "PowerApps.Apps.Read",
        "PowerAutomate.Flows.Read",
        "ResourceQuery.Resources.Read",
    ];
    const supportsPowerPlatformApi = (authType) => authType === "interactive" || authType === "usernamePassword";
    let pendingConfigureSaveScript = "";
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

    const getCurrentClientId = () => {
        const authType = authTypeSelect?.value || "interactive";
        if (authType === "clientSecret") {
            return getInputValue("connection-client-id");
        }
        if (authType === "usernamePassword") {
            return getInputValue("connection-optional-client-id-up");
        }
        if (authType === "interactive") {
            return getInputValue("connection-optional-client-id");
        }
        return "";
    };

    const shouldShowConfigureFooter = () => {
        return Boolean(getCurrentClientId()) || (ppApiCheckbox instanceof HTMLInputElement && ppApiCheckbox.checked);
    };

    const isPowerPlatformApiEnabled = () => {
        return ppApiCheckbox instanceof HTMLInputElement && ppApiCheckbox.checked;
    };

    const getPrimaryActionLabel = () => "Update";

    const getConfigureButtonLabel = () => "Configure App";

    const getManualActionLabel = () => {
        return shouldShowConfigureFooter() ? "Copy Script & Update" : "Update";
    };

    const getConfigureNoteText = () => {
        // const redirectNote = "Reply URLs to set: msal<client-id>://auth and http://localhost.";
        if (isPowerPlatformApiEnabled()) {
            return "Configure App will update reply URLs and add basic Power Platform API permissions. Use Copy Script & Update to skip automatic configuration and save with a handoff script.";
        }

        return "Configure App will update reply URLs only. Use Copy Script & Update to skip automatic configuration and save with a handoff script.";
    };

    const buildAdminHandOffScript = (validationMessage) => {
        const clientId = getCurrentClientId() || "[your-client-id]";
        const includePowerPlatformPermissions = isPowerPlatformApiEnabled();
        const scriptPermissions = POWER_PLATFORM_ADMIN_PERMISSIONS.map((permission) => '    "' + permission + '"').join("\\n");
        const scriptLines = [
            "# Power Platform ToolBox client setup handoff",
            "# Validation issue: " + validationMessage,
            "# PPTB requires Mobile and desktop application redirect URIs. Register both entries below in Entra.",
            '$clientId = "' + clientId + '"',
            '$redirectUris = @("msal" + $clientId + "://auth", "http://localhost")',
            "",
            'Write-Host "Client ID to register:" $clientId',
            'Write-Host "Redirect URIs to add under Mobile and desktop applications:"',
            'foreach ($redirectUri in $redirectUris) {',
            '    Write-Host (" - " + $redirectUri)',
            '}',
        ];

        if (includePowerPlatformPermissions) {
            scriptLines.push(
                '$requiredPermissions = @(',
                scriptPermissions,
                ")",
                'Write-Host "Power Platform API permissions to add:"',
                'foreach ($permission in $requiredPermissions) {',
                '    Write-Host (" - " + $permission)',
                '}',
            );
        }

        scriptLines.push('Write-Host "If the app registration is already configured, re-open PPTB and try Configure App again."');
        return scriptLines.join("\\n");
    };

    const updateConfigureFooterState = () => {
        const isConfigureMode = shouldShowConfigureFooter();
        if (configureButton instanceof HTMLButtonElement) {
            configureButton.style.display = isConfigureMode ? "inline-flex" : "none";
            if (!configureButton.disabled) {
                configureButton.textContent = getConfigureButtonLabel();
            }
        }
        if (configureNote) {
            configureNote.style.display = isConfigureMode ? "block" : "none";
            configureNote.textContent = isConfigureMode ? getConfigureNoteText() : "";
        }
        if (copyScriptSaveButton instanceof HTMLButtonElement) {
            copyScriptSaveButton.style.display = isConfigureMode ? "inline-flex" : "none";
            if (!copyScriptSaveButton.disabled) {
                copyScriptSaveButton.textContent = getManualActionLabel();
            }
        }
        if (saveButton instanceof HTMLButtonElement && !saveButton.disabled) {
            saveButton.textContent = getPrimaryActionLabel();
        }
    };

    const runConfigureAppRegistration = async () => {
        const clientId = getCurrentClientId();
        if (!clientId) {
            return {
                success: false,
                message: "Client ID is required before Configure App can update app registration.",
                script: buildAdminHandOffScript("Client ID is missing."),
            };
        }

        if (!window.toolboxAPI?.connections?.configureAppRegistration) {
            return {
                success: false,
                message: "App registration automation API is unavailable in this modal.",
                script: buildAdminHandOffScript("App registration automation API is unavailable in this modal."),
            };
        }

        return await window.toolboxAPI.connections.configureAppRegistration(clientId, isPowerPlatformApiEnabled());
    };

    const copyAdminHandOffScript = async (validationMessage) => {
        const script = pendingConfigureSaveScript || buildAdminHandOffScript(validationMessage);
        try {
            await window.toolboxAPI.utils.copyToClipboard(script);
        } catch {
            // Copy is best-effort; still continue with the failure message.
        }

        await window.toolboxAPI.utils.showNotification({
            title: "Setup script copied",
            body: "The PowerShell handoff script has been copied for your admin.",
            type: "warning",
        });
    };

    const getGeneratedAppRegistrationScript = async () => {
        const clientId = getCurrentClientId();
        if (!clientId || !window.toolboxAPI?.connections?.configureAppRegistration) {
            return "";
        }

        try {
            const generatedResult = await window.toolboxAPI.connections.configureAppRegistration(clientId, isPowerPlatformApiEnabled(), true);
            if (generatedResult && typeof generatedResult.script === "string" && generatedResult.script.trim().length > 0) {
                return generatedResult.script;
            }
        } catch {
            // Fall back to the local handoff script.
        }

        return "";
    };

    // Store the original connection ID
    let connectionId = null;

    // Environment default colors per env type (used by populateFormData and color picker setup)
    const ENV_COLORS = { Dev: "#2e7d32", Test: "#0288d1", UAT: "#f57c00", Production: "#c62828" };
    const getDefaultEnvColor = (env) => ENV_COLORS[env] || "#2e7d32";

    const updateAuthVisibility = () => {
        const authType = authTypeSelect?.value || "interactive";
        const showPowerPlatformApiOption = supportsPowerPlatformApi(authType);
        if (interactiveFields) interactiveFields.style.display = authType === "interactive" ? "flex" : "none";
        if (clientSecretFields) clientSecretFields.style.display = authType === "clientSecret" ? "flex" : "none";
        if (usernamePasswordFields) usernamePasswordFields.style.display = authType === "usernamePassword" ? "flex" : "none";
        if (connectionStringFields) connectionStringFields.style.display = authType === "connectionString" ? "flex" : "none";
        if (testButton) testButton.style.display = (authType === "interactive" || authType === "connectionString") ? "none" : "inline-flex";
        if (ppApiWrapper) ppApiWrapper.style.display = showPowerPlatformApiOption ? "" : "none";
        if (ppApiHelp) ppApiHelp.style.display = showPowerPlatformApiOption ? "" : "none";
        if (!showPowerPlatformApiOption && ppApiCheckbox instanceof HTMLInputElement) {
            ppApiCheckbox.checked = false;
        }
        updatePowerPlatformClientIdRequirement();
        updateConfigureFooterState();
    };

    const updatePowerPlatformClientIdRequirement = () => {
        const requiresClientId = ppApiCheckbox instanceof HTMLInputElement ? ppApiCheckbox.checked : false;

        if (interactiveClientIdInput instanceof HTMLInputElement) {
            interactiveClientIdInput.required = requiresClientId;
        }
        if (usernamePasswordClientIdInput instanceof HTMLInputElement) {
            usernamePasswordClientIdInput.required = requiresClientId;
        }

        if (interactiveClientIdLabel) {
            interactiveClientIdLabel.textContent = requiresClientId ? "Client ID (Required for Power Platform API)" : "Client ID (Optional)";
        }
        if (usernamePasswordClientIdLabel) {
            usernamePasswordClientIdLabel.textContent = requiresClientId ? "Client ID (Required for Power Platform API)" : "Client ID (Optional)";
        }
        updateConfigureFooterState();
    };

    const confirmPowerPlatformApiConsent = () => {
        return new Promise((resolve) => {
            const overlay = document.getElementById("pp-api-consent-overlay");
            const okBtn = document.getElementById("pp-api-consent-ok");
            const cancelBtn = document.getElementById("pp-api-consent-cancel");
            if (!overlay || !okBtn || !cancelBtn) {
                resolve(false);
                return;
            }
            overlay.classList.add("visible");
            const cleanup = (result) => {
                overlay.classList.remove("visible");
                okBtn.removeEventListener("click", onOk);
                cancelBtn.removeEventListener("click", onCancel);
                resolve(result);
            };
            const onOk = () => cleanup(true);
            const onCancel = () => cleanup(false);
            okBtn.addEventListener("click", onOk);
            cancelBtn.addEventListener("click", onCancel);
        });
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
                    // Store current value to restore after repopulating
                    const currentValue = browserProfileSelect.value;
                    browserProfileSelect.innerHTML = '<option value="">Use default profile</option>';
                    profiles.forEach(profile => {
                        const option = document.createElement("option");
                        option.value = profile.path;  // Use path as value for --profile-directory
                        option.textContent = profile.name;  // Display the friendly name
                        option.dataset.profileName = profile.name;
                        browserProfileSelect.appendChild(option);
                    });
                    // Restore previously selected value if it still exists
                    if (currentValue && profiles.some(p => p.path === currentValue)) {
                        browserProfileSelect.value = currentValue;
                    }
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

    ${getModalFeedbackScriptHelpers()}

    const updateTestFeedback = (data) => {
        if (!testFeedback) return;
        const message = getFeedbackMessage(data);
        if (typeof message === "string" && message.trim().length > 0) {
            const feedbackType = getFeedbackType(data);
            testFeedback.textContent = message;
            testFeedback.className = "modal-feedback " + feedbackType;
            testFeedback.style.display = "block";
        } else {
            testFeedback.textContent = "";
            testFeedback.className = "modal-feedback";
            testFeedback.style.display = "none";
        }
    };

    const getInputValue = (id) => {
        const el = document.getElementById(id);
        return el && "value" in el ? el.value.trim() : "";
    };

    const setInputValue = (id, value) => {
        const el = document.getElementById(id);
        if (el && "value" in el) {
            el.value = value || "";
        }
    };

    const collectFormData = () => ({
        id: connectionId,
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
        enabledForPowerPlatformAPI: (document.getElementById("connection-enabled-for-powerplatform-api")?.checked) ?? false,
        category: (() => {
            const sel = document.getElementById("connection-category-select");
            if (!(sel instanceof HTMLSelectElement)) return "";
            if (sel.value === "__new__") {
                const newInput = document.getElementById("connection-category-new");
                return newInput instanceof HTMLInputElement ? newInput.value.trim() : "";
            }
            return sel.value;
        })(),
        environmentColor: (() => {
            const colorInput = document.getElementById("connection-environment-color");
            return colorInput instanceof HTMLInputElement ? colorInput.value : "";
        })(),
        categoryColor: (() => {
            const sel = document.getElementById("connection-category-select");
            if (!(sel instanceof HTMLSelectElement) || !sel.value) return "";
            const colorInput = document.getElementById("connection-category-color");
            return colorInput instanceof HTMLInputElement ? colorInput.value : "";
        })(),
        ...(() => {
            const selection = getBrowserProfileSelection();
            return {
                browserProfile: selection.value,
                browserProfileName: selection.name,
            };
        })(),
    });

    const populateFormData = (connection) => {
        if (!connection) return;
        
        connectionId = connection.id;
        setInputValue("connection-name", connection.name);
        setInputValue("connection-url", connection.url);
        
        const envSelect = document.getElementById("connection-environment");
        if (envSelect) envSelect.value = connection.environment || "Dev";
        
        if (authTypeSelect) authTypeSelect.value = connection.authenticationType || "interactive";

        const ppApiCheckbox = document.getElementById("connection-enabled-for-powerplatform-api");
        if (ppApiCheckbox instanceof HTMLInputElement) {
            ppApiCheckbox.checked = connection.enabledForPowerPlatformAPI === true;
        }
        updatePowerPlatformClientIdRequirement();
        
        // Populate browser settings (applies to all auth types)
        setInputValue("connection-browser-type", connection.browserType || "default");
        // Load profiles for the browser type, then set the profile value
        loadBrowserProfiles().then(() => {
            if (connection.browserProfile && browserProfileSelect) {
                browserProfileSelect.value = connection.browserProfile;
            }
        });

        // Populate category — select existing if it exists, otherwise fall back to "new"
        const categorySelect = document.getElementById("connection-category-select");
        const categoryNewInput = document.getElementById("connection-category-new");
        if (categorySelect instanceof HTMLSelectElement) {
            const existingOpt = connection.category
                ? Array.from(categorySelect.options).find(o => o.value === connection.category && o.value !== "__new__")
                : null;
            if (existingOpt) {
                categorySelect.value = connection.category;
                if (categoryNewInput instanceof HTMLInputElement) {
                    categoryNewInput.style.display = "none";
                    categoryNewInput.value = "";
                }
            } else if (connection.category) {
                categorySelect.value = "__new__";
                if (categoryNewInput instanceof HTMLInputElement) {
                    categoryNewInput.style.display = "block";
                    categoryNewInput.value = connection.category;
                }
            } else {
                categorySelect.value = "";
                if (categoryNewInput instanceof HTMLInputElement) {
                    categoryNewInput.style.display = "none";
                    categoryNewInput.value = "";
                }
            }
        }

        // Populate environment color
        const colorInput = document.getElementById("connection-environment-color");
        const colorLabel = document.getElementById("connection-environment-color-label");
        const clearColorBtnEl = document.getElementById("clear-environment-color");
        if (colorInput instanceof HTMLInputElement) {
            const envDefault = getDefaultEnvColor(connection.environment || "Dev");
            if (connection.environmentColor && /^#[0-9A-Fa-f]{6}$/.test(connection.environmentColor)) {
                colorInput.value = connection.environmentColor;
                colorInput.dataset.customSet = connection.environmentColor !== envDefault ? "true" : "false";
                if (colorLabel) colorLabel.textContent = connection.environmentColor;
            } else {
                colorInput.value = envDefault;
                colorInput.dataset.customSet = "false";
                if (colorLabel) colorLabel.textContent = envDefault;
            }
            if (clearColorBtnEl instanceof HTMLButtonElement) {
                clearColorBtnEl.disabled = colorInput.value === envDefault;
            }
        }

        // Populate category color
        const catColorInput = document.getElementById("connection-category-color");
        const catColorLabel = document.getElementById("connection-category-color-label");
        if (catColorInput instanceof HTMLInputElement) {
            if (connection.categoryColor && /^#[0-9A-Fa-f]{6}$/.test(connection.categoryColor)) {
                catColorInput.value = connection.categoryColor;
                catColorInput.dataset.customSet = "true";
                if (catColorLabel) catColorLabel.textContent = connection.categoryColor;
            } else {
                catColorInput.value = "#2e7d32";
                catColorInput.dataset.customSet = "false";
                if (catColorLabel) catColorLabel.textContent = "Pick a color for the category";
            }
        }

        // Show/hide category color group and Reset button based on current selection
        const clearCatBtnEl = document.getElementById("clear-category-color");
        const catSelEl = document.getElementById("connection-category-select");
        const catColorGroupEl = document.getElementById("category-color-group");
        const catSelValue = catSelEl instanceof HTMLSelectElement ? catSelEl.value : "";
        if (catColorGroupEl) catColorGroupEl.style.display = catSelValue ? "" : "none";
        if (clearCatBtnEl instanceof HTMLButtonElement) {
            clearCatBtnEl.style.display = catSelValue === "__new__" ? "" : "none";
        }
        
        // Populate auth type specific fields
        if (connection.authenticationType === "clientSecret") {
            setInputValue("connection-client-id", connection.clientId);
            setInputValue("connection-client-secret", connection.clientSecret);
            setInputValue("connection-tenant-id-cs", connection.tenantId);
            // Populate Power Platform API checkbox for client secret auth
            const ppApiCheckbox = document.getElementById("connection-enabled-for-powerplatform-api");
            if (ppApiCheckbox instanceof HTMLInputElement) {
                ppApiCheckbox.checked = connection.enabledForPowerPlatformAPI === true;
            }
        } else if (connection.authenticationType === "usernamePassword") {
            setInputValue("connection-username-up", connection.username);
            setInputValue("connection-password", connection.password);
        } else if (connection.authenticationType === "interactive") {
            setInputValue("connection-username", connection.username);
            setInputValue("connection-optional-client-id", connection.clientId);
            setInputValue("connection-tenant-id", connection.tenantId);
        }
        
        updateAuthVisibility();
        updateConfigureFooterState();
    };

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

    ppApiCheckbox?.addEventListener("change", async () => {
        if (ppApiCheckbox instanceof HTMLInputElement && ppApiCheckbox.checked) {
            const agreed = await confirmPowerPlatformApiConsent();
            if (!agreed) {
                ppApiCheckbox.checked = false;
            }
        }
        updatePowerPlatformClientIdRequirement();
    });
    updatePowerPlatformClientIdRequirement();

    // Environment color picker setup
    const envSelectEl = document.getElementById("connection-environment");
    const colorInput = document.getElementById("connection-environment-color");
    const colorLabel = document.getElementById("connection-environment-color-label");
    const clearColorBtn = document.getElementById("clear-environment-color");

    const updateEnvColorResetState = () => {
        if (!(clearColorBtn instanceof HTMLButtonElement) || !(colorInput instanceof HTMLInputElement) || !(envSelectEl instanceof HTMLSelectElement)) return;
        clearColorBtn.disabled = colorInput.value === getDefaultEnvColor(envSelectEl.value || "Dev");
    };

    const applyEnvDefaultColor = (env, force) => {
        if (!(colorInput instanceof HTMLInputElement)) return;
        if (force || colorInput.dataset.customSet !== "true") {
            const defaultColor = getDefaultEnvColor(env);
            colorInput.value = defaultColor;
            colorInput.dataset.customSet = "false";
            if (colorLabel) colorLabel.textContent = defaultColor;
        }
        updateEnvColorResetState();
    };

    if (colorInput instanceof HTMLInputElement) {
        if (!colorInput.dataset.customSet) colorInput.dataset.customSet = "false";
        colorInput.addEventListener("input", () => {
            colorInput.dataset.customSet = "true";
            if (colorLabel) colorLabel.textContent = colorInput.value;
            updateEnvColorResetState();
        });
    }
    envSelectEl?.addEventListener("change", () => {
        applyEnvDefaultColor(envSelectEl instanceof HTMLSelectElement ? envSelectEl.value : "Dev", false);
    });
    clearColorBtn?.addEventListener("click", () => {
        applyEnvDefaultColor(envSelectEl instanceof HTMLSelectElement ? envSelectEl.value : "Dev", true);
    });

    // Category select + new-category input setup
    const categorySelect = document.getElementById("connection-category-select");
    const categoryNewInput = document.getElementById("connection-category-new");
    const categoryColorInput = document.getElementById("connection-category-color");
    const categoryColorLabel = document.getElementById("connection-category-color-label");
    const clearCategoryColorBtn = document.getElementById("clear-category-color");

    const resetCategoryColor = () => {
        if (categoryColorInput instanceof HTMLInputElement) {
            categoryColorInput.dataset.customSet = "false";
            categoryColorInput.value = "#2e7d32";
            if (categoryColorLabel) categoryColorLabel.textContent = "Pick a color for the category";
        }
    };

    const applyCategoryColor = (color) => {
        if (categoryColorInput instanceof HTMLInputElement && /^#[0-9A-Fa-f]{6}$/.test(color)) {
            categoryColorInput.value = color;
            if (categoryColorLabel) categoryColorLabel.textContent = color;
        }
    };

    // Load existing categories and populate the select
    let existingCategories = [];
    try {
        existingCategories = await window.toolboxAPI.connections.getCategories() || [];
        if (Array.isArray(existingCategories) && existingCategories.length > 0 && categorySelect instanceof HTMLSelectElement) {
            // Insert existing category options before the "+ New category..." option
            const newCatOption = categorySelect.querySelector('option[value="__new__"]');
            for (const cat of existingCategories) {
                const opt = document.createElement("option");
                opt.value = cat.name;
                opt.textContent = cat.name;
                categorySelect.insertBefore(opt, newCatOption);
            }
        }
    } catch (_) {
        // categories not critical — proceed without them
    }

    const onCategorySelectChange = () => {
        if (!(categorySelect instanceof HTMLSelectElement)) return;
        const val = categorySelect.value;
        if (categoryNewInput instanceof HTMLInputElement) {
            categoryNewInput.style.display = val === "__new__" ? "block" : "none";
            if (val !== "__new__") categoryNewInput.value = "";
        }
        // Show category color section only when a category is selected (not default/none)
        const catColorGroup = document.getElementById("category-color-group");
        if (catColorGroup) catColorGroup.style.display = val ? "" : "none";
        // Show Reset only when creating a new category
        if (clearCategoryColorBtn instanceof HTMLButtonElement) {
            clearCategoryColorBtn.style.display = val === "__new__" ? "" : "none";
        }
        // Auto-fill color for existing categories (don't override a manually set color)
        if (categoryColorInput instanceof HTMLInputElement && categoryColorInput.dataset.customSet !== "true") {
            if (!val || val === "__new__") {
                resetCategoryColor();
            } else {
                const match = existingCategories.find(c => c.name === val);
                if (match && match.color) {
                    applyCategoryColor(match.color);
                } else {
                    resetCategoryColor();
                }
            }
        }
    };

    categorySelect?.addEventListener("change", onCategorySelectChange);

    if (categoryColorInput instanceof HTMLInputElement) {
        if (!categoryColorInput.dataset.customSet) categoryColorInput.dataset.customSet = "false";
        categoryColorInput.addEventListener("input", () => {
            categoryColorInput.dataset.customSet = "true";
            if (categoryColorLabel) categoryColorLabel.textContent = categoryColorInput.value;
        });
    }
    clearCategoryColorBtn?.addEventListener("click", resetCategoryColor);

    [interactiveClientIdInput, usernamePasswordClientIdInput, authTypeSelect, ppApiCheckbox].forEach((element) => {
        element?.addEventListener?.("input", updateConfigureFooterState);
        element?.addEventListener?.("change", updateConfigureFooterState);
    });

    configureButton?.addEventListener("click", async () => {
        if (!(configureButton instanceof HTMLButtonElement)) return;

        setButtonState(configureButton, true, "Configuring...", getConfigureButtonLabel());
        updateTestFeedback("");

        try {
            const configureResult = await runConfigureAppRegistration();
            if (configureResult?.success) {
                await window.toolboxAPI.utils.showNotification({
                    title: "App Registration Configured",
                    body: typeof configureResult.message === "string" && configureResult.message.trim().length > 0 ? configureResult.message : "The app registration was configured successfully.",
                    type: "success",
                });
            } else {
                const failureMessage = typeof configureResult?.message === "string" && configureResult.message.trim().length > 0 ? configureResult.message : "Failed to configure app registration.";
                pendingConfigureSaveScript = typeof configureResult?.script === "string" && configureResult.script.trim().length > 0 ? configureResult.script : buildAdminHandOffScript(failureMessage);
                await copyAdminHandOffScript(failureMessage);
                updateTestFeedback({ message: failureMessage, type: "error" });
            }
        } catch (error) {
            const failureMessage = (error instanceof Error && error.message) || "Failed to configure app registration.";
            pendingConfigureSaveScript = buildAdminHandOffScript(failureMessage);
            await copyAdminHandOffScript(failureMessage);
            updateTestFeedback({ message: failureMessage, type: "error" });
        } finally {
            setButtonState(configureButton, false, "", getConfigureButtonLabel());
        }
    });

    // Browser type change listener
    browserTypeSelect?.addEventListener("change", () => {
        loadBrowserProfiles();
    });

    saveButton?.addEventListener("click", async () => {
        const formData = collectFormData();
        setButtonState(saveButton, true, "Updating...", getPrimaryActionLabel());
        setButtonState(copyScriptSaveButton, true, "Working...", getManualActionLabel());
        modalBridge.send(CHANNELS.submit, formData);
    });

    copyScriptSaveButton?.addEventListener("click", async () => {
        const formData = collectFormData();
        setButtonState(copyScriptSaveButton, true, "Copying...", getManualActionLabel());
        setButtonState(saveButton, true, "Working...", getPrimaryActionLabel());

        try {
            const generatedScript = await getGeneratedAppRegistrationScript();
            pendingConfigureSaveScript = generatedScript || buildAdminHandOffScript("Manual setup requested by user.");
            await copyAdminHandOffScript("Manual setup requested by user.");
            modalBridge.send(CHANNELS.submit, formData);
        } catch (error) {
            const failureMessage = (error instanceof Error && error.message) || "Failed to copy setup script.";
            updateTestFeedback({ message: failureMessage, type: "error" });
            setButtonState(copyScriptSaveButton, false, "", getManualActionLabel());
            setButtonState(saveButton, false, "", getPrimaryActionLabel());
        }
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
            pendingConfigureSaveScript = "";
            setButtonState(saveButton, false, "", getPrimaryActionLabel());
            setButtonState(copyScriptSaveButton, false, "", getManualActionLabel());
        }
        if (payload.channel === CHANNELS.testReady) {
            setButtonState(testButton, false, "", "Test Connection");
        }
        if (payload.channel === CHANNELS.testFeedback) {
            updateTestFeedback(payload.data);
        }
        if (payload.channel === CHANNELS.populateConnection) {
            populateFormData(payload.data);
        }
    });

    ["cancel-connection-btn", "close-connection-modal"].forEach((id) => {
        const el = document.getElementById(id);
        el?.addEventListener("click", () => modalBridge.close());
    });

    // Request connection data on load
    modalBridge.send(CHANNELS.populateConnection);
})();
</script>`;
}
