/**
 * Theme tokens for Power Platform Tool Box
 * Inspired by pptb-web (https://github.com/PowerPlatformToolBox/pptb-web)
 * Based on Microsoft Fluent Design System
 */

import { createLightTheme, createDarkTheme, Theme, BrandVariants } from "@fluentui/react-components";

// PPTB Brand Colors - using blue as the primary brand color
// This will be overridden with gradient in CSS for primary buttons
const pptbBrandColors: BrandVariants = {
    10: "#061724",
    20: "#082338",
    30: "#0a2f4c",
    40: "#0c3b5f",
    50: "#0e4775",
    60: "#0f5389",
    70: "#115ea0",
    80: "#0078d4", // Primary blue
    90: "#1890f1",
    100: "#3aa0f3",
    110: "#6cb8f6",
    120: "#9ecffa",
    130: "#c7e0f4",
    140: "#deecf9",
    150: "#eff6fc",
    160: "#f6fafe",
};

// Custom color tokens matching pptb-web
export const pptbColors = {
    blue: "#0078D4",
    purple: "#8A3FFC",
    dark: "#0F172A",
    mid: "#1E293B",
    light: "#475569",
    background: "#F8FAFC",
    surface: "#FFFFFF",
};

// Create light theme with PPTB brand colors
export const pptbLightTheme: Theme = createLightTheme(pptbBrandColors);

// Create dark theme with PPTB brand colors
export const pptbDarkTheme: Theme = createDarkTheme(pptbBrandColors);
