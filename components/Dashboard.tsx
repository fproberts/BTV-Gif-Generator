'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { UploadZone } from './UploadZone';
import { ImageCard } from './ImageCard';
import { Modal } from './Modal';
import { Folder, Plus, X, Lock, Tag as TagIcon, Download, AlertTriangle, Trash2 } from 'lucide-react';
import { createFolder, uploadImage, deleteFolder, checkAdminPassword, updateImageTags, deleteImage } from '@/app/actions';
import { useRouter } from 'next/navigation';

type DashboardProps = {
    initialData: any;
};

type ModalType = 'admin-auth' | 'create-folder' | 'add-tag' | 'delete-folder' | 'delete-image' | 'preview' | null;

export default function Dashboard({ initialData }: DashboardProps) {
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [data, setData] = useState(initialData);
    const [isAdmin, setIsAdmin] = useState(false);
    const [titleClicks, setTitleClicks] = useState(0);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // Modal State Central
    const [activeModal, setActiveModal] = useState<ModalType>(null);
    const [modalData, setModalData] = useState<any>(null); // Stores target image/folder
    const [inputValue, setInputValue] = useState("");

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

    // Reset clicks
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
    };

    const closeModal = () => {
        setActiveModal(null);
        setModalData(null);
        setInputValue("");
    };

    const handleModalSubmit = async () => {
        switch (activeModal) {
            case 'admin-auth':
                const isValid = await checkAdminPassword(inputValue);
                if (isValid) {
                    setIsAdmin(true);
                    // alert("Admin Mode Unlocked!"); // Maybe use a toast later? for now silent success is fine or visual cue
                } else {
                    alert("Incorrect Password");
                }
                closeModal();
                break;

            case 'create-folder':
                if (inputValue.trim()) {
                    const newFolder = await createFolder(inputValue.trim());
                    setData((prev: any) => ({ ...prev, folders: [...prev.folders, newFolder] }));
                    router.refresh();
                }
                closeModal();
                break;

            case 'add-tag':
                if (inputValue.trim() && modalData) {
                    const tag = inputValue.trim().toUpperCase();
                    const newTags = [...(modalData.tags || [])];
                    if (!newTags.includes(tag)) newTags.push(tag);

                    // Optimistic update local
                    const updatedImg = { ...modalData, tags: newTags };
                    setData((prev: any) => ({
                        ...prev,
                        images: prev.images.map((img: any) => img.id === modalData.id ? updatedImg : img)
                    }));

                    await updateImageTags(modalData.id, newTags);
                    router.refresh();
                }
                closeModal();
                break;

            case 'delete-image':
                if (modalData) {
                    const result = await deleteImage(modalData.id);
                    if (result && !result.success) {
                        alert(`Failed to delete: ${result.error}`);
                        // Force refresh to get back the optimistic update
                        router.refresh();
                    } else {
                        setData((prev: any) => ({
                            ...prev,
                            images: prev.images.filter((img: any) => img.id !== modalData.id)
                        }));
                        router.refresh();
                    }
                }
                closeModal();
                break;

            case 'delete-folder':
                if (modalData) {
                    await deleteFolder(modalData); // modalData is folderId here
                    setData((prev: any) => ({
                        ...prev,
                        folders: prev.folders.filter((f: any) => f.id !== modalData)
                    }));
                    if (activeFolderId === modalData) setActiveFolderId(null);
                    router.refresh();
                }
                closeModal();
                break;
        }
    };


    // Handlers passed to children
    const handleUpload = async (formData: FormData) => {
        const newImage = await uploadImage(formData, activeFolderId);
        setData((prev: any) => ({
            ...prev,
            images: [...prev.images, newImage]
        }));
        router.refresh();
    };

    // Effect to clear selected tag if it no longer exists in current view? 
    // Optional, but good UX.
    useEffect(() => {
        if (selectedTag && !uniqueTags.includes(selectedTag)) {
            setSelectedTag(null);
        }
    }, [uniqueTags, selectedTag]);


    return (
        <div className="max-w-7xl mx-auto space-y-8">

            {/* Header */}
            <header className="flex items-center justify-between mb-8 animate-float">
                <h1
                    onClick={() => setTitleClicks(p => p + 1)}
                    className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-secondary drop-shadow-[0_0_15px_rgba(112,0,255,0.5)] cursor-default select-none transition-transform active:scale-95"
                >
                    GIF BOARD
                </h1>
                {isAdmin && (
                    <div className="px-4 py-1 rounded-full bg-red-500/20 text-red-500 font-bold border border-red-500/50 flex items-center space-x-2 animate-pulse">
                        <Lock className="w-4 h-4" />
                        <span>ADMIN MODE</span>
                    </div>
                )}
            </header>

            {/* Folders Bar */}
            <div className="flex space-x-4 overflow-x-auto p-2 pb-4 scrollbar-hide">
                <button
                    onClick={() => setActiveFolderId(null)}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all duration-300 ${activeFolderId === null
                        ? 'bg-gradient-to-r from-primary to-accent shadow-[0_0_20px_rgba(255,0,222,0.4)] scale-105'
                        : 'glass-panel hover:bg-white/5'
                        }`}
                >
                    <Folder className="w-5 h-5" />
                    <span className="font-bold">All</span>
                </button>

                {data.folders.map((folder: any) => (
                    <div key={folder.id} className="relative group">
                        <button
                            onClick={() => setActiveFolderId(folder.id)}
                            className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all duration-300 whitespace-nowrap ${isAdmin ? 'pr-10' : ''} ${activeFolderId === folder.id
                                ? 'bg-gradient-to-r from-primary to-accent shadow-[0_0_20px_rgba(255,0,222,0.4)] scale-105'
                                : 'glass-panel hover:bg-white/5'
                                }`}
                        >
                            <Folder className="w-5 h-5" />
                            <span className="font-bold">{folder.name}</span>
                        </button>

                        {isAdmin && (
                            <button
                                onClick={(e) => { e.stopPropagation(); openModal('delete-folder', folder.id); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-red-500/80 hover:text-white text-white/50 transition-colors z-10"
                                title="Delete Folder"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}

                <button
                    onClick={() => openModal('create-folder')}
                    className="flex items-center space-x-2 px-4 py-3 rounded-xl glass-panel hover:bg-white/10 text-secondary border-secondary/30 border-dashed border-2"
                >
                    <Plus className="w-5 h-5" />
                    <span>New Folder</span>
                </button>
            </div>

            {/* Tag Filter Bar */}
            {uniqueTags.length > 0 && (
                <div className="flex items-center space-x-3 overflow-x-auto pb-2">
                    <div className="flex items-center text-white/50 text-sm font-bold uppercase tracking-wider">
                        <TagIcon className="w-4 h-4 mr-2" />
                        Filters:
                    </div>
                    <button
                        onClick={() => setSelectedTag(null)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${!selectedTag ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                        ALL
                    </button>
                    {uniqueTags.map(tag => (
                        <button
                            key={tag}
                            onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors uppercase ${selectedTag === tag ? 'bg-accent text-white shadow-[0_0_10px_rgba(255,0,222,0.5)]' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            )}

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                {/* Upload Column */}
                <div className="lg:col-span-4">
                    <UploadZone onUpload={handleUpload} existingNames={existingNames} />
                </div>

                {/* Gallery */}
                <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredImages.map((img: any) => (
                        <ImageCard
                            key={img.id}
                            image={img}
                            folders={data.folders}
                            onPreview={(img) => openModal('preview', img)}
                            onAddTag={(img) => openModal('add-tag', img)}
                            onDelete={(img) => openModal('delete-image', img)}
                        />
                    ))}

                    {filteredImages.length === 0 && (
                        <div className="col-span-full h-64 flex items-center justify-center text-white/30 font-mono text-xl border-2 border-dashed border-white/10 rounded-3xl">
                            {imagesInFolder.length > 0 ? "No images match this tag." : "No images here yet. Drop one above!"}
                        </div>
                    )}
                </div>
            </div>

            {/* --------------------- MODAL MANAGER --------------------- */}
            <Modal
                isOpen={!!activeModal}
                onClose={closeModal}
                title={
                    activeModal === 'admin-auth' ? "Admin Access" :
                        activeModal === 'create-folder' ? "Create Folder" :
                            activeModal === 'add-tag' ? "Add Tag" :
                                activeModal === 'delete-folder' ? "Delete Folder" :
                                    activeModal === 'delete-image' ? "Delete Image" :
                                        activeModal === 'preview' ? (modalData?.name || "Preview") : ""
                }
                maxWidth={activeModal === 'preview' ? 'max-w-5xl' : 'max-w-md'}
            >
                {activeModal === 'preview' ? (
                    // --- Preview Modal Content ---
                    <div className="flex flex-col items-center">
                        <div className="w-full bg-black/50 rounded-xl overflow-hidden border border-white/10 mb-6 flex items-center justify-center min-h-[50vh]">
                            {modalData?.gifUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={modalData.gifUrl}
                                    className="w-full h-full object-contain max-h-[70vh]"
                                    style={{ imageRendering: 'pixelated' }}
                                    alt="preview"
                                />
                            ) : (
                                <div className="text-white/50">Preview not available</div>
                            )}
                        </div>
                        <a
                            href={modalData?.gifUrl}
                            download={`${modalData?.name || 'animation'}.gif`}
                            className="px-8 py-3 rounded-full bg-secondary text-black font-bold hover:bg-secondary/80 transition-all flex items-center space-x-2"
                        >
                            <Download className="w-5 h-5" />
                            <span>Download GIF</span>
                        </a>
                    </div>
                ) : (activeModal === 'delete-folder' || activeModal === 'delete-image') ? (
                    // --- Delete Confirmation Content ---
                    <div className="space-y-6 text-center">
                        <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                            <AlertTriangle className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="text-white/80">
                                {activeModal === 'delete-folder'
                                    ? "Are you sure? Images in this folder will be moved to 'All'."
                                    : "Permanently delete this image? This cannot be undone."}
                            </p>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={closeModal}
                                className="flex-1 py-3 rounded-xl font-bold text-white/50 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleModalSubmit}
                                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors shadow-lg hover:shadow-red-500/20"
                            >
                                <Trash2 className="w-4 h-4 inline-block mr-2" />
                                Delete
                            </button>
                        </div>
                    </div>
                ) : (
                    // --- Input Modal Content (Admin, Tag, Folder) ---
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-white/50 mb-1 uppercase tracking-wider">
                                {activeModal === 'admin-auth' ? "Password" : activeModal === 'add-tag' ? "Tag Name" : "Folder Name"}
                            </label>
                            <input
                                ref={inputRef}
                                type={activeModal === 'admin-auth' ? "password" : "text"}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleModalSubmit()}
                                className="w-full bg-black/50 border border-white/10 focus:border-primary rounded-lg px-4 py-3 text-white outline-none transition-colors"
                                placeholder="..."
                            />
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={closeModal}
                                className="flex-1 py-3 rounded-xl font-bold text-white/50 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleModalSubmit}
                                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/80 transition-colors shadow-lg"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
