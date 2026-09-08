# Supabase `tool_concern_reports` Table Design

This document describes the schema for the `tool_concern_reports` table used to back the
**Report a Concern** flow, which lets users flag any tool (verified or not) that appears to
violate the Power Platform ToolBox community values (spam, unsafe code, inappropriate
content, etc.).

---

## Table: `tool_concern_reports`

```sql
CREATE TABLE public.tool_concern_reports (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id       TEXT         NOT NULL,
    tool_name     TEXT         NOT NULL,
    tool_version  TEXT,
    reason        TEXT         NOT NULL,
    description   TEXT,
    email         TEXT,
    source        TEXT         NOT NULL,
    maturity      TEXT,
    install_id    TEXT         NOT NULL,
    app_version   TEXT         NOT NULL,
    status        TEXT         NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

### Column descriptions

| Column         | Type          | Description                                                                                                                           |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `uuid`        | Primary key, auto-generated.                                                                                                          |
| `tool_id`      | `text`        | ID of the reported tool.                                                                                                              |
| `tool_name`    | `text`        | Display name of the tool at the time of the report.                                                                                   |
| `tool_version` | `text`        | Installed/viewed version of the tool, if known.                                                                                       |
| `reason`       | `text`        | One of `spam`, `malicious`, `inappropriate`, `community-values`, `other`.                                                             |
| `description`  | `text`        | Optional free-text details from the reporter (required by the app when `reason = other`).                                             |
| `email`        | `text`        | Optional contact email supplied by the reporter for follow-up.                                                                        |
| `source`       | `text`        | Where the report was filed from: `tool-detail`, `sidebar-menu`, or `app-menu`.                                                        |
| `maturity`     | `text`        | The tool's maturity status (e.g. `verified`) at the time of the report, for triage context.                                           |
| `install_id`   | `text`        | Anonymous per-installation identifier (`InstallIdManager`), attached server-side.                                                     |
| `app_version`  | `text`        | ToolBox app version the report was filed from, attached server-side.                                                                  |
| `status`       | `text`        | Review status, defaults to `pending`. Updated by admins directly in Supabase Studio (`pending`, `reviewed`, `dismissed`, `actioned`). |
| `created_at`   | `timestamptz` | Row creation timestamp (auto-set).                                                                                                    |

---

## Row-Level Security

```sql
-- Enable RLS
ALTER TABLE public.tool_concern_reports ENABLE ROW LEVEL SECURITY;

-- Allow anonymous clients to INSERT reports only. No SELECT/UPDATE/DELETE policy is
-- granted to anon, so submitted reports cannot be read back, listed, or tampered with
-- by the client — review happens with the Supabase service-role key in Supabase Studio.
CREATE POLICY "Anonymous insert access"
    ON public.tool_concern_reports
    FOR INSERT
    TO anon
    WITH CHECK (true);
```

---

## App behaviour

1. Users can report a concern for **any** tool (not just verified ones) from three entry
   points: the Tool Detail tab, the installed-tool sidebar context menu, and the app's
   "Report a Concern" menu item (shown below "Tool Feedback" when a tool is open).
2. The report form collects a `reason`, optional `description`, and optional `email`. The
   app attaches `install_id` and `app_version` server-side — these values are never trusted
   from the renderer.
3. Duplicate-report prevention is **local-only**: once a report succeeds, the tool ID is
   added to this install's `reportedToolConcernIds` setting (electron-store), and the
   "Report a Concern" form shows an "already reported" state for that tool going forward.
   This avoids needing a SELECT-capable RLS policy for the anon key.
4. No admin review UI is built into the app — triage happens by querying this table
   directly in Supabase Studio (or via the service-role key) and updating `status` as
   reports are actioned.
