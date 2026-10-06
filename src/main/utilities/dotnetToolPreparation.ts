import { createHash } from "crypto";
import { isAbsolute, posix } from "path";
import type { DotNetDiscoverySelection } from "../../common/types/dotnetWorker";
import type { NormalizedWorkerDeclaration } from "../../common/types/tool";
import { parseDotNetVersion, selectWorkerRuntime } from "./dotnetDiscovery";

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

export function parseDotNetPackageXml(text: string): DotNetXmlNode {
    if (Buffer.byteLength(text) > 256 * 1024 || text.includes("<!") || text.includes("\0")) throw new Error("Unsupported or oversized XML");
    const input = text.replace(/^\uFEFF/, "").replace(/^\s*<\?xml\s+version=["']1\.0["'](?:\s+encoding=["'][A-Za-z0-9-]+["'])?\s*\?>/, "");
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
    const commands = root.children[0];
    const item = commands?.children[0];
    if (
        root.name !== "DotNetCliTool" ||
        dotNetStableJson(root.attributes) !== dotNetStableJson({ Version: "1" }) ||
        root.children.length !== 1 ||
        root.text.trim() ||
        commands?.name !== "Commands" ||
        Object.keys(commands.attributes).length ||
        commands.text.trim() ||
        commands.children.length !== 1 ||
        item?.name !== "Command" ||
        item.text.trim() ||
        item.children.length ||
        Object.keys(item.attributes).sort().join(",") !== "EntryPoint,Name,Runner" ||
        item.attributes.Name !== command ||
        item.attributes.Runner !== "dotnet"
    )
        throw new Error("Unsupported tool settings");
    const entry = dotNetPackageRelativePath(item.attributes.EntryPoint);
    if (!entry.endsWith(".dll")) throw new Error("Only managed DLL entrypoints are supported");
    return entry;
}

export function verifyDotNetRuntimeConfig(text: string, declaration: NormalizedWorkerDeclaration, selection: DotNetDiscoverySelection): void {
    const config = JSON.parse(text);
    const options = config?.runtimeOptions;
    const requirement = declaration.dotnet;
    const nativePolicy = requirement.rollForward === "Latest" ? "LatestMajor" : requirement.rollForward;
    const explicitPolicy = options && Object.hasOwn(options, "rollForward");
    const policy = explicitPolicy ? options.rollForward : "Minor";
    if (
        !options ||
        options.tfm !== requirement.targetFramework ||
        options.framework?.name !== "Microsoft.NETCore.App" ||
        options.framework.version !== requirement.minimumRuntimeVersion ||
        !parseDotNetVersion(options.framework.version) ||
        options.frameworks !== undefined ||
        options.includedFrameworks !== undefined ||
        ["rollForward", "applyPatches", "rollForwardOnNoCandidateFx"].some((field) => Object.hasOwn(options.framework, field)) ||
        (explicitPolicy && (Object.hasOwn(options, "applyPatches") || Object.hasOwn(options, "rollForwardOnNoCandidateFx"))) ||
        policy !== nativePolicy ||
        (options.applyPatches !== undefined && options.applyPatches !== true) ||
        options.rollForwardOnNoCandidateFx !== undefined ||
        selection.nativeRollForward !== nativePolicy
    )
        throw new Error("Runtime configuration conflicts with declaration");
    const selected = selectWorkerRuntime([selection.runtime], requirement);
    if (!selected.ok) throw new Error("Selected worker runtime no longer satisfies package");
}
