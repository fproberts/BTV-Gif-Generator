import { useState } from 'react';
import { Play, Tag, Trash2, Download, MoreHorizontal, Film, FolderInput, Eye, EyeOff } from 'lucide-react';
import { generateGifForImage, updateImageFolder } from '@/app/actions';
import { useRouter } from 'next/navigation';

interface ImageCardProps {
    image: any;
    folders: any[];
    onPreview: (image: any) => void;
    onAddTag: (image: any) => void;
    onDelete: (image: any) => void;
}

export function ImageCard({ image, folders, onPreview, onAddTag, onDelete }: ImageCardProps) {
    const [isGeneratorRunning, setIsGeneratorRunning] = useState(false);
    const router = useRouter();

    const handleGenerateGif = async () => {
        setIsGeneratorRunning(true);
        try {
            // I should revert to importing from '@/app/actions' and ensure that action uses the new lib.
            // Let's check 'app/actions.ts' in a separate step or assume I need to fix logic here.

            // Actually, I haven't updated 'app/actions.ts' to use the new python spawner yet!
            // The previous step updated 'lib/gifGenerator.ts'. 
            // The 'app/actions.ts' calls 'generateGifForImage' which calls 'generateGif' from lib.
            // So sticking to 'generateGifForImage' from actions is correct.

            // Correction for ReplacementContent: Use 'generateGifForImage' from actions.

            await generateGifForImage(image.id);
            router.refresh();
        } catch (e) {
            console.error(e);
            alert("Failed to generate GIF");
        } finally {
            setIsGeneratorRunning(false);
        }
    };


    const handleDelete = () => {
        onDelete(image);
    }

    const handleAddTag = () => {
        onAddTag(image);
    }

    const handleMove = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const folderId = e.target.value === "root" ? null : e.target.value;
        await updateImageFolder(image.id, folderId);
        router.refresh();
    }

    return (
        <div className="group relative rounded-2xl overflow-hidden glass-panel hover:shadow-[0_0_30px_rgba(112,0,255,0.2)] transition-all duration-300 flex flex-col h-full">

            {/* Helper Actions Overlay (Top Right) */}
            <div className="absolute top-2 right-2 z-20 flex space-x-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <button onClick={handleDelete} className="p-2 rounded-full bg-black/50 hover:bg-red-500/80 backdrop-blur-md text-white transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Move Folder Overlay (Top Left) */}
            <div className="absolute top-2 left-2 z-20 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <div className="relative group/select">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none text-white/70">
                        <FolderInput className="w-3 h-3" />
                    </div>
                    <select
                        onChange={handleMove}
                        value={image.folderId || "root"}
                        className="pl-8 pr-2 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-xs text-white border border-white/10 outline-none appearance-none cursor-pointer w-full max-w-[120px] truncate"
                    >
                        <option value="root">All</option>
                        {folders.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Image Preview */}
            <div className="relative aspect-[3/4] bg-black/50 overflow-hidden group/image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="w-full h-full relative">
                    <img
                        src={image.url}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        alt={image.name || image.originalName}
                    />
                </div>

                {image.gifUrl && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-secondary text-black text-[10px] font-bold rounded-full animate-pulse shadow-lg pointer-events-none">
                        GIF READY
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-3 bg-gradient-to-t from-black via-black/80 to-transparent flex-1 flex flex-col justify-end">
                <h4 className="font-bold truncate text-white/90 text-sm" title={image.name || image.originalName}>
                    {image.name || image.originalName}
                </h4>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                    {image.tags?.map((tag: string, i: number) => (
                        <span key={i} className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-white/10 text-white/70">
                            {tag}
                        </span>
                    ))}
                    <button onClick={handleAddTag} className="text-[10px] px-2 py-1 rounded border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-colors">
                        +
                    </button>
                </div>

                {/* Actions Bar */}
                <div className="pt-2 flex items-center gap-2 mt-auto">
                    {image.gifUrl ? (
                        <>
                            <a
                                href={image.gifUrl}
                                download={`${image.name || 'animation'}.gif`}
                                className="flex-1 flex items-center justify-center space-x-1 py-2 rounded-lg bg-secondary text-black font-bold hover:bg-secondary/90 transition-colors text-xs"
                            >
                                <Download className="w-3 h-3" />
                                <span>Download</span>
                            </a>
                            <button
                                onClick={() => onPreview(image)}
                                className="flex-1 flex items-center justify-center space-x-1 py-2 rounded-lg font-bold transition-colors text-xs border bg-transparent border-white/20 text-white hover:bg-white/10"
                            >
                                <Eye className="w-3 h-3" />
                                <span>Preview</span>
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleGenerateGif}
                            disabled={isGeneratorRunning}
                            className="w-full flex items-center justify-center space-x-2 py-2 rounded-lg bg-primary hover:bg-primary/80 transition-colors font-bold disabled:opacity-50 text-xs"
                        >
                            {isGeneratorRunning ? <div className="animate-spin mr-2">C</div> : <Film className="w-3 h-3" />}
                            <span>{isGeneratorRunning ? "Cooking..." : "Make GIF"}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
