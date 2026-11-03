import { BrowserWindow } from "electron";
import { logError } from "../../common/logger";
import type { ProviderPromptField, ProviderPromptFieldOption, ProviderPromptFieldType, ProviderPromptRequest, ProviderPromptResult } from "../../common/types";
import { resolveTheme } from "../utils/theme";
import type { SettingsManager } from "./settingsManager";

const SUBMIT_URL_PREFIX = "pptb-provider-prompt://submit/";
const CANCEL_URL = "pptb-provider-prompt://cancel/";
const MAX_VALUE_LENGTH = 4000;
const MAX_FIELDS = 12;
const MAX_OPTIONS = 50;
const MAX_LABEL_LENGTH = 200;
const FIELD_TYPES: ProviderPromptFieldType[] = ["text", "multiline", "password", "select", "checkbox"];

/** Field metadata embedded in the prompt page's inline script to collect and validate results. */
interface FieldScriptMeta {
    domId: string;
    id: string;
    type: ProviderPromptFieldType;
    required: boolean;
}

interface QueuedPrompt {
    providerName: string;
    request: ProviderPromptRequest;
    resolve: (value: ProviderPromptResult | null) => void;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/** Safely embeds a JSON value inside an inline <script> block (prevents "</script>" and line-terminator breakout). */
function toInlineJson(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, "\\u003C")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

function clampText(value: unknown, max: number): string | undefined {
    return typeof value === "string" ? value.slice(0, max) : undefined;
}

/**
 * Shows forms requested by extension connection providers (e.g. a justification for accessing a
 * connection). Providers describe the fields they need as a small, typed schema - they never supply
 * markup or script. The host renders the form itself from that schema and validates the result
 * against it, so a provider cannot smuggle extra values, options it never offered, or raw HTML/JS
 * through a prompt.
 *
 * Prompts are shown one at a time in a dedicated modal window rather than the shared renderer modal, so they
 * can appear on top of other modals (such as the connection picker) without replacing them. The prompt page
 * has no preload or Node access; its result is returned by navigating to a sentinel URL that is intercepted here.
 */
export class ConnectionProviderPromptManager {
    private readonly queue: QueuedPrompt[] = [];
    private active: { window: BrowserWindow; prompt: QueuedPrompt } | null = null;

    constructor(
        private readonly getParentWindow: () => BrowserWindow | null,
        private readonly settingsManager: SettingsManager,
    ) {}

    prompt(providerName: string, request: ProviderPromptRequest): Promise<ProviderPromptResult | null> {
        return new Promise((resolve) => {
            this.queue.push({ providerName, request: this.sanitizeRequest(request), resolve });
            this.showNext();
        });
    }

    dispose(): void {
        while (this.queue.length > 0) this.queue.shift()?.resolve(null);
        if (this.active && !this.active.window.isDestroyed()) this.active.window.destroy();
    }

    private sanitizeRequest(request: ProviderPromptRequest): ProviderPromptRequest {
        const usedIds = new Set<string>();
        const rawFields = Array.isArray(request?.fields) ? request.fields : [];
        const fields: ProviderPromptField[] = [];
        for (let i = 0; i < rawFields.length && fields.length < MAX_FIELDS; i++) {
            const sanitized = this.sanitizeField(rawFields[i], i, usedIds);
            if (sanitized) fields.push(sanitized);
        }
        return {
            title: clampText(request?.title, MAX_LABEL_LENGTH) || "Input required",
            message: clampText(request?.message, 2000),
            confirmLabel: clampText(request?.confirmLabel, 40) || "OK",
            cancelLabel: clampText(request?.cancelLabel, 40) || "Cancel",
            fields,
        };
    }

    private sanitizeField(raw: unknown, index: number, usedIds: Set<string>): ProviderPromptField | null {
        const field = raw as Partial<ProviderPromptField> | null;
        if (!field || typeof field !== "object") return null;

        let id = clampText(field.id, 100) || `field${index}`;
        while (usedIds.has(id)) id = `${id}-${index}`;
        usedIds.add(id);

        const type = FIELD_TYPES.includes(field.type as ProviderPromptFieldType) ? (field.type as ProviderPromptFieldType) : "text";
        const label = clampText(field.label, MAX_LABEL_LENGTH);
        const placeholder = type === "checkbox" ? undefined : clampText(field.placeholder, MAX_LABEL_LENGTH);
        const required = field.required === true;

        if (type === "select") {
            const options = this.sanitizeOptions(field.options);
            if (options.length === 0) {
                // A select with no valid options can't be used; fall back to a plain text field.
                return { id, type: "text", label, placeholder, required, defaultValue: clampText(field.defaultValue, MAX_VALUE_LENGTH) };
            }
            const defaultValue = typeof field.defaultValue === "string" && options.some((o) => o.value === field.defaultValue) ? field.defaultValue : options[0].value;
            return { id, type, label, required, options, defaultValue };
        }

        if (type === "checkbox") {
            return { id, type, label, required, defaultValue: field.defaultValue === true };
        }

        return { id, type, label, placeholder, required, defaultValue: clampText(field.defaultValue, MAX_VALUE_LENGTH) };
    }

