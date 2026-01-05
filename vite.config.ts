import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";
import electron from "vite-plugin-electron/simple";

export default defineConfig(({ mode }) => {
    const isProd = mode === "production";
    const enableSourceMap = !isProd; // keep source maps out of production builds

    // Load environment variables from .env file
    const env = loadEnv(mode, process.cwd(), "");

    // Debug: Log if Supabase credentials are loaded
    const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL || "";
    const supabaseKey = env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
    const appInsightsConnectionString = env.APPINSIGHTS_CONNECTION_STRING || process.env.APPINSIGHTS_CONNECTION_STRING || "";

    if (supabaseUrl && supabaseKey) {
        console.log("[Vite] Supabase credentials loaded successfully");
    } else {
        console.warn("[Vite] WARNING: Supabase credentials not found in environment");
        console.warn("[Vite] Make sure .env file exists with SUPABASE_URL and SUPABASE_ANON_KEY");
    }

    if (appInsightsConnectionString) {
        console.log("[Vite] Application Insights connection string loaded successfully");
    } else {
        console.log("[Vite] Application Insights connection string not provided (telemetry will be disabled)");
    }

    // Define environment variables for the build
    // These will be replaced at build time, not exposed in the bundle
    const envDefines = {
        "process.env.SUPABASE_URL": JSON.stringify(supabaseUrl),
        "process.env.SUPABASE_ANON_KEY": JSON.stringify(supabaseKey),
        "process.env.APPINSIGHTS_CONNECTION_STRING": JSON.stringify(appInsightsConnectionString),
    };

    return {
        plugins: [
            electron({
                main: {
                    // Main process entry point
                    entry: "src/main/index.ts",
                    vite: {
                        define: envDefines,
                        build: {
                            // Only include source maps when not building for production
                            sourcemap: enableSourceMap,
                            outDir: "dist/main",
                            rollupOptions: {
                                // Externalize applicationinsights to avoid bundling issues
                                // It will be loaded at runtime via Node.js require()
                                external: ["applicationinsights"],
                                output: {
                                    entryFileNames: "index.js",
                                },
                            },
                        },
                        plugins: [
                            // Bundle analysis for main process
                            visualizer({
                                filename: "dist/stats-main.html",
                                open: false,
                                gzipSize: true,
                                brotliSize: true,
                            }),
                        ],
                    },
                },
                preload: {
                    // Preload scripts - build both main window preload and tool preload
                    input: {
                        preload: "src/main/preload.ts",
                        toolPreloadBridge: "src/main/toolPreloadBridge.ts",
                        notificationPreload: "src/main/notificationPreload.ts",
                        modalPreload: "src/main/modalPreload.ts",
                    },
                    vite: {
                        build: {
                            // Only include source maps when not building for production
                            sourcemap: enableSourceMap,
                            outDir: "dist/main",
                            rollupOptions: {
                                output: {
                                    entryFileNames: "[name].js",
                                    inlineDynamicImports: false,
                                },
                            },
                        },
                    },
                },
                // Polyfill node built-in modules for renderer process
                renderer: {},
            }),
            // Custom plugin to reorganize output and copy static assets
            {
                name: "reorganize-output",
                closeBundle() {
                    // Move HTML from nested path to root of dist/renderer and fix paths
                    const nestedHtml = "dist/renderer/src/renderer/index.html";
                    const targetHtml = "dist/renderer/index.html";

                    if (existsSync(nestedHtml)) {
                        // Read the HTML content
                        let htmlContent = readFileSync(nestedHtml, "utf-8");

                        // Fix asset paths from ../../assets/ to ./assets/
                        htmlContent = htmlContent.replace(/\.\.\/\.\.\/assets\//g, "./assets/");

                        // Write to target location
                        writeFileSync(targetHtml, htmlContent);

                        // Clean up nested directory structure
                        try {
                            rmSync("dist/renderer/src", { recursive: true, force: true });
                        } catch (e) {
                            // Ignore cleanup errors
                        }
                    }

                    // Create icons directory if it doesn't exist
                    try {
                        mkdirSync("dist/renderer/icons", { recursive: true });
                        mkdirSync("dist/renderer/icons/light", { recursive: true });
                        mkdirSync("dist/renderer/icons/dark", { recursive: true });
                    } catch (e) {
                        // Directory already exists
                    }

                    // Note: toolboxAPIBridge.js has been removed as tools now use toolPreloadBridge.ts via BrowserView preload

                    // Copy entire icons directory
                    const iconsLightSourceDir = "src/renderer/icons/light";
                    const iconsLightTargetDir = "dist/renderer/icons/light";
                    try {
                        if (existsSync(iconsLightSourceDir)) {
                            const iconFiles = readdirSync(iconsLightSourceDir);
                            iconFiles.forEach((file: string) => {
                                const sourcePath = path.join(iconsLightSourceDir, file);
                                const targetPath = path.join(iconsLightTargetDir, file);
                                copyFileSync(sourcePath, targetPath);
                            });
                        }
                    } catch (e) {
                        console.error(`Failed to copy icons directory:`, e);
                    }
                    const iconsDarkSourceDir = "src/renderer/icons/dark";
                    const iconsDarkTargetDir = "dist/renderer/icons/dark";
                    try {
                        if (existsSync(iconsDarkSourceDir)) {
                            const iconFiles = readdirSync(iconsDarkSourceDir);
                            iconFiles.forEach((file: string) => {
                                const sourcePath = path.join(iconsDarkSourceDir, file);
                                const targetPath = path.join(iconsDarkTargetDir, file);
                                copyFileSync(sourcePath, targetPath);
                            });
                        }
                    } catch (e) {
                        console.error(`Failed to copy icons directory:`, e);
                    }

                    // Copy registry.json for fallback when Supabase is not configured
                    const registrySource = "src/main/data/registry.json";
                    const registryTargetDir = "dist/main/data";
                    const registryTarget = path.join(registryTargetDir, "registry.json");
                    try {
                        if (existsSync(registrySource)) {
                            mkdirSync(registryTargetDir, { recursive: true });
                            copyFileSync(registrySource, registryTarget);
                        }
                    } catch (e) {
                        console.error(`Failed to copy registry.json:`, e);
                    }
                },
            },
        ],
        build: {
            // Renderer process build configuration
            // Only include source maps when not building for production
            sourcemap: enableSourceMap,
            outDir: "dist/renderer",
            rollupOptions: {
                input: path.resolve(__dirname, "src/renderer/index.html"),
                output: {
                    // Configure code splitting
                    manualChunks: (id) => {
                        // Split vendor dependencies into separate chunk
                        if (id.includes("node_modules")) {
                            return "vendor";
                        }
                    },
                },
                plugins: [
                    // Bundle analysis for renderer process
                    visualizer({
                        filename: "dist/stats-renderer.html",
                        open: false,
                        gzipSize: true,
                        brotliSize: true,
                    }),
                ],
            },
        },
        // Resolve aliases
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "src"),
            },
        },
        // CSS preprocessing configuration
        css: {
            preprocessorOptions: {
                scss: {
                    // Add global SCSS variables/mixins if needed
                    // additionalData: `@import "@/styles/variables.scss";`
                },
            },
        },
        // Dev server configuration
        server: {
            port: 5173,
        },
        // Base path for assets
        base: "./",
        // Copy static assets from src/renderer
        publicDir: false,
    };
});
