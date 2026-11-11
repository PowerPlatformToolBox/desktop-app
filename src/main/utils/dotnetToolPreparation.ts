import { createHash } from "crypto";
import { isAbsolute, posix } from "path";
import type { DotNetToolPreparationErrorCode } from "../../common/types/dotnetTool";
import type { DotNetDiscoverySelection } from "../../common/types/dotnetWorker";
import type { NormalizedWorkerDeclaration } from "../../common/types/tool";
import { parseDotNetVersion, selectWorkerRuntime } from "./dotnetDiscovery";

export class DotNetToolPreparationError extends Error {
    constructor(
        readonly code: DotNetToolPreparationErrorCode,
        message?: string,
        readonly details?: string,
    ) {
        super(message ?? (details ? `DotNet preparation failed: ${code}: ${details}` : `DotNet preparation failed: ${code}`));
        this.name = "DotNetToolPreparationError";
    }
}

export function dotNetPackageInvalid(details: string): DotNetToolPreparationError {
    return new DotNetToolPreparationError("PACKAGE_INVALID", undefined, details);
}

export function dotNetStableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(dotNetStableJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${dotNetStableJson(record[key])}`)
            .join(",")}}`;
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Unsupported JSON value");
    return encoded;
}

export function dotNetHash(value: string | Buffer): string {
    return createHash("sha256").update(value).digest("hex");
}

export function dotNetHasControlCharacters(value: string): boolean {
    return Array.from(value).some((character) => character.charCodeAt(0) < 32);
}

export function normalizeDotNetNuGetVersion(version: string): string {
    const matched = /^(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
    if (!matched || matched[0] !== version) throw new Error("Invalid exact NuGet version");
    const parts = matched[1].split(".").map(Number);
    if (parts.some((part) => part > 2_147_483_647)) throw new Error("Invalid NuGet component");
    while (parts.length < 3) parts.push(0);
    if (parts.length === 4 && parts[3] === 0) parts.pop();
    const release = matched[2]?.toLowerCase();
    return `${parts.join(".")}${release ? `-${release}` : ""}`;
}

export function dotNetPackageRelativePath(value: string): string {
    if (
        !value ||
        value.length > 1024 ||
        isAbsolute(value) ||
        value.includes("\\") ||
        value.includes(":") ||
        dotNetHasControlCharacters(value) ||
        value.split("/").some((part) => !part || part === "." || part === "..") ||
        posix.normalize(value) !== value
    ) {
        throw new Error("Invalid package relative path");
    }
    return value;
}

export interface DotNetXmlNode {
    name: string;
    attributes: Record<string, string>;
    children: DotNetXmlNode[];
    text: string;
}

function decodeXml(value: string): string {
    return value.replace(/&([^;]*);|&/g, (entity, name: string | undefined) => {
        const predefined: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
        if (entity === "&") throw new Error("Unescaped XML entity");
        if (name && Object.hasOwn(predefined, name)) return predefined[name];
        if (name && /^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(name)) {
            const code = name.startsWith("#x") ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
            if (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) return String.fromCodePoint(code);
        }
        throw new Error("Unsupported XML entity");
    });
}

function stripXmlComments(text: string): string {
    let result = "";
    let position = 0;
    for (let start = text.indexOf("<!--"); start !== -1; start = text.indexOf("<!--", position)) {
        const end = text.indexOf("-->", start + 4);
        if (end === -1) throw new Error("Unclosed XML comment");
        result += text.slice(position, start);
        position = end + 3;
    }
    return result + text.slice(position);
}

export function parseDotNetPackageXml(text: string): DotNetXmlNode {
    if (Buffer.byteLength(text) > 256 * 1024 || text.includes("\0")) throw new Error("Unsupported or oversized XML");
    const uncommented = stripXmlComments(text);
    if (uncommented.includes("<!")) throw new Error("XML DOCTYPE, entity and CDATA sections are not supported");
    const input = uncommented.replace(/^\uFEFF/, "").replace(/^\s*<\?xml\s+version=["']1\.0["'](?:\s+encoding=["'][A-Za-z0-9-]+["'])?(?:\s+standalone=["'](?:yes|no)["'])?\s*\?>/, "");
    const stack: DotNetXmlNode[] = [];
    let root: DotNetXmlNode | undefined;
    let position = 0;
    let count = 0;
    const tokens = /<\/([A-Za-z_][\w.:-]*)\s*>|<([A-Za-z_][\w.:-]*)([^<>]*?)\s*(\/?)>|([^<]+)/gy;
    while (position < input.length) {
        tokens.lastIndex = position;
        const match = tokens.exec(input);
        if (!match || ++count > 10000 || stack.length > 32) throw new Error("Invalid bounded XML");
        position = tokens.lastIndex;
        if (match[1]) {
            if (stack.pop()?.name !== match[1]) throw new Error("Mismatched XML element");
        } else if (match[2]) {
            const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
            let remaining = match[3];
            while (remaining.trim()) {
                const attribute = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(remaining);
                if (!attribute || Object.hasOwn(attributes, attribute[1])) throw new Error("Invalid XML attribute");
                attributes[attribute[1]] = decodeXml(attribute[2] ?? attribute[3]);
                remaining = remaining.slice(attribute[0].length);
            }
            const node: DotNetXmlNode = { name: match[2], attributes, children: [], text: "" };
            if (stack.length) stack[stack.length - 1].children.push(node);
            else if (root) throw new Error("Multiple XML roots");
            else root = node;
            if (!match[4]) stack.push(node);
        } else {
            const value = decodeXml(match[5]);
            if (stack.length) stack[stack.length - 1].text += value;
            else if (value.trim()) throw new Error("Text outside XML root");
        }
    }
    if (!root || stack.length) throw new Error("Unclosed XML");
    return root;
}

