import { clipboard, nativeTheme, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { logError, logInfo } from "../../common/logger";
import type { Connection, EntityRelatedMetadataPath, EntityRelatedMetadataResponse, MetadataOperationOptions, ToolSettings } from "../../common/types";
import { ToolManifest } from "../../common/types";
import { ConnectionsManager } from "../managers/connectionsManager";
import { DataverseManager } from "../managers/dataverseManager";
import { PowerPlatformManager } from "../managers/powerplatformManager";
import { SettingsManager } from "../managers/settingsManager";

type HeadlessInvokeFn = (input: Record<string, unknown>, context: HeadlessInvokeContext) => Promise<Record<string, unknown>>;

interface HeadlessRuntimeModule {
    invokeHeadless?: HeadlessInvokeFn;
    default?: HeadlessInvokeFn | { invokeHeadless?: HeadlessInvokeFn };
}

export interface HeadlessInvokeContext {
    toolId: string;
    toolName: string;
    invocationMode: "one-way" | "two-way";
    authToken?: string;
    connectionId?: string;
    connectionUrl?: string;
    connectionName?: string;
    updateProgress: (percent: number, message?: string) => void;
    logger: {
        info: (message: string) => void;
        error: (message: string) => void;
    };
}

export interface HeadlessRuntimeServices {
    settingsManager?: SettingsManager;
    connectionsManager?: ConnectionsManager;
    dataverseManager?: DataverseManager;
    powerPlatformManager?: PowerPlatformManager;
}

interface HeadlessToolboxAPI {
    getToolContext: () => Promise<Record<string, unknown> | null>;
    connections: {
        getActiveConnection: () => Promise<Record<string, unknown> | null>;
        getSecondaryConnection: () => Promise<Record<string, unknown> | null>;
    };
    dataverse: {
        create: (entityLogicalName: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        retrieve: (entityLogicalName: string, id: string, columns?: string[], connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        update: (entityLogicalName: string, id: string, record: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        delete: (entityLogicalName: string, id: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        retrieveMultiple: (fetchXml: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        execute: (request: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        fetchXmlQuery: (fetchXml: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        getEntityMetadata: (entityLogicalName: string, searchByLogicalName: boolean, selectColumns?: string[], connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        getAllEntitiesMetadata: (selectColumns?: string[], connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        getEntityRelatedMetadata: <P extends EntityRelatedMetadataPath>(
            entityLogicalName: string,
            relatedPath: P,
            selectColumns?: string[],
            connectionTarget?: "primary" | "secondary",
        ) => Promise<EntityRelatedMetadataResponse<P>>;
        getSolutions: (selectColumns: string[], connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        getCSDLDocument: (connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        queryData: (odataQuery: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        publishCustomizations: (tableLogicalName?: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        createMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        updateMultiple: (entityLogicalName: string, records: Record<string, unknown>[], connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        getEntitySetName: (entityLogicalName: string) => Promise<unknown>;
        associate: (
            primaryEntityName: string,
            primaryEntityId: string,
            relationshipName: string,
            relatedEntityName: string,
            relatedEntityId: string,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<unknown>;
        disassociate: (primaryEntityName: string, primaryEntityId: string, relationshipName: string, relatedEntityId: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        deploySolution: (
            base64SolutionContent: string | ArrayBuffer | ArrayBufferView,
            options?: {
                importJobId?: string;
                publishWorkflows?: boolean;
                overwriteUnmanagedCustomizations?: boolean;
                skipProductUpdateDependencies?: boolean;
                convertToManaged?: boolean;
            },
            connectionTarget?: "primary" | "secondary",
        ) => Promise<unknown>;
        getImportJobStatus: (importJobId: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        buildLabel: (text: string, languageCode?: number) => unknown;
        getAttributeODataType: (attributeType: string) => string;
        createEntityDefinition: (entityDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        updateEntityDefinition: (
            entityIdentifier: string,
            entityDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<unknown>;
        deleteEntityDefinition: (entityIdentifier: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        createAttribute: (entityLogicalName: string, attributeDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        updateAttribute: (
            entityLogicalName: string,
            attributeIdentifier: string,
            attributeDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<unknown>;
        deleteAttribute: (entityLogicalName: string, attributeIdentifier: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        createPolymorphicLookupAttribute: (
            entityLogicalName: string,
            attributeDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<unknown>;
        createRelationship: (relationshipDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        updateRelationship: (
            relationshipIdentifier: string,
            relationshipDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<unknown>;
        deleteRelationship: (relationshipIdentifier: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        createGlobalOptionSet: (optionSetDefinition: Record<string, unknown>, options?: MetadataOperationOptions, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        updateGlobalOptionSet: (
            optionSetIdentifier: string,
            optionSetDefinition: Record<string, unknown>,
            options?: MetadataOperationOptions,
            connectionTarget?: "primary" | "secondary",
        ) => Promise<unknown>;
        deleteGlobalOptionSet: (optionSetIdentifier: string, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        insertOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        updateOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        deleteOptionValue: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
        orderOption: (params: Record<string, unknown>, connectionTarget?: "primary" | "secondary") => Promise<unknown>;
    };
    utils: {
        showNotification: (options: Record<string, unknown>) => Promise<void>;
        copyToClipboard: (text: string) => Promise<void>;
        getCurrentTheme: () => Promise<"light" | "dark">;
        executeParallel: <T = unknown>(...operations: Array<Promise<T> | (() => Promise<T>)>) => Promise<T[]>;
        openExternal: (url: string) => Promise<void>;
    };
    settings: {
        getAll: () => Promise<ToolSettings | undefined>;
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<void>;
        setAll: (settings: Record<string, unknown>) => Promise<void>;
    };
    invocation: {
        getLaunchContext: () => Promise<Record<string, unknown> | null>;
        returnData: (returnData: Record<string, unknown>) => Promise<void>;
        launchTool: () => Promise<never>;
        findToolsByCapability: () => Promise<never>;
        getKnownCapabilityTags: () => Promise<never>;
    };
}

interface ToolConfigShape {
    agents?: {
        headlessEntry?: string;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseToolConfig(installPath: string): ToolConfigShape {
    const configPath = path.join(installPath, "pptb.config.json");
    if (!fs.existsSync(configPath)) {
        return {};
    }

    try {
        const raw = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(raw) as ToolConfigShape;
    } catch {
        return {};
    }
}

function parseToolPackageJson(installPath: string): Record<string, unknown> {
    const packageJsonPath = path.join(installPath, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        return {};
    }

    try {
        const raw = fs.readFileSync(packageJsonPath, "utf-8");
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function resolveCandidatePaths(manifest: ToolManifest): string[] {
    const installPath = manifest.installPath;
    const config = parseToolConfig(installPath);
    const packageJson = parseToolPackageJson(installPath);

    const candidates = [config.agents?.headlessEntry, "dist/headless.js", "headless.js", typeof packageJson.main === "string" ? packageJson.main : undefined].filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );

    const resolved = candidates.map((candidate) => path.resolve(installPath, candidate)).filter((candidatePath) => fs.existsSync(candidatePath));

    return [...new Set(resolved)];
}

function resolveInvokeFunction(moduleExports: HeadlessRuntimeModule): HeadlessInvokeFn | null {
    if (typeof moduleExports.invokeHeadless === "function") {
        return moduleExports.invokeHeadless;
    }

    if (typeof moduleExports.default === "function") {
        return moduleExports.default as HeadlessInvokeFn;
    }

    if (isRecord(moduleExports.default) && typeof moduleExports.default.invokeHeadless === "function") {
        return moduleExports.default.invokeHeadless;
    }

    return null;
}

function getGlobalScope(): Record<string, unknown> {
    return globalThis as unknown as Record<string, unknown>;
}

function toToolSafeConnection(connection: Connection | null): Record<string, unknown> | null {
    if (!connection) {
        return null;
    }

    return {
        id: connection.id,
        name: connection.name,
        url: connection.url,
        environment: connection.environment,
        createdAt: connection.createdAt,
        lastUsedAt: connection.lastUsedAt,
        category: connection.category,
        environmentColor: connection.environmentColor,
        categoryColor: connection.categoryColor,
        enabledForPowerPlatformAPI: connection.enabledForPowerPlatformAPI,
        scopesForPowerPlatformAPI: connection.scopesForPowerPlatformAPI,
    };
}

function normalizeConnectionName(connectionName?: string): string | undefined {
    const trimmed = connectionName?.trim();
    return trimmed ? trimmed.toLowerCase() : undefined;
}

function resolveConnection(manifest: ToolManifest, context: HeadlessInvokeContext, services: HeadlessRuntimeServices, connectionTarget: "primary" | "secondary" = "primary"): Connection | null {
    const connectionsManager = services.connectionsManager;
    if (!connectionsManager) {
        return null;
    }

    const connectionId = connectionTarget === "secondary" ? undefined : context.connectionId;
    if (connectionId) {
        return connectionsManager.getConnectionById(connectionId);
    }

    const connectionName = connectionTarget === "secondary" ? undefined : normalizeConnectionName(context.connectionName);
    if (connectionName) {
        return connectionsManager.getConnections().find((connection) => normalizeConnectionName(connection.name) === connectionName) ?? null;
    }

    logInfo(`[MCP][Headless] No resolved ${connectionTarget} connection for tool '${manifest.id}'`);
    return null;
}

function requireResolvedConnection(manifest: ToolManifest, context: HeadlessInvokeContext, services: HeadlessRuntimeServices, connectionTarget: "primary" | "secondary" = "primary"): Connection {
    const connection = resolveConnection(manifest, context, services, connectionTarget);
    if (!connection) {
        throw new Error(`No ${connectionTarget} connection is available for headless tool '${manifest.id}'. Provide a saved connectionName when invoking headless mode.`);
    }

    return connection;
}

function buildHeadlessToolboxApi(manifest: ToolManifest, input: Record<string, unknown>, context: HeadlessInvokeContext, services: HeadlessRuntimeServices): HeadlessToolboxAPI {
    const getSettingsManager = (): SettingsManager | undefined => services.settingsManager;
    const getDataverseManager = (): DataverseManager => {
        if (!services.dataverseManager) {
            throw new Error("Dataverse manager is not available in headless mode.");
        }
        return services.dataverseManager;
    };
    const resolvePrimaryConnection = () => resolveConnection(manifest, context, services, "primary");
    const resolveSecondaryConnection = () => resolveConnection(manifest, context, services, "secondary");

    const unsupported = (name: string) => {
        throw new Error(`${name} is not available in headless mode.`);
    };

    return {
        getToolContext: async () => ({
            toolId: context.toolId,
            toolName: context.toolName,
            connectionId: context.connectionId ?? null,
            connectionUrl: context.connectionUrl ?? null,
            connectionName: context.connectionName ?? null,
            invocationContext: {
                source: "mcp",
                mode: context.invocationMode,
                expectsResponse: context.invocationMode === "two-way",
            },
        }),
        connections: {
            getActiveConnection: async () => toToolSafeConnection(resolvePrimaryConnection()),
            getSecondaryConnection: async () => toToolSafeConnection(resolveSecondaryConnection()),
        },
        dataverse: {
            create: async (entityLogicalName, record, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().create(connection.id, entityLogicalName, record);
            },
            retrieve: async (entityLogicalName, id, columns, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().retrieve(connection.id, entityLogicalName, id, columns);
            },
            update: async (entityLogicalName, id, record, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().update(connection.id, entityLogicalName, id, record);
            },
            delete: async (entityLogicalName, id, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().delete(connection.id, entityLogicalName, id);
            },
            retrieveMultiple: async (fetchXml, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().retrieveMultiple(connection.id, fetchXml);
            },
            execute: async (request, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().execute(connection.id, request as Parameters<DataverseManager["execute"]>[1]);
            },
            fetchXmlQuery: async (fetchXml, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().fetchXmlQuery(connection.id, fetchXml);
            },
            getEntityMetadata: async (entityLogicalName, searchByLogicalName, selectColumns, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().getEntityMetadata(connection.id, entityLogicalName, searchByLogicalName, selectColumns);
            },
            getAllEntitiesMetadata: async (selectColumns, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().getAllEntitiesMetadata(connection.id, selectColumns);
            },
            getEntityRelatedMetadata: async <P extends EntityRelatedMetadataPath>(
                entityLogicalName: string,
                relatedPath: P,
                selectColumns?: string[],
                connectionTarget: "primary" | "secondary" = "primary",
            ) => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().getEntityRelatedMetadata(connection.id, entityLogicalName, relatedPath, selectColumns) as Promise<EntityRelatedMetadataResponse<P>>;
            },
            getSolutions: async (selectColumns, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().getSolutions(connection.id, selectColumns);
            },
            getCSDLDocument: async (connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().getCSDLDocument(connection.id);
            },
            queryData: async (odataQuery, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().queryData(connection.id, odataQuery);
            },
            publishCustomizations: async (tableLogicalName, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().publishCustomizations(connection.id, tableLogicalName);
            },
            createMultiple: async (entityLogicalName, records, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().createMultiple(connection.id, entityLogicalName, records);
            },
            updateMultiple: async (entityLogicalName, records, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().updateMultiple(connection.id, entityLogicalName, records);
            },
            getEntitySetName: async (entityLogicalName) => {
                return getDataverseManager().getEntitySetName(entityLogicalName);
            },
            associate: async (primaryEntityName, primaryEntityId, relationshipName, relatedEntityName, relatedEntityId, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().associate(connection.id, primaryEntityName, primaryEntityId, relationshipName, relatedEntityName, relatedEntityId);
            },
            disassociate: async (primaryEntityName, primaryEntityId, relationshipName, relatedEntityId, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().disassociate(connection.id, primaryEntityName, primaryEntityId, relationshipName, relatedEntityId);
            },
            deploySolution: async (base64SolutionContent, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().deploySolution(connection.id, base64SolutionContent, options);
            },
            getImportJobStatus: async (importJobId, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().getImportJobStatus(connection.id, importJobId);
            },
            buildLabel: (text, languageCode = 1033) => {
                return getDataverseManager().buildLabel(text, languageCode);
            },
            getAttributeODataType: (attributeType) => {
                return getDataverseManager().getAttributeODataType(attributeType as never);
            },
            createEntityDefinition: async (entityDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().createEntityDefinition(connection.id, entityDefinition, options);
            },
            updateEntityDefinition: async (entityIdentifier, entityDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().updateEntityDefinition(connection.id, entityIdentifier, entityDefinition, options);
            },
            deleteEntityDefinition: async (entityIdentifier, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().deleteEntityDefinition(connection.id, entityIdentifier);
            },
            createAttribute: async (entityLogicalName, attributeDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().createAttribute(connection.id, entityLogicalName, attributeDefinition, options);
            },
            updateAttribute: async (entityLogicalName, attributeIdentifier, attributeDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().updateAttribute(connection.id, entityLogicalName, attributeIdentifier, attributeDefinition, options);
            },
            deleteAttribute: async (entityLogicalName, attributeIdentifier, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().deleteAttribute(connection.id, entityLogicalName, attributeIdentifier);
            },
            createPolymorphicLookupAttribute: async (entityLogicalName, attributeDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().createPolymorphicLookupAttribute(connection.id, entityLogicalName, attributeDefinition, options);
            },
            createRelationship: async (relationshipDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().createRelationship(connection.id, relationshipDefinition, options);
            },
            updateRelationship: async (relationshipIdentifier, relationshipDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().updateRelationship(connection.id, relationshipIdentifier, relationshipDefinition, options);
            },
            deleteRelationship: async (relationshipIdentifier, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().deleteRelationship(connection.id, relationshipIdentifier);
            },
            createGlobalOptionSet: async (optionSetDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().createGlobalOptionSet(connection.id, optionSetDefinition, options);
            },
            updateGlobalOptionSet: async (optionSetIdentifier, optionSetDefinition, options, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().updateGlobalOptionSet(connection.id, optionSetIdentifier, optionSetDefinition, options);
            },
            deleteGlobalOptionSet: async (optionSetIdentifier, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().deleteGlobalOptionSet(connection.id, optionSetIdentifier);
            },
            insertOptionValue: async (params, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().insertOptionValue(connection.id, params);
            },
            updateOptionValue: async (params, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().updateOptionValue(connection.id, params);
            },
            deleteOptionValue: async (params, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().deleteOptionValue(connection.id, params);
            },
            orderOption: async (params, connectionTarget = "primary") => {
                const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
                return getDataverseManager().orderOption(connection.id, params);
            },
        },
        utils: {
            showNotification: async (options) => {
                const title = typeof options.title === "string" ? options.title : "PPTB notification";
                const body = typeof options.body === "string" ? options.body : JSON.stringify(options);
                context.logger.info(`[Notification] ${title}: ${body}`);
            },
            copyToClipboard: async (text) => {
                clipboard.writeText(text);
            },
            getCurrentTheme: async () => {
                const settingsManager = getSettingsManager();
                const theme = settingsManager?.getSetting("theme");
                if (theme === "dark" || theme === "light") {
                    return theme;
                }

                return nativeTheme.shouldUseDarkColors ? "dark" : "light";
            },
            executeParallel: async <T = unknown>(...operations: Array<Promise<T> | (() => Promise<T>)>) => {
                const promises = operations.map((operation) => (typeof operation === "function" ? operation() : operation));
                return Promise.all(promises);
            },
            openExternal: async (url: string) => {
                await shell.openExternal(url);
            },
        },
        settings: {
            getAll: async () => getSettingsManager()?.getToolSettings(context.toolId),
            get: async (key: string) => getSettingsManager()?.getToolSettings(context.toolId)?.[key],
            set: async (key: string, value: unknown) => {
                const settingsManager = getSettingsManager();
                if (!settingsManager) {
                    return;
                }
                const current = settingsManager.getToolSettings(context.toolId) ?? {};
                settingsManager.updateToolSettings(context.toolId, { ...current, [key]: value });
            },
            setAll: async (settings: Record<string, unknown>) => {
                const settingsManager = getSettingsManager();
                if (!settingsManager) {
                    return;
                }
                settingsManager.updateToolSettings(context.toolId, settings);
            },
        },
        invocation: {
            getLaunchContext: async () => {
                const launchContext: Record<string, unknown> = { ...input };
                launchContext.__pptb = {
                    source: "mcp",
                    mode: context.invocationMode,
                    correlationId: context.connectionId ? `${context.toolId}-${context.connectionId}` : undefined,
                    expectsResponse: context.invocationMode === "two-way",
                };
                return launchContext;
            },
            returnData: async () => {
                context.logger.info("Headless returnData() was called; the MCP invocation result is already the return channel.");
            },
            launchTool: async () => unsupported("toolboxAPI.invocation.launchTool"),
            findToolsByCapability: async () => unsupported("toolboxAPI.invocation.findToolsByCapability"),
            getKnownCapabilityTags: async () => unsupported("toolboxAPI.invocation.getKnownCapabilityTags"),
        },
    };
}

async function installHeadlessGlobals(manifest: ToolManifest, input: Record<string, unknown>, context: HeadlessInvokeContext, services: HeadlessRuntimeServices): Promise<() => void> {
    const globalScope = getGlobalScope();
    const previousWindow = globalScope.window;
    const previousToolboxApi = globalScope.toolboxAPI;
    const previousDataverseApi = globalScope.dataverseAPI;
    const previousPowerPlatformApi = globalScope.powerplatformAPI;

    const toolboxAPI = buildHeadlessToolboxApi(manifest, input, context, services);
    globalScope.window = globalThis as unknown as Record<string, unknown>;
    globalScope.toolboxAPI = toolboxAPI;
    globalScope.dataverseAPI = toolboxAPI.dataverse;
    globalScope.powerplatformAPI = {
        Analytics: buildPowerPlatformCategoryClient(manifest, context, services, "Analytics"),
        AppManagement: buildPowerPlatformCategoryClient(manifest, context, services, "AppManagement"),
        Authorization: buildPowerPlatformCategoryClient(manifest, context, services, "Authorization"),
        Connectivity: buildPowerPlatformCategoryClient(manifest, context, services, "Connectivity"),
        CopilotStudio: buildPowerPlatformCategoryClient(manifest, context, services, "CopilotStudio"),
        Dynamics: buildPowerPlatformCategoryClient(manifest, context, services, "Dynamics"),
        EnvironmentManagement: buildPowerPlatformCategoryClient(manifest, context, services, "EnvironmentManagement"),
        Governance: buildPowerPlatformCategoryClient(manifest, context, services, "Governance"),
        Licensing: buildPowerPlatformCategoryClient(manifest, context, services, "Licensing"),
        PowerApps: buildPowerPlatformCategoryClient(manifest, context, services, "PowerApps"),
        PowerAutomate: buildPowerPlatformCategoryClient(manifest, context, services, "PowerAutomate"),
        PowerPages: buildPowerPlatformCategoryClient(manifest, context, services, "PowerPages"),
        ResourceQuery: buildPowerPlatformCategoryClient(manifest, context, services, "ResourceQuery"),
        UserManagement: buildPowerPlatformCategoryClient(manifest, context, services, "UserManagement"),
        WorkflowAgents: buildPowerPlatformCategoryClient(manifest, context, services, "WorkflowAgents"),
    };

    return () => {
        globalScope.window = previousWindow;
        globalScope.toolboxAPI = previousToolboxApi;
        globalScope.dataverseAPI = previousDataverseApi;
        globalScope.powerplatformAPI = previousPowerPlatformApi;
    };
}

function buildPowerPlatformCategoryClient(
    manifest: ToolManifest,
    context: HeadlessInvokeContext,
    services: HeadlessRuntimeServices,
    category: Parameters<NonNullable<PowerPlatformManager["request"]>>[1],
) {
    return {
        Get: (relativePath = "", connectionTarget?: "primary" | "secondary", headers?: Record<string, string>) =>
            requestPowerPlatform(manifest, context, services, category, "GET", relativePath, undefined, headers, connectionTarget),
        Post: (relativePath = "", body?: unknown, connectionTarget?: "primary" | "secondary", headers?: Record<string, string>) =>
            requestPowerPlatform(manifest, context, services, category, "POST", relativePath, body, headers, connectionTarget),
        Put: (relativePath = "", body?: unknown, connectionTarget?: "primary" | "secondary", headers?: Record<string, string>) =>
            requestPowerPlatform(manifest, context, services, category, "PUT", relativePath, body, headers, connectionTarget),
        Patch: (relativePath = "", body?: unknown, connectionTarget?: "primary" | "secondary", headers?: Record<string, string>) =>
            requestPowerPlatform(manifest, context, services, category, "PATCH", relativePath, body, headers, connectionTarget),
        Delete: (relativePath = "", connectionTarget?: "primary" | "secondary", headers?: Record<string, string>, body?: unknown) =>
            requestPowerPlatform(manifest, context, services, category, "DELETE", relativePath, body, headers, connectionTarget),
    };
}

async function requestPowerPlatform(
    manifest: ToolManifest,
    context: HeadlessInvokeContext,
    services: HeadlessRuntimeServices,
    category: Parameters<NonNullable<PowerPlatformManager["request"]>>[1],
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    relativePath = "",
    body?: unknown,
    headers?: Record<string, string>,
    connectionTarget: "primary" | "secondary" = "primary",
) {
    if (!services.powerPlatformManager) {
        throw new Error(`toolboxAPI.powerplatform.${category}.${method} is not available in headless mode.`);
    }

    const connection = requireResolvedConnection(manifest, context, services, connectionTarget);
    return services.powerPlatformManager.request(connection.id, category, method, relativePath, body, headers);
}

export async function invokeHeadlessTool(manifest: ToolManifest, input: Record<string, unknown>, context: HeadlessInvokeContext, services: HeadlessRuntimeServices): Promise<Record<string, unknown>> {
    const candidatePaths = resolveCandidatePaths(manifest);
    if (candidatePaths.length === 0) {
        throw new Error(`No headless runtime entry found for tool '${manifest.id}'. Add agents.headlessEntry in pptb.config.json or provide dist/headless.js.`);
    }

    let lastError: Error | null = null;
    const restoreGlobals = await installHeadlessGlobals(manifest, input, context, services);

    try {
        for (const entryPath of candidatePaths) {
            try {
                const moduleUrl = pathToFileURL(entryPath).href;
                const loaded = (await import(moduleUrl)) as HeadlessRuntimeModule;
                const invokeFn = resolveInvokeFunction(loaded);

                if (!invokeFn) {
                    lastError = new Error(`Entry '${entryPath}' does not export invokeHeadless(input, context).`);
                    continue;
                }

                context.logger.info(`Executing headless runtime entry '${entryPath}'`);
                const result = await invokeFn(input, context);

                if (!isRecord(result)) {
                    throw new Error("Headless runtime must return an object result.");
                }

                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                logError(`[MCP][Headless] Failed entry ${entryPath}`, lastError);
            }
        }
    } finally {
        restoreGlobals();
    }

    throw new Error(lastError?.message || `Failed to execute headless runtime for tool '${manifest.id}'.`);
}

export function createHeadlessLogger(toolId: string) {
    return {
        info: (message: string) => {
            logInfo(`[MCP][Headless][${toolId}] ${message}`);
        },
        error: (message: string) => {
            logError(`[MCP][Headless][${toolId}] ${message}`);
        },
    };
}
