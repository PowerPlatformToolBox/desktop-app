import { makeStaticStyles } from "@fluentui/react-components";

// Global/static styles migrated from SCSS. These include CSS variables, resets, scrollbar styling,
// and Fluent UI primary button gradient overrides.
// NOTE: Prefer theme tokens for future work; variables retained for quick migration parity.
export const useGlobalStyles = makeStaticStyles([
    {
        "*": {
            margin: 0,
            padding: 0,
            boxSizing: "border-box",
        },
        ":root": {
            "--primary-color": "linear-gradient(to right, #0078D4, #8A3FFC)",
            "--primary-hover": "linear-gradient(to right, #106ebe, #7a35e0)",
            "--secondary-color": "#f3f2f1",
            "--text-color": "#323130",
            "--bg-color": "#ffffff",
            "--sidebar-bg": "#f3f2f1",
            "--border-color": "#edebe9",
            "--shadow": "0 2px 8px rgba(0,0,0,0.1)",
            "--shadow-hover": "0 4px 16px rgba(0,0,0,0.15)",
            "--favorite-star-color": "#ffd700",
            "--pptb-gradient": "linear-gradient(to right, #0078D4, #8A3FFC)",
            "--pptb-gradient-hover": "linear-gradient(to right, #106ebe, #7a35e0)",
        },
        body: {
            fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
            color: "var(--text-color)",
            backgroundColor: "var(--bg-color)",
            overflow: "hidden",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
        },
        ".app-container": {
            display: "flex",
            height: "calc(100vh - var(--pptb-footer-height, 32px))",
        },
        "body.dark-theme": {
            "--text-color": "#e1e1e1",
            "--bg-color": "#1e1e1e",
            "--sidebar-bg": "#252526",
            "--border-color": "#3e3e42",
            "--secondary-color": "#2d2d30",
            "--favorite-star-color": "#ffd700",
        },
        "::-webkit-scrollbar": {
            width: "12px",
            height: "12px",
        },
        "::-webkit-scrollbar-track": {
            background: "var(--sidebar-bg)",
        },
        "::-webkit-scrollbar-thumb": {
            background: "var(--border-color)",
            borderRadius: "6px",
        },
        "::-webkit-scrollbar-thumb:hover": {
            background: "var(--text-color)",
            opacity: 0.5,
        },
        // Fluent UI primary button gradient override
        ".fui-Button.fui-Button__appearance--primary": {
            background: "var(--pptb-gradient) !important",
            border: "none !important",
            color: "white !important",
            fontWeight: 500,
            transition: "all 0.2s ease",
        },
        ".fui-Button.fui-Button__appearance--primary:hover": {
            background: "var(--pptb-gradient-hover) !important",
            transform: "translateY(-1px)",
            boxShadow: "0 4px 8px rgba(0,0,0,0.15)",
        },
        ".fui-Button.fui-Button__appearance--primary:active": {
            transform: "translateY(0)",
        },
    },
    // Terminal styles
    {
        ".terminal-tab": {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            backgroundColor: "var(--secondary-color)",
            borderRight: "1px solid var(--border-color)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontSize: "13px",
            color: "var(--text-color)",
            border: "none",
            transition: "background-color 0.15s ease",
        },
        ".terminal-tab:hover": {
            backgroundColor: "var(--bg-color)",
        },
        ".terminal-tab.active": {
            backgroundColor: "var(--bg-color)",
            borderBottom: "2px solid #0078D4",
        },
        ".terminal-tab-close": {
            background: "none",
            border: "none",
            color: "var(--text-color)",
            opacity: 0.6,
            cursor: "pointer",
            padding: 0,
            width: "16px",
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "2px",
        },
        ".terminal-tab-close:hover": {
            opacity: 1,
            backgroundColor: "rgba(0,0,0,0.1)",
        },
        ".terminal-output": {
            display: "none",
            width: "100%",
            height: "100%",
            overflow: "auto",
            padding: "8px",
        },
        ".terminal-output.active": {
            display: "block",
        },
        ".terminal-output-content": {
            fontFamily: "'Cascadia Code', 'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: "13px",
            lineHeight: "1.5",
            margin: 0,
            color: "#CCCCCC",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
        },
    },
]);
