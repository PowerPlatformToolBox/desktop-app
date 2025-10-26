import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
    plugins: [
        electron({
            main: {
                // Main process entry point
                entry: "src/main/index.ts",
                vite: {
                    build: {
                        outDir: "dist/main",
                        rollupOptions: {
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
                // Preload script
                input: "src/main/preload.ts",
                vite: {
                    build: {
                        outDir: "dist/main",
                        rollupOptions: {
                            output: {
                                entryFileNames: "preload.js",
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

                // Copy static assets
                const assetsToCopy = [
                    { from: "src/renderer/toolboxAPIBridge.js", to: "dist/renderer/toolboxAPIBridge.js" },
                ];

                assetsToCopy.forEach(({ from, to }) => {
                    try {
                        copyFileSync(from, to);
                    } catch (e) {
                        console.error(`Failed to copy ${from} to ${to}:`, e);
                    }
                });

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
            },
        },
    ],
    build: {
        // Renderer process build configuration
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
});
