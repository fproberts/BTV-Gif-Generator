'use client';

import { useState } from 'react';
import { Play, Tag, Trash2, Download, Film, FolderInput, Eye, Tv } from 'lucide-react';
import { generateGifForImage, updateImageFolder } from '@/app/actions';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ImageCardProps {
    image: any;
    folders: any[];
    onPreview: (image: any) => void;
    onAddTag: (image: any) => void;
    onDelete: (image: any) => void;
}

export function ImageCard({ image, folders, onPreview, onAddTag, onDelete }: ImageCardProps) {
    const [isGeneratorRunning, setIsGeneratorRunning] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const router = useRouter();

    const handleGenerateGif = async () => {
        setIsGeneratorRunning(true);
        const toastId = toast.loading(`Generating animation for "${image.name || image.originalName}"...`);
        try {
            await generateGifForImage(image.id);
            toast.success("Animation generated!", { id: toastId });
            router.refresh();
        } catch (e: any) {
            console.error(e);
            toast.error(`Failed to generate GIF: ${e?.message || 'Unknown error'}`, { id: toastId });
        } finally {
            setIsGeneratorRunning(false);
        }
    };

    const handleSendToScreen = async () => {
        setIsSending(true);
        const toastId = toast.loading("Connecting & broadcasting to screen...");
        try {
            const { getBLEState, connectBLE, sendUrlBLE } = await import('@/lib/webBluetooth');
            let bleState = getBLEState();
            if (!bleState.connected) {
                await connectBLE();
                bleState = getBLEState();
            }
            if (bleState.connected && image.gifUrl) {
                await sendUrlBLE(image.gifUrl, true, image.url);
                toast.success("Broadcasting on screen!", { id: toastId });
            } else {
                toast.error("Bluetooth device not connected.", { id: toastId });
            }
        } catch (e: any) {
            toast.error(`Broadcast failed: ${e?.message || 'Canceled'}`, { id: toastId });
        } finally {
            setIsSending(false);
        }
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        const toastId = toast.loading("Downloading GIF file...");
        try {
            const response = await fetch(image.gifUrl);
            if (!response.ok) throw new Error("Network response was not ok");
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${image.name || 'animation'}.gif`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Download complete!", { id: toastId });
        } catch (e: any) {
            toast.error("Failed to download GIF.", { id: toastId });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDelete = () => {
        onDelete(image);
    };

    const handleAddTag = () => {
        onAddTag(image);
    };

    const handleMove = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const folderId = e.target.value === "root" ? null : e.target.value;
        const toastId = toast.loading("Updating folder...");
        try {
            await updateImageFolder(image.id, folderId);
            toast.success("Moved image", { id: toastId });
            router.refresh();
        } catch (err: any) {
            toast.error("Failed to move image", { id: toastId });
        }
    };

    return (
        <Card className="group relative overflow-hidden hover:border-[#c85a32]/50 transition-all duration-300 flex flex-col h-full bg-[#201b18] border-[#38302b] rounded-3xl">

            {/* Delete Button (Top Right) */}
            <div className="absolute top-2.5 right-2.5 z-20 flex space-x-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleDelete}
                    className="h-8 w-8 rounded-full bg-[#14110f]/80 backdrop-blur-md border border-[#38302b] text-[#f4ebe1]"
                    title="Delete image"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </Button>
            </div>

            {/* Move Folder Overlay (Top Left) */}
            <div className="absolute top-2.5 left-2.5 z-20 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <div className="relative group/select">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-[#a89b8c]">
                        <FolderInput className="w-3 h-3" />
                    </div>
                    <select
                        onChange={handleMove}
                        value={image.folderId || "root"}
                        className="pl-8 pr-2 py-1 rounded-full bg-[#14110f]/80 backdrop-blur-md text-[11px] font-bold text-[#e6d7c3] border border-[#38302b] outline-none appearance-none cursor-pointer w-full max-w-[120px] truncate transition-colors"
                    >
                        <option value="root" className="bg-[#201b18]">All</option>
                        {folders.map(f => (
                            <option key={f.id} value={f.id} className="bg-[#201b18]">{f.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Image Preview Container */}
            <div className="relative aspect-[3/4] bg-[#14110f] overflow-hidden group/image border-b border-[#38302b]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={image.url}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    alt={image.name || image.originalName}
                />

                {image.gifUrl && (
                    <div className="absolute bottom-2.5 right-2.5">
                        <Badge variant="moss" className="font-extrabold text-[9px] px-2.5 py-0.5">
                            READY
                        </Badge>
                    </div>
                )}
            </div>

            {/* Content & Actions */}
            <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                    <h4 className="font-bold truncate text-[#f4ebe1] text-sm" title={image.name || image.originalName}>
                        {image.name || image.originalName}
                    </h4>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {image.tags?.map((tag: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[9px] px-2 py-0.5 bg-[#28221e] text-[#a89b8c] border-[#38302b]">
                                {tag}
                            </Badge>
                        ))}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddTag}
                            className="h-5 px-2 text-[10px] rounded-lg border-[#38302b] text-[#a89b8c] hover:text-[#f4ebe1]"
                        >
                            + Tag
                        </Button>
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-2 flex flex-col gap-2 mt-auto">
                    {image.gifUrl ? (
                        <>
                            <Button
                                variant="terracotta"
                                onClick={handleSendToScreen}
                                isLoading={isSending}
                                loadingText="Sending..."
                                className="w-full h-10 text-xs font-bold rounded-2xl shadow-md"
                            >
                                <Tv className="w-4 h-4 mr-1.5" />
                                <span>Send to Screen</span>
                            </Button>
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={handleDownload}
                                    isLoading={isDownloading}
                                    loadingText="Downloading..."
                                    className="flex-1 h-8.5 text-xs rounded-xl"
                                >
                                    <Download className="w-3.5 h-3.5 mr-1" />
                                    <span>Download</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => onPreview(image)}
                                    className="flex-1 h-8.5 text-xs rounded-xl"
                                >
                                    <Eye className="w-3.5 h-3.5 mr-1" />
                                    <span>Preview</span>
                                </Button>
                            </div>
                        </>
                    ) : (
                        <Button
                            variant="default"
                            onClick={handleGenerateGif}
                            isLoading={isGeneratorRunning}
                            loadingText="Cooking GIF..."
                            className="w-full h-10 text-xs font-bold rounded-2xl"
                        >
                            <Film className="w-4 h-4 mr-1.5" />
                            <span>Make Animation</span>
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );
}
