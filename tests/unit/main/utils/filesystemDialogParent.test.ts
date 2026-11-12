import { dialog, type BrowserWindow } from "electron";
import { saveFile, selectPath } from "../../../../src/main/utils/filesystem";

describe("filesystem dialog parenting", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("opens the path selection dialog with its parent window", async () => {
        const parent = {} as BrowserWindow;

        await selectPath({ type: "file" }, parent);

        expect(dialog.showOpenDialog).toHaveBeenCalledWith(parent, expect.objectContaining({ properties: ["openFile"] }));
    });

    it("opens the save dialog with its parent window", async () => {
        const parent = {} as BrowserWindow;

        await saveFile("/tmp/file.txt", "content", undefined, parent);

        expect(dialog.showSaveDialog).toHaveBeenCalledWith(parent, expect.objectContaining({ defaultPath: "/tmp/file.txt" }));
    });

    it("opens dialogs without a parent when no window is provided", async () => {
        await selectPath({ type: "file" });
        await saveFile("/tmp/file.txt", "content");

        expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ properties: ["openFile"] }));
        expect(dialog.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "/tmp/file.txt" }));
    });
});