    private sanitizeOptions(raw: unknown): ProviderPromptFieldOption[] {
        if (!Array.isArray(raw)) return [];
        const seen = new Set<string>();
        const options: ProviderPromptFieldOption[] = [];
        for (const entry of raw) {
            if (options.length >= MAX_OPTIONS) break;
            const value = clampText((entry as Partial<ProviderPromptFieldOption> | null)?.value, MAX_LABEL_LENGTH);
            if (!value || seen.has(value)) continue;
            const label = clampText((entry as Partial<ProviderPromptFieldOption> | null)?.label, MAX_LABEL_LENGTH) || value;
            seen.add(value);
            options.push({ value, label });
        }
        return options;
    }

    private showNext(): void {
        if (this.active) return;
        const next = this.queue.shift();
        if (!next) return;

        if (next.request.fields.length === 0) {
            // Nothing to show or collect; treat it as an immediate cancel rather than rendering an empty form.
            next.resolve(null);
            this.showNext();
            return;
        }

        const parent = this.getParentWindow();
        if (!parent || parent.isDestroyed()) {
            next.resolve(null);
            this.showNext();
            return;
        }

        const isDark = resolveTheme(this.settingsManager.getSetting("theme") ?? "system") === "dark";
        const promptWindow = new BrowserWindow({
            parent,
            modal: true,
            width: 520,
            height: this.computeHeight(next.request.fields),
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            show: false,
            title: next.request.title,
            backgroundColor: isDark ? "#1f1f1f" : "#ffffff",
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });
        promptWindow.setMenu(null);

        let settled = false;
        const finish = (value: ProviderPromptResult | null) => {
            if (settled) return;
            settled = true;
            this.active = null;
            next.resolve(value);
            if (!promptWindow.isDestroyed()) promptWindow.destroy();
            this.showNext();
        };

        this.active = { window: promptWindow, prompt: next };
        promptWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        promptWindow.webContents.on("will-navigate", (event, url) => {
            event.preventDefault();
            if (url.startsWith(SUBMIT_URL_PREFIX)) {
                const result = this.parseSubmission(url, next.request.fields);
                if (result) finish(result);
            } else if (url.startsWith(CANCEL_URL)) {
                finish(null);
            }
        });
        promptWindow.on("closed", () => finish(null));
        promptWindow.once("ready-to-show", () => promptWindow.show());
        promptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.buildHtml(next, isDark))}`).catch((error) => {
            logError("Failed to show connection provider prompt", error);
            finish(null);
        });
    }

    private computeHeight(fields: ProviderPromptField[]): number {
        const HEADER = 150;
        const FOOTER = 70;
        const heights: Record<ProviderPromptFieldType, number> = { text: 64, password: 64, select: 64, checkbox: 32, multiline: 140 };
        const total = HEADER + FOOTER + fields.reduce((sum, field) => sum + heights[field.type], 0);
        return Math.min(Math.max(total, 260), 760);
    }

    /**
     * Parses and validates a submitted sentinel URL against the original field schema. Returns null
     * (ignoring the submission) if the payload is malformed, a required field is missing, or a
     * "select" value isn't one of the options the host actually offered.
     */
    private parseSubmission(url: string, fields: ProviderPromptField[]): ProviderPromptResult | null {
        let raw: unknown;
        try {
            const encoded = url.slice(SUBMIT_URL_PREFIX.length);
            if (encoded.length > MAX_FIELDS * (MAX_VALUE_LENGTH + MAX_LABEL_LENGTH)) return null;
            raw = JSON.parse(decodeURIComponent(encoded));
        } catch {
            return null;
        }
        if (!raw || typeof raw !== "object") return null;
        const submitted = raw as Record<string, unknown>;

        const result: ProviderPromptResult = {};
        for (const field of fields) {
            const value = submitted[field.id];
            if (field.type === "checkbox") {
                result[field.id] = value === true;
                continue;
            }

            const text = typeof value === "string" ? value.slice(0, MAX_VALUE_LENGTH) : "";
            if (field.required && !text.trim()) return null;
            if (field.type === "select" && text && !field.options?.some((o) => o.value === text)) return null;
            result[field.id] = text;
        }
        return result;
    }

    private buildHtml(prompt: QueuedPrompt, isDark: boolean): string {
        const { request, providerName } = prompt;
        const fg = isDark ? "#ffffff" : "#242424";
        const muted = isDark ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.65)";
        const border = isDark ? "#5c5c5c" : "#d1d1d1";
        const inputBg = isDark ? "#292929" : "#ffffff";

        const scriptMeta: FieldScriptMeta[] = request.fields.map((field, i) => ({ domId: `f${i}`, id: field.id, type: field.type, required: field.required === true }));
        const fieldsHtml = request.fields.map((field, i) => this.buildFieldHtml(field, `f${i}`)).join("\n");

        return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
    <title>${escapeHtml(request.title)}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 20px 24px; font-family: "Segoe UI", system-ui, sans-serif; font-size: 14px; color: ${fg}; background: ${isDark ? "#1f1f1f" : "#ffffff"}; display: flex; flex-direction: column; gap: 12px; height: 100vh; overflow-y: auto; }
        .eyebrow { margin: 0; font-size: 12px; color: ${muted}; text-transform: uppercase; letter-spacing: .04em; }
        h1 { margin: 0; font-size: 18px; font-weight: 600; }
        p.message { margin: 0; line-height: 1.5; color: ${muted}; white-space: pre-wrap; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field.checkbox-field { flex-direction: row; align-items: center; gap: 8px; }
        label { font-weight: 600; font-size: 13px; }
        .checkbox-field label { font-weight: 400; display: flex; align-items: center; gap: 8px; }
        input, textarea, select { width: 100%; padding: 8px 10px; font: inherit; color: ${fg}; background: ${inputBg}; border: 1px solid ${border}; border-radius: 4px; resize: vertical; }
        input[type="checkbox"] { width: auto; }
        input:focus, textarea:focus, select:focus { outline: 2px solid #0f6cbd; outline-offset: -1px; }
        .spacer { flex: 1; }
        footer { display: flex; justify-content: flex-end; gap: 8px; }
        button { min-width: 96px; padding: 6px 16px; font: inherit; font-weight: 600; border-radius: 4px; cursor: pointer; border: 1px solid ${border}; background: transparent; color: ${fg}; }
        button.primary { background: #0f6cbd; border-color: #0f6cbd; color: #ffffff; }
        button:disabled { opacity: .5; cursor: default; }
    </style>
</head>
<body>
    <p class="eyebrow">${escapeHtml(providerName)}</p>
    <h1>${escapeHtml(request.title)}</h1>
    ${request.message ? `<p class="message">${escapeHtml(request.message)}</p>` : ""}
    ${fieldsHtml}
    <div class="spacer"></div>
    <footer>
        <button id="cancel" type="button">${escapeHtml(request.cancelLabel ?? "Cancel")}</button>
        <button id="ok" class="primary" type="button">${escapeHtml(request.confirmLabel ?? "OK")}</button>
    </footer>
    <script>
        const FIELDS = ${toInlineJson(scriptMeta)};
        const ok = document.getElementById("ok");
        const elementFor = (f) => document.getElementById(f.domId);
        const isValid = () => FIELDS.every((f) => {
            if (!f.required) return true;
            const el = elementFor(f);
            return f.type === "checkbox" ? el.checked : el.value.trim().length > 0;
        });
        const update = () => { ok.disabled = !isValid(); };
        const collect = () => {
            const result = {};
            for (const f of FIELDS) {
                const el = elementFor(f);
                result[f.id] = f.type === "checkbox" ? el.checked : el.value;
            }
            return result;
        };
        const submit = () => { if (isValid()) window.location.href = "${SUBMIT_URL_PREFIX}" + encodeURIComponent(JSON.stringify(collect())); };
        FIELDS.forEach((f) => {
            const el = elementFor(f);
            el.addEventListener(f.type === "checkbox" || f.type === "select" ? "change" : "input", update);
        });
        ok.addEventListener("click", submit);
        document.getElementById("cancel").addEventListener("click", () => { window.location.href = "${CANCEL_URL}"; });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") window.location.href = "${CANCEL_URL}";
            if (event.key === "Enter" && document.activeElement && document.activeElement.tagName !== "TEXTAREA") { event.preventDefault(); submit(); }
        });
        update();
        if (FIELDS.length > 0) elementFor(FIELDS[0]).focus();
    </script>
</body>
</html>`;
    }

    private buildFieldHtml(field: ProviderPromptField, domId: string): string {
        const label = field.label ? `<label for="${domId}">${escapeHtml(field.label)}</label>` : "";
        const defaultText = typeof field.defaultValue === "string" ? field.defaultValue : "";

        switch (field.type) {
            case "checkbox":
                return `<div class="field checkbox-field"><label><input id="${domId}" type="checkbox" ${field.defaultValue === true ? "checked" : ""} /> ${escapeHtml(field.label ?? "")}</label></div>`;
            case "select": {
                const options = (field.options ?? [])
                    .map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === defaultText ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
                    .join("");
                return `<div class="field">${label}<select id="${domId}">${options}</select></div>`;
            }
            case "multiline":
                return `<div class="field">${label}<textarea id="${domId}" rows="5" placeholder="${escapeHtml(field.placeholder ?? "")}">${escapeHtml(defaultText)}</textarea></div>`;
            case "password":
                return `<div class="field">${label}<input id="${domId}" type="password" placeholder="${escapeHtml(field.placeholder ?? "")}" value="${escapeHtml(defaultText)}" autocomplete="off" /></div>`;
            case "text":
            default:
                return `<div class="field">${label}<input id="${domId}" type="text" placeholder="${escapeHtml(field.placeholder ?? "")}" value="${escapeHtml(defaultText)}" /></div>`;
        }
    }
}