export function dotNetToolSettings(text: string, command: string): string {
    const root = parseDotNetPackageXml(text);
    if (root.name !== "DotNetCliTool") throw dotNetPackageInvalid("DotnetToolSettings.xml root element must be DotNetCliTool");
    if (root.attributes.Version !== "1" || root.children.some((child) => child.name === "RuntimeIdentifierPackages")) {
        throw dotNetPackageInvalid("Only framework-dependent tools (DotnetToolSettings Version 1, Runner dotnet) are supported; RID-specific and native executable tools are not");
    }
    const commands = root.children.filter((child) => child.name === "Commands").flatMap((child) => child.children.filter((item) => item.name === "Command"));
    if (commands.length !== 1) throw dotNetPackageInvalid("DotnetToolSettings.xml must declare exactly one command");
    const item = commands[0];
    if (item.attributes.Name !== command) throw dotNetPackageInvalid(`DotnetToolSettings.xml command "${item.attributes.Name ?? ""}" does not match the declared command "${command}"`);
    if (item.attributes.Runner !== "dotnet") throw dotNetPackageInvalid(`Unsupported tool runner "${item.attributes.Runner ?? ""}"; only "dotnet" is supported`);
    let entry: string;
    try {
        entry = dotNetPackageRelativePath(item.attributes.EntryPoint ?? "");
    } catch {
        throw dotNetPackageInvalid("DotnetToolSettings.xml EntryPoint is not a safe package-relative path");
    }
    if (!entry.toLowerCase().endsWith(".dll")) throw dotNetPackageInvalid("Only managed DLL entry points are supported");
    return entry;
}

export function verifyDotNetRuntimeConfig(text: string, declaration: NormalizedWorkerDeclaration, selection: DotNetDiscoverySelection): void {
    let config: { runtimeOptions?: Record<string, unknown> & { framework?: Record<string, unknown> } };
    try {
        config = JSON.parse(text);
    } catch {
        throw dotNetPackageInvalid("runtimeconfig.json is not valid JSON");
    }
    const options = config?.runtimeOptions;
    const requirement = declaration.dotnet;
    const nativePolicy = requirement.rollForward === "Latest" ? "LatestMajor" : requirement.rollForward;
    if (!options || typeof options !== "object") throw dotNetPackageInvalid("runtimeconfig.json has no runtimeOptions");
    if (options.tfm !== requirement.targetFramework)
        throw dotNetPackageInvalid(`runtimeconfig.json tfm "${String(options.tfm)}" does not match declared targetFramework "${requirement.targetFramework}"`);
    if (options.frameworks !== undefined || options.includedFrameworks !== undefined || options.framework?.name !== "Microsoft.NETCore.App") {
        throw dotNetPackageInvalid("Worker must be a framework-dependent Microsoft.NETCore.App console tool (no ASP.NET, desktop, or self-contained frameworks)");
    }
    if (options.framework.version !== requirement.minimumRuntimeVersion || !parseDotNetVersion(options.framework.version)) {
        throw dotNetPackageInvalid(`runtimeconfig.json framework version "${String(options.framework.version)}" must equal declared minimumRuntimeVersion "${requirement.minimumRuntimeVersion}"`);
    }
    const explicitPolicy = Object.hasOwn(options, "rollForward");
    if (
        ["rollForward", "applyPatches", "rollForwardOnNoCandidateFx"].some((field) => Object.hasOwn(options.framework ?? {}, field)) ||
        (explicitPolicy && (Object.hasOwn(options, "applyPatches") || Object.hasOwn(options, "rollForwardOnNoCandidateFx"))) ||
        (explicitPolicy ? options.rollForward : nativePolicy) !== nativePolicy ||
        (options.applyPatches !== undefined && options.applyPatches !== true) ||
        options.rollForwardOnNoCandidateFx !== undefined ||
        selection.nativeRollForward !== nativePolicy
    ) {
        throw dotNetPackageInvalid(`runtimeconfig.json roll-forward settings conflict with the declared rollForward "${requirement.rollForward}"`);
    }
    if (!selectWorkerRuntime([selection.runtime], requirement).ok) throw dotNetPackageInvalid("Selected .NET runtime no longer satisfies the declared requirement");
}
