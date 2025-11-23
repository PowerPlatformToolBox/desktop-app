// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="types.d.ts" />

/**
 * Main renderer process entry point
 * This file initializes the application by importing and orchestrating all modules
 */

import { initializeApplication } from "./modules/initialization";

// Start the application when DOM is loaded
document.addEventListener("DOMContentLoaded", initializeApplication);
