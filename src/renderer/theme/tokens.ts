/**
 * Theme tokens for Power Platform Tool Box
 * Inspired by pptb-web (https://github.com/PowerPlatformToolBox/pptb-web)
 * Based on Microsoft Fluent Design System
 */

import { createLightTheme, createDarkTheme, Theme, BrandVariants } from "@fluentui/react-components";

// PPTB Brand Colors - aligned with pptb-web
const pptbBrandColors: BrandVariants = {
    10: "#020305",
    20: "#0D1726",
    30: "#16253D",
    40: "#1E3154",
    50: "#263E6C",
    60: "#2E4B85",
    70: "#3659A0",
    80: "#4068BB",
    90: "#5A7DD6",
    100: "#7592E3",
    110: "#8FA7EE",
    120: "#A9BCF6",
    130: "#C3D1FC",
    140: "#DDE5FF",
    150: "#EEF2FF",
    160: "#F8FAFF",
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

// Create light theme
export const lightTheme: Theme = {
    ...createLightTheme(pptbBrandColors),
};

// Create dark theme
export const darkTheme: Theme = {
    ...createDarkTheme(pptbBrandColors),
};

// Custom CSS variables for additional PPTB styling
export const customCssVariables = `
    :root {
        --pptb-color-blue: #0078D4;
        --pptb-color-purple: #8A3FFC;
        --pptb-color-dark: #0F172A;
        --pptb-color-mid: #1E293B;
        --pptb-color-light: #475569;
        --pptb-color-background: #F8FAFC;
        --pptb-color-surface: #FFFFFF;
        
        --pptb-shadow-fluent: 0 4px 12px rgba(0, 0, 0, 0.08);
        --pptb-shadow-card: 0 2px 8px rgba(0, 0, 0, 0.05);
        --pptb-shadow-glow: 0 0 20px rgba(138, 63, 252, 0.3);
        
        --pptb-gradient: linear-gradient(to right, #0078D4, #8A3FFC);
        
        --pptb-activity-bar-width: 48px;
        --pptb-sidebar-width: 280px;
        --pptb-footer-height: 32px;
    }
    
    body.dark-theme {
        --pptb-color-background: #0F172A;
        --pptb-color-surface: #1E293B;
        --pptb-color-mid: #94A3B8;
        --pptb-color-light: #CBD5E1;
    }
`;
