/// <reference types="jest" />

import { TOOL_CHANNELS, TOOL_WINDOW_CHANNELS } from "../../../src/common/ipc/channels";

const mockExposeMainWorld = jest.fn();
const mockIpcOn = jest.fn();
const mockIpcInvoke = jest.fn();

jest.mock("electron", () => ({
    contextBridge: { exposeInMainWorld: mockExposeMainWorld },
    ipcRenderer: { on: mockIpcOn, invoke: mockIpcInvoke },
}));

function loadToolApi() {
    jest.resetModules();
    mockExposeMainWorld.mockClear();
    mockIpcOn.mockClear();
    mockIpcInvoke.mockReset();
    mockIpcInvoke.mockImplementation(async (_channel: string, connectionId: string) => ({
        id: connectionId,
        name: connectionId,
        url: `https://${connectionId}.example.test`,
        environment: "Dev",
    }));

    require("../../../src/main/toolPreloadBridge");
    const exposedApi = mockExposeMainWorld.mock.calls.find(([name]) => name === "toolboxAPI")?.[1];
    const contextListener = mockIpcOn.mock.calls.find(([channel]) => channel === "toolbox:context")?.[1];
    if (!exposedApi || !contextListener) throw new Error("Tool preload API or context listener was not registered");
    return { api: exposedApi, setContext: (context: Record<string, unknown>) => contextListener({}, context) };
}

describe("tool preload connection APIs", () => {
    it("preserves null gaps and resolves a later numeric slot", async () => {
        const { api, setContext } = loadToolApi();
        setContext({ toolId: "sample-tool", instanceId: "sample-instance", connectionIds: ["primary-id", null, "third-id", "fourth-id"] });

        await expect(api.connections.getConnections()).resolves.toEqual([
            { id: "primary-id", name: "primary-id", url: "https://primary-id.example.test", environment: "Dev" },
            null,
            { id: "third-id", name: "third-id", url: "https://third-id.example.test", environment: "Dev" },
            { id: "fourth-id", name: "fourth-id", url: "https://fourth-id.example.test", environment: "Dev" },
        ]);
        await expect(api.connections.getConnection(3)).resolves.toMatchObject({ id: "fourth-id" });
        expect(mockIpcInvoke).toHaveBeenCalledWith(expect.any(String), "fourth-id");
    });

    it("supports legacy two-field context and rejects invalid numeric targets", async () => {
        const { api, setContext } = loadToolApi();
        setContext({ toolId: "legacy-tool", connectionId: "primary-id", secondaryConnectionId: "secondary-id" });

        await expect(api.connections.getConnections()).resolves.toHaveLength(2);
        await expect(api.connections.getConnection("secondary")).resolves.toMatchObject({ id: "secondary-id" });
        await expect(api.connections.getConnection(-1)).rejects.toThrow(RangeError);
        await expect(api.connections.getConnection(1.5)).rejects.toThrow(RangeError);
    });

    it("inherits all connection slots for inter-tool invocation and applies legacy overrides positionally", async () => {
        const { api, setContext } = loadToolApi();
        setContext({ toolId: "caller-tool", instanceId: "caller-instance", connectionIds: ["primary-id", "secondary-id", null, "fourth-id"] });
        mockIpcInvoke.mockImplementation(async (channel: string) => {
            if (channel === TOOL_CHANNELS.RESOLVE_INVOCATION_TARGET) return { id: "callee-tool", name: "Callee Tool", version: "1.0.0" };
            return undefined;
        });

        await api.invocation.launchTool("callee-tool");
        const defaultLaunch = mockIpcInvoke.mock.calls.find(([channel]) => channel === TOOL_WINDOW_CHANNELS.LAUNCH_WITH_CONTEXT);
        expect(defaultLaunch?.[8]).toEqual(["primary-id", "secondary-id", null, "fourth-id"]);

        mockIpcInvoke.mockClear();
        await api.invocation.launchTool("callee-tool", {}, { secondaryConnectionId: "replacement-secondary" });
        const overriddenLaunch = mockIpcInvoke.mock.calls.find(([channel]) => channel === TOOL_WINDOW_CHANNELS.LAUNCH_WITH_CONTEXT);
        expect(overriddenLaunch?.[8]).toEqual(["primary-id", "replacement-secondary", null, "fourth-id"]);
    });
});
