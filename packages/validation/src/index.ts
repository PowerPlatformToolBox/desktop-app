// Public API — validation only.
// npm.ts is intentionally not re-exported here; import it directly when needed.
export { APPROVED_LICENSES, isValidUrl, KNOWN_CAPABILITY_TAGS, VALID_MULTI_CONNECTION_VALUES, validatePackageJson, validatePPTBConfig, validateWorkers } from "./validate";

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
    ValidationResult,
    WorkerDeclaration,
    WorkerPlatform,
    WorkerRollForward,
    WorkerTargetFramework,
} from "./validate";
