import * as https from "https";
import { DataverseConnection } from "../../types";
import { DATAVERSE_API_VERSION } from "../constants";
import { AuthManager } from "./authManager";
import { ConnectionsManager } from "./connectionsManager";

/**
 * Dataverse API response type
 */
interface DataverseResponse {
    [key: string]: unknown;
}

/**
 * Dataverse error response
 */
interface DataverseError {
    error: {
        code: string;
        message: string;
    };
}

/**
 * FetchXML query result
 */
interface FetchXmlResult {
    value: Record<string, unknown>[];
    "@odata.context"?: string;
    "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"?: string;
}

/**
 * Entity metadata response
 */
interface EntityMetadata {
    MetadataId: string;
    LogicalName: string;
    DisplayName?: {
        LocalizedLabels: Array<{ Label: string; LanguageCode: number }>;
    };
    Attributes?: unknown[];
    [key: string]: unknown;
}

/**
 * Manages Dataverse Web API operations
 * Provides CRUD operations, FetchXML queries, and metadata retrieval
 */
export class DataverseManager {
    private connectionsManager: ConnectionsManager;
    private authManager: AuthManager;

    constructor(connectionsManager: ConnectionsManager, authManager: AuthManager) {
        this.connectionsManager = connectionsManager;
        this.authManager = authManager;
    }

    /**
     * Get the active connection and ensure it has a valid access token
     */
    private async getActiveConnectionWithToken(): Promise<{ connection: DataverseConnection; accessToken: string }> {
        const connection = this.connectionsManager.getActiveConnection();
        if (!connection) {
            throw new Error("No active connection. Please connect to a Dataverse environment first.");
        }

        if (!connection.accessToken) {
            throw new Error("No access token found. Please reconnect to the environment.");
        }

        // Check if token is expired
        if (connection.tokenExpiry) {
            const expiryDate = new Date(connection.tokenExpiry);
            const now = new Date();

            // Refresh if token expires in the next 5 minutes
            if (expiryDate.getTime() - now.getTime() < 5 * 60 * 1000) {
                if (connection.refreshToken) {
                    try {
                        const authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken);
                        this.connectionsManager.setActiveConnection(connection.id, {
                            accessToken: authResult.accessToken,
                            refreshToken: authResult.refreshToken,
                            expiresOn: authResult.expiresOn,
                        });
                        return { connection, accessToken: authResult.accessToken };
                    } catch (error) {
                        throw new Error(`Failed to refresh token: ${(error as Error).message}`);
                    }
                } else {
                    throw new Error("Access token expired and no refresh token available. Please reconnect.");
                }
            }
        }

