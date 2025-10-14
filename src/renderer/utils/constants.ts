import { Category } from "./enums";

// Tools Management
export const mockTools = [
    {
        id: "mock-entity-editor",
        name: "Entity Editor (Mock)",
        description: "Edit Dataverse entities and records - Test Tool",
        version: "1.0.0",
        author: "PowerPlatform ToolBox",
        icon: "📝",
        main: "index.js",
    },
    {
        id: "mock-solution-manager",
        name: "Solution Manager (Mock)",
        description: "Manage and deploy solutions - Test Tool",
        version: "1.2.3",
        author: "PowerPlatform ToolBox",
        icon: "📦",
        main: "index.js",
    },
    {
        id: "mock-plugin-tracer",
        name: "Plugin Trace Viewer (Mock)",
        description: "View and analyze plugin traces - Test Tool",
        version: "2.0.1",
        author: "PowerPlatform ToolBox",
        icon: "🔍",
        main: "index.js",
    },
];

// Tool library with predefined tools
export const toolLibrary = [
    {
        id: "dvdt-erd-generator",
        name: "ERD Generator",
        description: "Generate Entity Relationship Diagrams for Dataverse",
        author: "Power Maverick",
        category: Category.DataManagement,
    },
    {
        id: "@powerplatform/solution-manager",
        name: "Solution Manager",
        description: "Manage and deploy solutions",
        author: "PowerPlatform ToolBox",
        category: Category.Solutions,
    },
    {
        id: "@powerplatform/plugin-tracer",
        name: "Plugin Trace Viewer",
        description: "View and analyze plugin traces",
        author: "PowerPlatform ToolBox",
        category: Category.Development,
    },
    {
        id: "@powerplatform/bulk-data-tools",
        name: "Bulk Data Tools",
        description: "Import and export data in bulk",
        author: "PowerPlatform ToolBox",
        category: Category.DataManagement,
    },
    {
        id: "@powerplatform/security-analyzer",
        name: "Security Analyzer",
        description: "Analyze security roles and permissions",
        author: "PowerPlatform ToolBox",
        category: Category.Security,
    },
];
