// Public API — validation only.
// npm.ts is intentionally not re-exported here; import it directly when needed.
export { APPROVED_LICENSES, isValidUrl, KNOWN_CAPABILITY_TAGS, VALID_MULTI_CONNECTION_VALUES, validatePackageJson, validatePPTBConfig } from "./validate";

export type { Configurations, Contributor, CspExceptions, Features, InvocationConfig, PPTBConfig, ToolPackageJson, ValidatePackageJsonOptions, ValidationResult } from "./validate";
