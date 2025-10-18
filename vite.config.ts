import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import path from "path";
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
                    const fs = require("fs");
                    let htmlContent = fs.readFileSync(nestedHtml, "utf-8");

                    // Fix asset paths from ../../assets/ to ./assets/
                    htmlContent = htmlContent.replace(/\.\.\/\.\.\/assets\//g, "./assets/");

                    // Write to target location
                    fs.writeFileSync(targetHtml, htmlContent);

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
                } catch (e) {
                    // Directory already exists
                }

                // Copy static assets
                const assetsToCopy = [
                    { from: "src/renderer/tools.json", to: "dist/renderer/tools.json" },
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
                const iconsSourceDir = "src/renderer/icons";
                const iconsTargetDir = "dist/renderer/icons";
                try {
                    if (existsSync(iconsSourceDir)) {
                        const iconFiles = readdirSync(iconsSourceDir);
                        iconFiles.forEach((file: string) => {
                            const sourcePath = path.join(iconsSourceDir, file);
                            const targetPath = path.join(iconsTargetDir, file);
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
        },
    },
    // Resolve aliases
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
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
