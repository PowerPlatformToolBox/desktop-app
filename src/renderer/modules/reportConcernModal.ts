import type { ToolConcernReportSource } from "../../common/types";
import { getReportConcernModalControllerScript } from "../modals/reportConcern/controller";
import { getReportConcernModalView } from "../modals/reportConcern/view";
import { showBrowserWindowModal } from "./browserWindowModals";

export interface ReportableTool {
    id: string;
    name: string;
    version?: string;
    maturity?: string;
}

const REPORT_CONCERN_MODAL_DIMENSIONS = { width: 520, height: 600 };

/**
 * Open the "Report a Concern" modal for a tool. The modal is self-contained: it checks for
 * an existing report and submits directly via `window.toolboxAPI.reportTool` (modalPreload.ts),
 * so no message-listener plumbing is needed here.
 */
export async function openReportConcernModal(tool: ReportableTool, source: ToolConcernReportSource): Promise<void> {
    const isDarkTheme = document.body.classList.contains("dark-theme");

    const { styles, body } = getReportConcernModalView({
        toolName: tool.name,
        toolVersion: tool.version,
        isDarkTheme,
    });
    const script = getReportConcernModalControllerScript({
        toolId: tool.id,
        toolName: tool.name,
        toolVersion: tool.version,
        source,
        maturity: tool.maturity,
    });

    await showBrowserWindowModal({
        id: "report-concern-modal",
        html: `${styles}\n${body}\n${script}`.trim(),
        width: REPORT_CONCERN_MODAL_DIMENSIONS.width,
        height: REPORT_CONCERN_MODAL_DIMENSIONS.height,
    });
}
