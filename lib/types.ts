/** Records stored in data/db.json (see app/actions.ts). Shared by server actions and client components. */

export type ImageRecord = {
    id: string;
    filename: string;
    url: string;
    originalName: string;
    /** Display name chosen at upload time. */
    name?: string;
    tags: string[];
    folderId: string | null;
    createdAt: number;
    gifUrl?: string;
};

export type FolderRecord = {
    id: string;
    name: string;
    color?: string;
};

export type AppData = {
    images: ImageRecord[];
    folders: FolderRecord[];
};