        return { connection, accessToken: connection.accessToken };
    }

    /**
     * Create a new record in Dataverse
     */
    async create(entityLogicalName: string, record: Record<string, unknown>): Promise<{ id: string; [key: string]: unknown }> {
        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const entitySetName = this.getEntitySetName(entityLogicalName);
        const url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/${entitySetName}`;

        const response = await this.makeHttpRequest(url, "POST", accessToken, record);

        // Extract the ID from the OData-EntityId header or response
        const responseData = response.data as DataverseResponse;
        const entityId = response.headers["odata-entityid"] || (responseData[`${entityLogicalName}id`] as string);

        return {
            id: entityId ? this.extractIdFromUrl(entityId as string) : "",
            ...responseData,
        };
    }

    /**
     * Retrieve a record from Dataverse
     */
    async retrieve(entityLogicalName: string, id: string, columns?: string[]): Promise<Record<string, unknown>> {
        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const entitySetName = this.getEntitySetName(entityLogicalName);

        let url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/${entitySetName}(${id})`;
        if (columns && columns.length > 0) {
            url += `?$select=${columns.join(",")}`;
        }

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as Record<string, unknown>;
    }

    /**
     * Update a record in Dataverse
     */
    async update(entityLogicalName: string, id: string, record: Record<string, unknown>): Promise<void> {
        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const entitySetName = this.getEntitySetName(entityLogicalName);
        const url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/${entitySetName}(${id})`;

        await this.makeHttpRequest(url, "PATCH", accessToken, record);
    }

    /**
     * Delete a record from Dataverse
     */
    async delete(entityLogicalName: string, id: string): Promise<void> {
        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const entitySetName = this.getEntitySetName(entityLogicalName);
        const url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/${entitySetName}(${id})`;

        await this.makeHttpRequest(url, "DELETE", accessToken);
    }

    /**
     * Convert entity logical name to entity set name (pluralization)
     * Handles common Dataverse entity pluralization rules
     */
    private getEntitySetName(entityLogicalName: string): string {
        // Common irregular plurals in Dataverse
        const irregularPlurals: Record<string, string> = {
            opportunity: "opportunities",
            territory: "territories",
            currency: "currencies",
            businessunit: "businessunits",
            systemuser: "systemusers",
        };

        const lowerName = entityLogicalName.toLowerCase();

        // Check for irregular plurals
        if (irregularPlurals[lowerName]) {
            return irregularPlurals[lowerName];
        }

        // Handle entities ending in 'y' (e.g., opportunity -> opportunities)
        if (lowerName.endsWith("y") && lowerName.length > 1 && !"aeiou".includes(lowerName[lowerName.length - 2])) {
            return lowerName.slice(0, -1) + "ies";
        }

        // Handle entities ending in 's', 'x', 'z', 'ch', 'sh' (add 'es')
        if (lowerName.endsWith("s") || lowerName.endsWith("x") || lowerName.endsWith("z") || lowerName.endsWith("ch") || lowerName.endsWith("sh")) {
            return lowerName + "es";
        }

        // Default: add 's'
        return lowerName + "s";
    }

    /**
     * Execute a FetchXML query
     */
    async fetchXmlQuery(fetchXml: string): Promise<FetchXmlResult> {
        const { connection, accessToken } = await this.getActiveConnectionWithToken();

        // Encode the FetchXML for URL
        const encodedFetchXml = encodeURIComponent(fetchXml);

        // Extract entity name from FetchXML
        const entityMatch = fetchXml.match(/<entity\s+name=["']([^"']+)["']/i);
        if (!entityMatch) {
            throw new Error("Invalid FetchXML: Could not determine entity name");
        }
        const entityName = entityMatch[1];

        // Convert entity name to entity set name (pluralized)
        const entitySetName = this.getEntitySetName(entityName);

        const url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/${entitySetName}?fetchXml=${encodedFetchXml}`;

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as FetchXmlResult;
    }

    /**
     * Retrieve multiple records (alias for fetchXmlQuery for backward compatibility)
     */
    async retrieveMultiple(fetchXml: string): Promise<FetchXmlResult> {
        return this.fetchXmlQuery(fetchXml);
    }

    /**
     * Execute a Dataverse Web API action or function
     */
    async execute(request: {
        entityName?: string;
        entityId?: string;
        operationName: string;
        operationType: "action" | "function";
        parameters?: Record<string, unknown>;
    }): Promise<Record<string, unknown>> {
        const { connection, accessToken } = await this.getActiveConnectionWithToken();

        let url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/`;

        // Build URL based on operation type
        if (request.entityName && request.entityId) {
            // Bound operation - use entity set name
            const entitySetName = this.getEntitySetName(request.entityName);
            url += `${entitySetName}(${request.entityId})/Microsoft.Dynamics.CRM.${request.operationName}`;
        } else {
            // Unbound operation
            url += request.operationName;
        }

        const method = request.operationType === "function" ? "GET" : "POST";

        // For functions, parameters go in the URL
        if (request.operationType === "function" && request.parameters) {
            const params = new URLSearchParams();
            Object.entries(request.parameters).forEach(([key, value]) => {
                params.append(key, JSON.stringify(value));
            });
            url += `?${params.toString()}`;
        }

        const body = request.operationType === "action" ? request.parameters : undefined;
        const response = await this.makeHttpRequest(url, method, accessToken, body);

        return response.data as Record<string, unknown>;
    }

    /**
     * Get metadata for a specific entity
     */
    async getEntityMetadata(entityLogicalName: string, selectColumns?: string[]): Promise<EntityMetadata> {
        if (!entityLogicalName || !entityLogicalName.trim()) {
            throw new Error("entityLogicalName parameter cannot be empty");
        }

        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const encodedLogicalName = encodeURIComponent(entityLogicalName);
        let url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(LogicalName='${encodedLogicalName}')`;
        
        if (selectColumns && selectColumns.length > 0) {
            const encodedColumns = selectColumns.map(col => encodeURIComponent(col)).join(",");
            url += `?$select=${encodedColumns}`;
        }

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as EntityMetadata;
    }

    /**
     * Get metadata for all entities
     */
    async getAllEntitiesMetadata(): Promise<{ value: EntityMetadata[] }> {
        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/EntityDefinitions?$select=LogicalName,DisplayName,MetadataId`;

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as { value: EntityMetadata[] };
    }

    /**
     * Get related metadata for a specific entity (attributes, relationships, etc.)
     * @param entityLogicalName - Logical name of the entity
     * @param relatedPath - Path after EntityDefinitions(LogicalName='name') (e.g., 'Attributes', 'OneToManyRelationships', 'ManyToOneRelationships')
     * @param selectColumns - Optional array of column names to select
     */
    async getEntityRelatedMetadata(entityLogicalName: string, relatedPath: string, selectColumns?: string[]): Promise<Record<string, unknown>> {
        if (!entityLogicalName || !entityLogicalName.trim()) {
            throw new Error("entityLogicalName parameter cannot be empty");
        }
        if (!relatedPath || !relatedPath.trim()) {
            throw new Error("relatedPath parameter cannot be empty");
        }

        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const encodedLogicalName = encodeURIComponent(entityLogicalName);
        // Encode individual path segments but preserve forward slashes for URL structure
        // Filter out empty or whitespace-only segments to prevent double slashes
        const encodedPath = relatedPath.split('/').filter(segment => segment.trim().length > 0).map(segment => encodeURIComponent(segment)).join('/');
        let url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/EntityDefinitions(LogicalName='${encodedLogicalName}')/${encodedPath}`;
        
        if (selectColumns && selectColumns.length > 0) {
            const encodedColumns = selectColumns.map(col => encodeURIComponent(col)).join(",");
            url += `?$select=${encodedColumns}`;
        }

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as Record<string, unknown>;
    }

    /**
     * Get solutions from the environment
     * @param selectColumns - Required array of column names to select
     */
    async getSolutions(selectColumns: string[]): Promise<{ value: Record<string, unknown>[] }> {
        if (!selectColumns || selectColumns.length === 0) {
            throw new Error("selectColumns parameter is required and must contain at least one column");
        }

        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const encodedColumns = selectColumns.map(col => encodeURIComponent(col)).join(",");
        const url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/solutions?$select=${encodedColumns}`;

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as { value: Record<string, unknown>[] };
    }

    /**
     * Query data from Dataverse using OData query parameters
     * @param entityLogicalName - Logical name of the entity to query
     * @param odataQuery - OData query string with parameters like $select, $filter, $orderby, $top, $skip, $expand
     */
    async queryData(entityLogicalName: string, odataQuery: string): Promise<{ value: Record<string, unknown>[] }> {
        if (!entityLogicalName || !entityLogicalName.trim()) {
            throw new Error("entityLogicalName parameter cannot be empty");
        }

        if (odataQuery === null || odataQuery === undefined) {
            throw new Error("odataQuery parameter cannot be null or undefined");
        }

        const { connection, accessToken } = await this.getActiveConnectionWithToken();
        const entitySetName = this.getEntitySetName(entityLogicalName);

        // Remove leading '?' if present in the query string
        const trimmedQuery = odataQuery.trim();
        const cleanQuery = trimmedQuery.startsWith("?") ? trimmedQuery.substring(1) : trimmedQuery;
        
        let url = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/${entitySetName}`;
        if (cleanQuery) {
            url += `?${cleanQuery}`;
        }

        const response = await this.makeHttpRequest(url, "GET", accessToken);
        return response.data as { value: Record<string, unknown>[] };
    }

    /**
     * Make an HTTP request to Dataverse Web API
     */
    private makeHttpRequest(url: string, method: string, accessToken: string, body?: Record<string, unknown>): Promise<{ data: unknown; headers: Record<string, string> }> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const bodyData = body ? JSON.stringify(body) : undefined;

            const options: https.RequestOptions = {
                hostname: urlObj.hostname,
                port: 443,
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/json",
                    "OData-MaxVersion": "4.0",
                    "OData-Version": "4.0",
                    "Content-Type": "application/json; charset=utf-8",
                    Prefer: "return=representation", // Return created/updated entity data
                    "Content-Length": bodyData ? Buffer.byteLength(bodyData) : 0,
                },
            };

            const req = https.request(options, (res) => {
                let data = "";

                res.on("data", (chunk) => {
                    data += chunk;
                });

                res.on("end", () => {
                    // Collect response headers
                    const responseHeaders: Record<string, string> = {};
                    if (res.headers) {
                        Object.entries(res.headers).forEach(([key, value]) => {
                            if (typeof value === "string") {
                                responseHeaders[key.toLowerCase()] = value;
                            } else if (Array.isArray(value)) {
                                responseHeaders[key.toLowerCase()] = value[0];
                            }
                        });
                    }

                    // Handle success responses
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        // Parse JSON response if there is data
                        let parsedData: unknown = {};
                        if (data && data.trim()) {
                            try {
                                parsedData = JSON.parse(data);
                            } catch (error) {
                                // For DELETE operations, response might be empty
                                parsedData = {};
                            }
                        }
                        resolve({ data: parsedData, headers: responseHeaders });
                    } else {
                        // Handle error responses
                        let errorMessage = `HTTP ${res.statusCode}`;
                        try {
                            const errorData = JSON.parse(data) as DataverseError;
                            if (errorData.error) {
                                errorMessage = `${errorData.error.code}: ${errorData.error.message}`;
                            }
                        } catch {
                            errorMessage += `: ${data}`;
                        }
                        reject(new Error(errorMessage));
                    }
                });
            });

            req.on("error", (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            if (bodyData) {
                req.write(bodyData);
            }
            req.end();
        });
    }

    /**
     * Extract GUID from OData entity URL
     * Example: https://org.crm.dynamics.com/api/data/${DATAVERSE_API_VERSION}/contacts(guid) -> guid
     */
    private extractIdFromUrl(url: string): string {
        const match = url.match(/\(([a-f0-9-]+)\)/i);
        return match ? match[1] : url;
    }
}
