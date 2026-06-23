/**
 * Power Platform ToolBox - Power Platform API Type Definitions
 *
 * Power Platform Admin APIs exposed to tools via window.powerplatformAPI
 * https://learn.microsoft.com/en-us/rest/api/power-platform/
 */

declare namespace PowerPlatformAPI {
    /**
     * Power Platform API category response type
     */
    export interface PowerPlatformResponse {
        [key: string]: unknown;
    }

    /**
     * Generic HTTP method type
     */
    export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

    /**
     * Power Platform API category client interface
     * Provides generic HTTP methods for each API category
     */
    export interface CategoryClient {
        /**
         * Make a GET request to the category endpoint
         * @param path Relative path after the category base URL (e.g., "environments/{environmentId}/apps/{app}?api-version=2024-10-01")
         * @param connectionTarget Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @param headers Optional custom headers
         */
        Get: (path?: string, connectionTarget?: "primary" | "secondary", headers?: Record<string, string>) => Promise<PowerPlatformResponse>;

        /**
         * Make a POST request to the category endpoint
         * @param path Relative path after the category base URL
         * @param body Optional request body
         * @param connectionTarget Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @param headers Optional custom headers
         */
        Post: (path?: string, body?: unknown, connectionTarget?: "primary" | "secondary", headers?: Record<string, string>) => Promise<PowerPlatformResponse>;

        /**
         * Make a PUT request to the category endpoint
         * @param path Relative path after the category base URL
         * @param body Optional request body
         * @param connectionTarget Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @param headers Optional custom headers
         */
        Put: (path?: string, body?: unknown, connectionTarget?: "primary" | "secondary", headers?: Record<string, string>) => Promise<PowerPlatformResponse>;

        /**
         * Make a PATCH request to the category endpoint
         * @param path Relative path after the category base URL
         * @param body Optional request body
         * @param connectionTarget Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @param headers Optional custom headers
         */
        Patch: (path?: string, body?: unknown, connectionTarget?: "primary" | "secondary", headers?: Record<string, string>) => Promise<PowerPlatformResponse>;

        /**
         * Make a DELETE request to the category endpoint
         * @param path Relative path after the category base URL
         * @param connectionTarget Optional connection target for multi-connection tools ('primary' or 'secondary'). Defaults to 'primary'.
         * @param headers Optional custom headers
         * @param body Optional request body (for DELETE with payload)
         */
        Delete: (path?: string, connectionTarget?: "primary" | "secondary", headers?: Record<string, string>, body?: unknown) => Promise<PowerPlatformResponse>;
    }

    /**
     * Power Platform Analytics API
     * https://api.powerplatform.com/analytics
     */
    export interface Analytics extends CategoryClient {}

    /**
     * Power Platform App Management API
     * https://api.powerplatform.com/appmanagement
     */
    export interface AppManagement extends CategoryClient {}

    /**
     * Power Platform Authorization API
     * https://api.powerplatform.com/authorization
     */
    export interface Authorization extends CategoryClient {}

    /**
     * Power Platform Connectivity API
     * https://api.powerplatform.com/connectivity
     */
    export interface Connectivity extends CategoryClient {}

    /**
     * Power Platform Copilot Studio API
     * https://api.powerplatform.com/copilotstudio
     */
    export interface CopilotStudio extends CategoryClient {}

    /**
     * Power Platform Dynamics API
     * https://api.powerplatform.com/dynamics
     */
    export interface Dynamics extends CategoryClient {}

    /**
     * Power Platform Environment Management API
     * https://api.powerplatform.com/environmentmanagement
     */
    export interface EnvironmentManagement extends CategoryClient {}

    /**
     * Power Platform Governance API
     * https://api.powerplatform.com/governance
     */
    export interface Governance extends CategoryClient {}

    /**
     * Power Platform Licensing API
     * https://api.powerplatform.com/licensing
     */
    export interface Licensing extends CategoryClient {}

    /**
     * Power Platform Power Apps API
     * https://api.powerplatform.com/powerapps
     */
    export interface PowerApps extends CategoryClient {}

    /**
     * Power Platform Power Automate API
     * https://api.powerplatform.com/powerautomate
     */
    export interface PowerAutomate extends CategoryClient {}

    /**
     * Power Platform Power Pages API
     * https://api.powerplatform.com/powerpages
     */
    export interface PowerPages extends CategoryClient {}

    /**
     * Power Platform Resource Query API
     * https://api.powerplatform.com/resourcequery
     */
    export interface ResourceQuery extends CategoryClient {}

    /**
     * Power Platform User Management API
     * https://api.powerplatform.com/usermanagement
     */
    export interface UserManagement extends CategoryClient {}

    /**
     * Power Platform Workflow Agents API
     * https://api.powerplatform.com/workflowagents
     */
    export interface WorkflowAgents extends CategoryClient {}

    /**
     * Main Power Platform API interface
     * Each category exposes generic HTTP methods (Get, Post, Put, Patch, Delete)
     */
    export interface API {
        Analytics: Analytics;
        AppManagement: AppManagement;
        Authorization: Authorization;
        Connectivity: Connectivity;
        CopilotStudio: CopilotStudio;
        Dynamics: Dynamics;
        EnvironmentManagement: EnvironmentManagement;
        Governance: Governance;
        Licensing: Licensing;
        PowerApps: PowerApps;
        PowerAutomate: PowerAutomate;
        PowerPages: PowerPages;
        ResourceQuery: ResourceQuery;
        UserManagement: UserManagement;
        WorkflowAgents: WorkflowAgents;
    }
}

/**
 * Global window interface extension for Power Platform API
 */
declare global {
    interface Window {
        /**
         * Power Platform Admin API accessible to tools
         * @example
         * // Get admin app from Power Apps
         * const app = await powerplatformAPI.PowerApps.Get('environments/{environmentId}/apps/{app}?api-version=2024-10-01');
         */
        powerplatformAPI: PowerPlatformAPI.API;
    }
}

export = PowerPlatformAPI;
export as namespace PowerPlatformAPI;