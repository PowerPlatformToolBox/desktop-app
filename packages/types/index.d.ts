/* eslint-disable @typescript-eslint/triple-slash-reference */
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
/// <reference path="./powerplatformAPI.d.ts" />
/// <reference path="./pptbConfig.d.ts" />

// Re-export all namespaces for convenience
export * from "./dataverseAPI";
export * from "./powerplatformAPI";
export * from "./pptbConfig";
export * from "./toolboxAPI";
