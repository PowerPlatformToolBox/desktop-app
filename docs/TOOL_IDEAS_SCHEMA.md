# Supabase tool ideas

The desktop **Suggest a Tool** modal reads, submits, and upvotes ideas in Supabase. The
web marketplace can use the same table and RPCs; authenticated web users are identified
by their Supabase user ID, while desktop users are identified by their install ID.

Run this schema in the Supabase SQL editor:

```sql
CREATE TABLE public.tool_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 3000),
    email TEXT,
    install_id TEXT NOT NULL,
    app_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tool_idea_votes (
    idea_id UUID NOT NULL REFERENCES public.tool_ideas(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (idea_id, voter_id)
);

ALTER TABLE public.tool_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_idea_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can submit ideas"
    ON public.tool_ideas FOR INSERT TO anon, authenticated
    WITH CHECK (status = 'open');

CREATE OR REPLACE FUNCTION public.get_tool_ideas(p_install_id TEXT)
RETURNS TABLE (id UUID, title TEXT, description TEXT, upvotes BIGINT, created_at TIMESTAMPTZ, has_upvoted BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT i.id, i.title, i.description,
           (SELECT count(*) FROM tool_idea_votes v WHERE v.idea_id = i.id) AS upvotes,
           i.created_at,
           EXISTS (
               SELECT 1 FROM tool_idea_votes v
               WHERE v.idea_id = i.id
                 AND v.voter_id = CASE
                     WHEN auth.uid() IS NOT NULL THEN 'user:' || auth.uid()::TEXT
                     ELSE 'install:' || p_install_id
                 END
           ) AS has_upvoted
    FROM tool_ideas i
    WHERE i.status = 'open'
    ORDER BY upvotes DESC, i.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.upvote_tool_idea(p_idea_id UUID, p_install_id TEXT)
RETURNS TABLE (upvotes BIGINT, has_upvoted BOOLEAN)
LANGUAGE SQL VOLATILE SECURITY DEFINER SET search_path = public
AS $$
    INSERT INTO tool_idea_votes (idea_id, voter_id)
    SELECT p_idea_id, CASE
        WHEN auth.uid() IS NOT NULL THEN 'user:' || auth.uid()::TEXT
        ELSE 'install:' || p_install_id
    END
    WHERE EXISTS (
        SELECT 1 FROM tool_ideas WHERE id = p_idea_id AND status = 'open'
    )
    ON CONFLICT (idea_id, voter_id) DO NOTHING;

    SELECT count(*),
           EXISTS (
               SELECT 1 FROM tool_idea_votes
               WHERE idea_id = p_idea_id
                 AND voter_id = CASE
                     WHEN auth.uid() IS NOT NULL THEN 'user:' || auth.uid()::TEXT
                     ELSE 'install:' || p_install_id
                 END
           )
    FROM tool_idea_votes
    WHERE idea_id = p_idea_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_tool_ideas(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upvote_tool_idea(UUID, TEXT) TO anon, authenticated;
```

The unique vote key prevents repeated votes from the same user or desktop installation.
Do not add a public `SELECT` policy to either table: the listing RPC returns only public
idea fields, keeping contact email addresses and installation IDs private. Use the Supabase
service role to review submissions and update idea status.
