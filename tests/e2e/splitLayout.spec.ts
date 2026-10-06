import { expect, test } from "./fixtures";

/**
 * E2E: Split-layout DOM structure and initial state.
 *
 * These tests verify that the split-layout HTML elements are present in the
 * document with their correct initial (inactive) state.  They do NOT require
 * any tools to be installed or running — the split UI is structurally present
 * but hidden until two tools are opened and the user activates the split.
 *
 * Prerequisites: run `pnpm run build` before executing these tests.
 */

// ---------------------------------------------------------------------------
// Helper: evaluate a style property even when the element's ancestor is hidden.
// Playwright's toBeVisible() checks the full visibility chain, so we use
// JavaScript evaluation to inspect the element directly.
// ---------------------------------------------------------------------------
async function getInlineStyle(window: import("playwright").Page, selector: string, prop: string): Promise<string> {
    return window.evaluate(
        ([sel, p]) => {
            const el = document.querySelector(sel as string) as HTMLElement | null;
            return el ? el.style.getPropertyValue(p as string) : "";
        },
        [selector, prop],
    );
}

async function getAttribute(window: import("playwright").Page, selector: string, attr: string): Promise<string | null> {
    return window.evaluate(
        ([sel, a]) => {
            const el = document.querySelector(sel as string);
            return el ? el.getAttribute(a as string) : null;
        },
        [selector, attr],
    );
}

test("Split Layout — initial DOM state", async ({ window }) => {
    // -----------------------------------------------------------------------
    // Structural presence
    // -----------------------------------------------------------------------
    await test.step("left-tabs-container exists in the DOM", async () => {
        // Wait for the app to be ready before querying DOM
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#left-tabs-container").count();
        expect(count).toBe(1);
    });

    await test.step("right-tabs-container exists in the DOM", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#right-tabs-container").count();
        expect(count).toBe(1);
    });

    await test.step("split-tabs-bar-divider exists in the DOM", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#split-tabs-bar-divider").count();
        expect(count).toBe(1);
    });

    await test.step("split-pane-divider exists in the DOM", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#split-pane-divider").count();
        expect(count).toBe(1);
    });

    await test.step("right-tool-tabs container exists in the DOM", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#right-tool-tabs").count();
        expect(count).toBe(1);
    });

    await test.step("tool-panel-header exists in the DOM", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#tool-panel-header").count();
        expect(count).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Initial hidden state
    // -----------------------------------------------------------------------
    await test.step("right-tabs-container has display:none initially", async () => {
        await window.waitForLoadState("domcontentloaded");
        const display = await getInlineStyle(window, "#right-tabs-container", "display");
        expect(display).toBe("none");
    });

    await test.step("split-tabs-bar-divider has display:none initially", async () => {
        await window.waitForLoadState("domcontentloaded");
        const display = await getInlineStyle(window, "#split-tabs-bar-divider", "display");
        expect(display).toBe("none");
    });

    await test.step("split-pane-divider has display:none initially", async () => {
        await window.waitForLoadState("domcontentloaded");
        const display = await getInlineStyle(window, "#split-pane-divider", "display");
        expect(display).toBe("none");
    });

    // -----------------------------------------------------------------------
    // ARIA attributes
    // -----------------------------------------------------------------------
    await test.step("split-tabs-bar-divider has aria-hidden=true", async () => {
        await window.waitForLoadState("domcontentloaded");
        const ariaHidden = await getAttribute(window, "#split-tabs-bar-divider", "aria-hidden");
        expect(ariaHidden).toBe("true");
    });

    await test.step("split-pane-divider has role=separator", async () => {
        await window.waitForLoadState("domcontentloaded");
        const role = await getAttribute(window, "#split-pane-divider", "role");
        expect(role).toBe("separator");
    });

    await test.step("split-pane-divider has aria-orientation=vertical", async () => {
        await window.waitForLoadState("domcontentloaded");
        const orientation = await getAttribute(window, "#split-pane-divider", "aria-orientation");
        expect(orientation).toBe("vertical");
    });

    await test.step("right-tabs-container has role=tablist", async () => {
        await window.waitForLoadState("domcontentloaded");
        const role = await getAttribute(window, "#right-tabs-container", "role");
        expect(role).toBe("tablist");
    });

    // -----------------------------------------------------------------------
    // Class state
    // -----------------------------------------------------------------------
    await test.step("tool-panel-header does not have split-active class initially", async () => {
        await window.waitForLoadState("domcontentloaded");
        const hasSplitActive = await window.evaluate(() => {
            const el = document.getElementById("tool-panel-header");
            return el?.classList.contains("split-active") ?? false;
        });
        expect(hasSplitActive).toBe(false);
    });

    await test.step("left-tabs-container is always present without split-active on header", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#tool-tabs").count();
        expect(count).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Split Layout — tool panel controls
// ---------------------------------------------------------------------------
test("Split Layout — tool panel controls", async ({ window }) => {
    await test.step("close-all-tools button is present inside the tool panel header", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#close-all-tools").count();
        expect(count).toBe(1);
    });

    await test.step("tool-panel-content wrapper is present in the DOM", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#tool-panel-content-wrapper").count();
        expect(count).toBe(1);
    });

    await test.step("tool-panel-content is present in the DOM", async () => {
        await window.waitForLoadState("domcontentloaded");
        const count = await window.locator("#tool-panel-content").count();
        expect(count).toBe(1);
    });
});
