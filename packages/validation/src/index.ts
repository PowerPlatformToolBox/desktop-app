// Public API — validation only.
// npm.ts is intentionally not re-exported here; import it directly when needed.
export { APPROVED_LICENSES, isValidUrl, KNOWN_CAPABILITY_TAGS, VALID_MULTI_CONNECTION_VALUES, validatePackageJson, validatePPTBConfig, validateWorkers } from "./validate";
export { BUNDLED_CAPABILITY_CATALOG, parseCapabilityCatalog, validateCapabilityDeclarations } from "./capabilities";
export type { CapabilityCatalog, CapabilityEntry } from "./capabilities";
export { createPPTBConfigSchema } from "./schema";

export type {
    Configurations,
    Contributor,
    CspExceptions,
    Features,
    InvocationConfig,
    NormalizedWorkerDeclaration,
    PPTBConfig,
    ToolPackageJson,
    ValidatePackageJsonOptions,
    ValidatePPTBConfigOptions,
    ValidationResult,
    WorkerDeclaration,
    WorkerPlatform,
    WorkerRollForward,
    WorkerTargetFramework,
} from "./validate";
