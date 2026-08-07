'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { UploadZone } from './UploadZone';
import { ImageCard } from './ImageCard';
import { ScreenControlBar } from './ScreenControlBar';
import { Folder, Plus, X, Lock, Tag as TagIcon, Download, Trash2, ShieldCheck } from 'lucide-react';
import { createFolder, uploadImage, deleteFolder, checkAdminPassword, updateImageTags, deleteImage } from '@/app/actions';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

type DashboardProps = {
    initialData: any;
};

type ModalType = 'admin-auth' | 'create-folder' | 'add-tag' | 'delete-folder' | 'delete-image' | 'preview' | 'export-settings' | null;

export default function Dashboard({ initialData }: DashboardProps) {
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [data, setData] = useState(initialData);
    const [isAdmin, setIsAdmin] = useState(false);
    const [titleClicks, setTitleClicks] = useState(0);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // Export State
    const [exportFilters, setExportFilters] = useState({
        folderIds: [] as string[],
        tags: [] as string[],
        includeAll: true
    });
    const [isExporting, setIsExporting] = useState(false);

    // Modal State Central
    const [activeModal, setActiveModal] = useState<ModalType>(null);
    const [modalData, setModalData] = useState<any>(null);
    const [inputValue, setInputValue] = useState("");
    const [isModalSubmitting, setIsModalSubmitting] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    // Sync with server data
    useEffect(() => { setData(initialData); }, [initialData]);

    // Focus input when modal opens
    useEffect(() => {
        if (activeModal && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [activeModal]);

    // Reset title secret clicks for admin mode
    useEffect(() => {
        if (titleClicks > 0 && titleClicks < 5) {
            const timer = setTimeout(() => setTitleClicks(0), 1000);
            return () => clearTimeout(timer);
        }
        if (titleClicks === 5 && !isAdmin) {
            openModal('admin-auth');
            setTitleClicks(0);
        }
    }, [titleClicks, isAdmin]);

    // Derived state
    const imagesInFolder = useMemo(() => {
        if (activeFolderId === null) return data.images;
        return data.images.filter((img: any) => img.folderId === activeFolderId);
    }, [data.images, activeFolderId]);

    const uniqueTags = useMemo(() => {
        const tags = new Set<string>();
        imagesInFolder.forEach((img: any) => {
            img.tags?.forEach((t: string) => tags.add(t));
        });
        return Array.from(tags).sort();
    }, [imagesInFolder]);

    const existingNames = useMemo(() => {
        return data.images.map((img: any) => img.name || img.originalName);
    }, [data.images]);

    const filteredImages = useMemo(() => {
        if (!selectedTag) return imagesInFolder;
        return imagesInFolder.filter((img: any) => img.tags?.includes(selectedTag));
    }, [imagesInFolder, selectedTag]);

    // -- Modal Logic --

    const openModal = (type: ModalType, data: any = null) => {
        setActiveModal(type);
        setModalData(data);
        setInputValue("");
        setIsModalSubmitting(false);
    };

    const closeModal = () => {
        if (isModalSubmitting) return;
        setActiveModal(null);
        setModalData(null);
        setInputValue("");
        setIsModalSubmitting(false);
    };

    const handleModalSubmit = async () => {
        setIsModalSubmitting(true);
        try {
            switch (activeModal) {
                case 'admin-auth':
                    const isValid = await checkAdminPassword(inputValue);
                    if (isValid) {
                        setIsAdmin(true);
                        toast.success("Admin Mode Unlocked!");
                    } else {
                        toast.error("Incorrect Admin Password");
                    }
                    closeModal();
                    break;

                case 'create-folder':
                    if (inputValue.trim()) {
                        const newFolder = await createFolder(inputValue.trim());
                        setData((prev: any) => ({ ...prev, folders: [...prev.folders, newFolder] }));
                        toast.success(`Folder "${inputValue.trim()}" created`);
                        router.refresh();
                    }
                    closeModal();
                    break;

                case 'add-tag':
                    if (inputValue.trim() && modalData) {
                        const tag = inputValue.trim().toUpperCase();
                        const newTags = [...(modalData.tags || [])];
                        if (!newTags.includes(tag)) newTags.push(tag);

                        const updatedImg = { ...modalData, tags: newTags };
                        setData((prev: any) => ({
                            ...prev,
                            images: prev.images.map((img: any) => img.id === modalData.id ? updatedImg : img)
                        }));

                        await updateImageTags(modalData.id, newTags);
                        toast.success(`Tag "${tag}" added`);
                        router.refresh();
                    }
                    closeModal();
                    break;

                case 'delete-image':
                    if (modalData) {
                        const result = await deleteImage(modalData.id);
                        if (result && !result.success) {
                            toast.error(`Failed to delete: ${result.error}`);
                            router.refresh();
                        } else {
                            setData((prev: any) => ({
                                ...prev,
                                images: prev.images.filter((img: any) => img.id !== modalData.id)
                            }));
                            toast.success("Image deleted");
                            router.refresh();
                        }
                    }
                    closeModal();
                    break;

                case 'delete-folder':
                    if (modalData) {
                        await deleteFolder(modalData);
                        setData((prev: any) => ({
                            ...prev,
                            folders: prev.folders.filter((f: any) => f.id !== modalData)
                        }));
                        if (activeFolderId === modalData) setActiveFolderId(null);
                        toast.success("Folder deleted");
                        router.refresh();
                    }
                    closeModal();
                    break;
            }
        } catch (err: any) {
            toast.error(`Operation failed: ${err?.message || 'Error'}`);
        } finally {
            setIsModalSubmitting(false);
        }
    };

    // Handlers
    const handleUpload = async (formData: FormData) => {
        const newImage = await uploadImage(formData, activeFolderId);
        setData((prev: any) => ({
            ...prev,
            images: [...prev.images, newImage]
        }));
        router.refresh();
    };

    const handleExport = async () => {
        setIsExporting(true);
        const toastId = toast.loading("Generating ZIP export...");
        try {
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exportFilters)
            });

            if (!response.ok) {
                const err = await response.json();
                toast.error(`Export failed: ${err.error || 'Unknown Error'}`, { id: toastId });
                return;
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `boogie_board_export_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success("ZIP Export downloaded!", { id: toastId });
            closeModal();
        } catch (error: any) {
            console.error(error);
            toast.error("Failed to export GIFs.", { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    useEffect(() => {
        if (selectedTag && !uniqueTags.includes(selectedTag)) {
            setSelectedTag(null);
        }
    }, [uniqueTags, selectedTag]);

    return (
        <div className="max-w-7xl mx-auto space-y-8 py-8 px-4 sm:px-6">

            {/* Studio Header */}
            <header className="flex flex-wrap items-center justify-between gap-4 mb-2">
                <div className="flex items-center space-x-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-[#c85a32] flex items-center justify-center text-[#fbf7f2] shadow-md shadow-[#c85a32]/20 font-black text-xl">
                        B
                    </div>
                    <div>
                        <h1
                            onClick={() => setTitleClicks(p => p + 1)}
                            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#f4ebe1] cursor-pointer select-none transition-transform active:scale-95"
                        >
                            Boogie Board
                        </h1>
                        <p className="text-xs text-[#a89b8c] font-medium tracking-wide">
                            Send photos and captions to the screen live
                        </p>
                    </div>
                </div>

                {isAdmin && (
                    <Badge variant="destructive" className="px-3.5 py-1.5 text-xs font-bold space-x-2 rounded-2xl">
                        <ShieldCheck className="w-4 h-4 text-white" />
                        <span>ADMIN MODE UNLOCKED</span>
                    </Badge>
                )}
            </header>

            {/* Screen Control Deck */}
            <ScreenControlBar />

            {/* Folder Navigation Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#38302b]">
                {/* Folder Pills */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant={activeFolderId === null ? "sand" : "outline"}
                        size="sm"
                        onClick={() => setActiveFolderId(null)}
                        className="h-9 text-xs rounded-2xl font-bold"
                    >
                        <Folder className="w-3.5 h-3.5 mr-1.5" />
                        <span>All Visuals ({data.images.length})</span>
                    </Button>

                    {data.folders.map((folder: any) => {
                        const count = data.images.filter((img: any) => img.folderId === folder.id).length;
                        const isActive = activeFolderId === folder.id;

                        return (
                            <div key={folder.id} className="relative group/folder flex items-center">
                                <Button
                                    variant={isActive ? "sand" : "outline"}
                                    size="sm"
                                    onClick={() => setActiveFolderId(folder.id)}
                                    className="h-9 text-xs rounded-2xl pr-7 font-bold"
                                >
                                    <Folder className="w-3.5 h-3.5 mr-1.5" />
                                    <span>{folder.name} ({count})</span>
                                </Button>
                                {isAdmin && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openModal('delete-folder', folder.id);
                                        }}
                                        className="absolute right-1.5 p-1 text-[#a89b8c] hover:text-[#99332c] transition-colors"
                                        title="Delete Folder"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openModal('create-folder')}
                        className="h-9 text-xs rounded-2xl border-dashed border-[#38302b] text-[#c85a32] hover:bg-[#28221e]"
                    >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        <span>New Folder</span>
                    </Button>
                </div>

                {/* Export ZIP Action */}
                <Button
                    variant="moss"
                    size="sm"
                    onClick={() => openModal('export-settings')}
                    className="h-9 text-xs font-bold rounded-2xl"
                >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    <span>Export ZIP</span>
                </Button>
            </div>

            {/* Tag Filters */}
            {uniqueTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#a89b8c] flex items-center mr-1">
                        <TagIcon className="w-3.5 h-3.5 mr-1 text-[#c85a32]" />
                        Tags:
                    </span>
                    <Button
                        variant={selectedTag === null ? "sand" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTag(null)}
                        className="h-6 px-3 text-[10px] rounded-full"
                    >
                        All
                    </Button>
                    {uniqueTags.map((tag) => (
                        <Button
                            key={tag}
                            variant={selectedTag === tag ? "terracotta" : "outline"}
                            size="sm"
                            onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                            className="h-6 px-3 text-[10px] rounded-full"
                        >
                            {tag}
                        </Button>
                    ))}
                </div>
            )}

            {/* Upload Drag & Drop Area */}
            <UploadZone onUpload={handleUpload} existingNames={existingNames} />

            {/* Image Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-4">
                {filteredImages.map((img: any) => (
                    <ImageCard
                        key={img.id}
                        image={img}
                        folders={data.folders}
                        onPreview={(image) => openModal('preview', image)}
                        onAddTag={(image) => openModal('add-tag', image)}
                        onDelete={(image) => openModal('delete-image', image)}
                    />
                ))}
            </div>

            {filteredImages.length === 0 && (
                <div className="text-center py-16 border border-dashed border-[#38302b] rounded-3xl bg-[#171311]">
                    <p className="text-[#a89b8c] text-xs font-medium">No visual assets found in this view.</p>
                </div>
            )}

            {/* Centralized Dialog Modals */}

            {/* Admin Password Modal */}
            <Dialog open={activeModal === 'admin-auth'} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-w-md bg-[#1c1815] border-[#38302b] text-[#f4ebe1] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <Lock className="w-5 h-5 text-[#c85a32]" />
                            <span>Unlock Admin Mode</span>
                        </DialogTitle>
                        <DialogDescription>
                            Enter passkey to manage folders and system settings.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            ref={inputRef}
                            type="password"
                            placeholder="Enter password..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleModalSubmit()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} disabled={isModalSubmitting}>
                            Cancel
                        </Button>
                        <Button variant="terracotta" onClick={handleModalSubmit} isLoading={isModalSubmitting} loadingText="Authenticating...">
                            Unlock
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Folder Modal */}
            <Dialog open={activeModal === 'create-folder'} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-w-md bg-[#1c1815] border-[#38302b] text-[#f4ebe1] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>Create New Folder</DialogTitle>
                        <DialogDescription>Group your images by collection.</DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder="Folder Name..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleModalSubmit()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} disabled={isModalSubmitting}>
                            Cancel
                        </Button>
                        <Button variant="terracotta" onClick={handleModalSubmit} isLoading={isModalSubmitting} loadingText="Creating...">
                            Create Folder
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Tag Modal */}
            <Dialog open={activeModal === 'add-tag'} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-w-md bg-[#1c1815] border-[#38302b] text-[#f4ebe1] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>Add Tag</DialogTitle>
                        <DialogDescription>
                            Categorize "{modalData?.name || modalData?.originalName}".
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder="e.g. PATTERN"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleModalSubmit()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal} disabled={isModalSubmitting}>
                            Cancel
                        </Button>
                        <Button variant="terracotta" onClick={handleModalSubmit} isLoading={isModalSubmitting} loadingText="Adding Tag...">
                            Add Tag
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Image Confirmation Modal */}
            <Dialog open={activeModal === 'delete-image'} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-w-md bg-[#1c1815] border-[#38302b] text-[#f4ebe1] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#e65c53]">Delete Image</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{modalData?.name || modalData?.originalName}"?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={closeModal} disabled={isModalSubmitting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleModalSubmit} isLoading={isModalSubmitting} loadingText="Deleting...">
                            Delete Image
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Folder Confirmation Modal */}
            <Dialog open={activeModal === 'delete-folder'} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-w-md bg-[#1c1815] border-[#38302b] text-[#f4ebe1] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#e65c53]">Delete Folder</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this folder? Images will be moved to the main library.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={closeModal} disabled={isModalSubmitting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleModalSubmit} isLoading={isModalSubmitting} loadingText="Deleting...">
                            Delete Folder
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Image Preview Modal */}
            <Dialog open={activeModal === 'preview'} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-w-3xl bg-[#1c1815] border-[#38302b] text-[#f4ebe1] p-4 rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>{modalData?.name || modalData?.originalName}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center justify-center p-4">
                        {modalData?.gifUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={modalData.gifUrl} className="max-h-[70vh] rounded-2xl object-contain border border-[#38302b]" alt="GIF Preview" />
                        ) : modalData?.url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={modalData.url} className="max-h-[70vh] rounded-2xl object-contain border border-[#38302b]" alt="Image Preview" />
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Export Settings Modal */}
            <Dialog open={activeModal === 'export-settings'} onOpenChange={(open) => !open && closeModal()}>
                <DialogContent className="max-w-lg bg-[#1c1815] border-[#38302b] text-[#f4ebe1] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <Download className="w-5 h-5 text-[#6b7c4d]" />
                            <span>Export Boogie Board GIFs</span>
                        </DialogTitle>
                        <DialogDescription>
                            Bundle your generated animations into a downloadable ZIP archive.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div>
                            <label className="block text-xs font-bold text-[#a89b8c] mb-2 uppercase">Select Folders</label>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                                {data.folders.map((f: any) => {
                                    const isSelected = exportFilters.folderIds.includes(f.id);
                                    return (
                                        <div
                                            key={f.id}
                                            onClick={() => {
                                                setExportFilters(prev => ({
                                                    ...prev,
                                                    includeAll: false,
                                                    folderIds: isSelected
                                                        ? prev.folderIds.filter(id => id !== f.id)
                                                        : [...prev.folderIds, f.id]
                                                }));
                                            }}
                                            className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-colors ${isSelected
                                                ? 'bg-[#c85a32]/20 border-[#c85a32] text-[#f4ebe1]'
                                                : 'bg-[#171311] border-[#38302b] text-[#a89b8c] hover:bg-[#201b18]'
                                                }`}
                                        >
                                            <span className="truncate">{f.name}</span>
                                            {isSelected && <Badge variant="terracotta" className="text-[9px]">Selected</Badge>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-[#38302b]">
                            <span className="text-xs font-bold text-[#e6d7c3]">Include All Folders</span>
                            <Button
                                variant={exportFilters.includeAll ? "moss" : "outline"}
                                size="sm"
                                onClick={() => setExportFilters(prev => ({ ...prev, includeAll: !prev.includeAll, folderIds: [] }))}
                                className="h-7 text-xs rounded-xl"
                            >
                                {exportFilters.includeAll ? "All Included" : "Select All"}
                            </Button>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={closeModal} disabled={isExporting}>
                            Cancel
                        </Button>
                        <Button
                            variant="moss"
                            onClick={handleExport}
                            isLoading={isExporting}
                            loadingText="Downloading ZIP..."
                        >
                            Download ZIP
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
