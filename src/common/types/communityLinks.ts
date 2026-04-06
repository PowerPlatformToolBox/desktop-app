/**
 * Community Links / Community Resources types
 * Shared between main process (Supabase fetch) and renderer (display).
 */

export interface CommunityLinksItem {
    id: string;
    label: string;
    url: string;
}

export interface CommunityLinksGroup {
    id: string;
    title: string;
    links: CommunityLinksItem[];
}

export interface CommunityLinksCollection {
    groups: CommunityLinksGroup[];
}
