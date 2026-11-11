import * as fs from "fs";
import * as path from "path";
import { validatePPTBConfig, type PPTBConfig, type WorkerDeclaration } from "../../../packages/validation/src/validate";
import type { NormalizedWorkerDeclaration } from "../../common/types";

export function normalizeWorkerMetadata(value: unknown, minAPI: unknown): Record<string, NormalizedWorkerDeclaration> {
    const result = validatePPTBConfig({ workers: value as Record<string, WorkerDeclaration> }, { features: { minAPI: minAPI as string } });
    if (!result.valid) throw new Error(`Invalid worker declarations: ${result.errors.join("; ")}`);
    return (result.packageInfo as PPTBConfig).workers as Record<string, NormalizedWorkerDeclaration>;
}

export function readWorkerMetadata(toolPath: string, packageJson: Parameters<typeof validatePPTBConfig>[1]): Record<string, NormalizedWorkerDeclaration> | undefined {
    const configPath = path.join(toolPath, "pptb.config.json");
    if (!fs.existsSync(configPath)) return undefined;
    const config: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config === null || typeof config !== "object" || Array.isArray(config)) throw new Error("pptb.config.json must be a JSON object");
    if (!Object.prototype.hasOwnProperty.call(config, "workers")) return undefined;
    const result = validatePPTBConfig(config as PPTBConfig, packageJson);
    if (!result.valid) throw new Error(`Invalid worker declarations: ${result.errors.join("; ")}`);
    return (result.packageInfo as PPTBConfig).workers as Record<string, NormalizedWorkerDeclaration>;
}
