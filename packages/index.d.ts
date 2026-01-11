/**
 * Power Platform ToolBox API Type Definitions
 *
 * This is the main entry point for TypeScript type definitions.
 * Tools can reference specific APIs they need:
 *
 * For ToolBox API:
 * /// <reference types="@pptb/types/toolboxAPI" />
 *
 * For Dataverse API:
 * /// <reference types="@pptb/types/dataverseAPI" />
 *
 * Or reference all:
 * /// <reference types="@pptb/types" />
 */

/// <reference path="./toolboxAPI.d.ts" />
/// <reference path="./dataverseAPI.d.ts" />

// Re-export all namespaces for convenience
export * from "./dataverseAPI";
export * from "./toolboxAPI";
