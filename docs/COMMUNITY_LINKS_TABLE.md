# Supabase `community_links` Table Design

This document describes the schema for the `community_links` table used to drive the
**Community Resources** sidebar panel in the Power Platform ToolBox desktop app.

---

## Table: `community_links`

```sql
CREATE TABLE public.community_links (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id         TEXT         NOT NULL,
    group_title      TEXT         NOT NULL,
    label            TEXT         NOT NULL,
    url              TEXT         NOT NULL,
    sort_order       INT          NOT NULL DEFAULT 0,
    is_active        BOOLEAN      NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

### Column descriptions

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key, auto-generated. |
| `group_id` | `text` | Stable slug that identifies the category group (e.g. `"newsletters"`). Rows that share a `group_id` are rendered as a single collapsible section. |
| `group_title` | `text` | Human-readable title displayed as the group header (e.g. `"Newsletters"`). |
| `label` | `text` | Display label for the individual link (e.g. `"PP Weekly"`). |
| `url` | `text` | Full HTTPS URL of the link. Non-HTTPS URLs are rejected by the app. |
| `sort_order` | `int` | Controls the order of links within a group. Lower values appear first. Group ordering is handled by the app. |
| `is_active` | `boolean` | When `false` the link is excluded from the app without deleting the row. |
| `created_at` | `timestamptz` | Row creation timestamp (auto-set). |
| `updated_at` | `timestamptz` | Row last-updated timestamp. Update via trigger (see below). |

---

## Row-Level Security

```sql
-- Enable RLS
ALTER TABLE public.community_links ENABLE ROW LEVEL SECURITY;

-- Allow everyone (including anonymous / unauthenticated users) to read active links.
-- The app always requests only is_active = true rows, but this policy ensures
-- even a direct Supabase query cannot leak inactive rows to anonymous callers.
CREATE POLICY "Public read access"
    ON public.community_links
    FOR SELECT
    USING (is_active = true);
```

---

## Auto-update `updated_at`

```sql
-- Reuse (or create) a generic timestamp trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_community_links_updated_at
    BEFORE UPDATE ON public.community_links
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

## Example seed data

```sql
INSERT INTO public.community_links
    (group_id, group_title, label, url, sort_order)
VALUES
    -- Newsletters
    ('newsletters', 'Newsletters', 'PP Weekly',     'https://www.ppweekly.com/',    10),
    ('newsletters', 'Newsletters', 'PP Dev Weekly', 'https://www.ppdevweekly.com/', 20),

    -- Release plans
    ('release-plans', 'Release plans', 'Release Plans Visualized', 'https://releaseplans.net/', 10),

    -- Calculators / estimators
    ('calculators-estimators', 'Calculators / estimators', 'Dataverse Capacity Calculator',           'https://dataverse.licensing.guide/',                                               10),
    ('calculators-estimators', 'Calculators / estimators', 'Power Pages Licensing Cost Calculator',  'https://powerportals.de/tools/power-pages-pricing-calculator.html',               20),
    ('calculators-estimators', 'Calculators / estimators', 'Microsoft agent usage estimator',        'https://microsoft.github.io/copilot-studio-estimator/',                           30);
```

---

## App behaviour

1. When the **Community Resources** sidebar is opened the app calls the `FETCH_COMMUNITY_LINKS`
   IPC channel, which queries Supabase for all rows where `is_active = true`, ordered by
   `sort_order ASC`.
2. Rows are grouped by `group_id` / `group_title` and rendered as collapsible sections.
   Group ordering follows the natural insertion order returned by the query.
3. Only `https://` URLs are accepted; any row with a non-HTTPS URL is silently skipped.
4. If Supabase is unreachable or not configured the app falls back to the bundled static
   data in `src/renderer/data/importantLinks.json`.
