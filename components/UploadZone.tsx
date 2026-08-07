'use client';

import { useState, useRef } from 'react';
import { Upload, AlertCircle, Loader2, ImagePlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface UploadZoneProps {
    onUpload: (formData: FormData) => Promise<void>;
    existingNames: string[];
}

export function UploadZone({ onUpload, existingNames }: UploadZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Naming Modal State
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [customName, setCustomName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            initiateUpload(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            initiateUpload(e.target.files[0]);
        }
    };

    const initiateUpload = (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error("Please select an image file.");
            return;
        }
        setFileToUpload(file);
        setCustomName(file.name.split('.')[0]);
        setError(null);
    };

    const cancelUpload = () => {
        setFileToUpload(null);
        setCustomName("");
        if (inputRef.current) inputRef.current.value = "";
    };

    const confirmUpload = async () => {
        if (!fileToUpload || isUploading) return;

        const name = customName.trim();
        if (!name) {
            setError("Name cannot be empty.");
            return;
        }
        if (existingNames.includes(name)) {
            setError("Name already taken! Choose another name.");
            return;
        }

        setIsUploading(true);
        const toastId = toast.loading(`Uploading "${name}"...`);
        try {
            const formData = new FormData();
            formData.append('file', fileToUpload);
            formData.append('customName', name);
            await onUpload(formData);
            toast.success("Image uploaded to library!", { id: toastId });
            cancelUpload();
        } catch (e: any) {
            console.error(e);
            toast.error(`Upload failed: ${e?.message || 'Error'}`, { id: toastId });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <>
            <Card
                className={`relative w-full h-52 border-2 border-dashed rounded-3xl transition-all duration-300 flex flex-col items-center justify-center cursor-pointer group overflow-hidden bg-[#1a1614] ${isDragging
                    ? 'border-[#c85a32] bg-[#c85a32]/10 scale-[1.01]'
                    : 'border-[#38302b] hover:border-[#c85a32]/50 hover:bg-[#201b18]'
                    } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !isUploading && inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    onChange={handleChange}
                    accept="image/*"
                />

                <div className={`transition-transform duration-300 ${isDragging ? 'scale-110' : 'group-hover:scale-110'}`}>
                    <div className="p-3.5 rounded-2xl bg-[#28221e] border border-[#38302b] mb-3 text-[#c85a32]">
                        <ImagePlus className="w-7 h-7" />
                    </div>
                </div>

                <h3 className="text-sm font-bold text-[#f4ebe1] mb-1">
                    {isDragging ? "Drop your image here!" : "Upload Photo or Graphic"}
                </h3>
                <p className="text-[#a89b8c] text-xs font-medium">
                    Drag & drop or tap to choose from gallery
                </p>

                {isUploading && (
                    <div className="absolute inset-0 bg-[#14110f]/90 backdrop-blur-sm flex items-center justify-center z-10">
                        <div className="text-center flex flex-col items-center space-y-3">
                            <Loader2 className="w-8 h-8 text-[#c85a32] animate-spin" />
                            <p className="font-bold text-xs text-[#e6d7c3]">
                                UPLOADING IMAGE...
                            </p>
                        </div>
                    </div>
                )}
            </Card>

            {/* Custom Naming Dialog Modal */}
            <Dialog open={!!fileToUpload} onOpenChange={(open) => !open && !isUploading && cancelUpload()}>
                <DialogContent className="max-w-md bg-[#1c1815] border-[#38302b] text-[#f4ebe1] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>Name Your Image</DialogTitle>
                        <DialogDescription>
                            Give this image a label for your Boogie Board library.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="w-full h-44 bg-[#14110f] rounded-2xl overflow-hidden flex items-center justify-center border border-[#38302b]">
                            {fileToUpload && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={URL.createObjectURL(fileToUpload)}
                                    className="max-w-full max-h-full object-contain p-3"
                                    alt="Upload preview"
                                />
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[#a89b8c] mb-1.5 uppercase tracking-wider">
                                Display Name
                            </label>
                            <Input
                                type="text"
                                value={customName}
                                onChange={(e) => {
                                    setCustomName(e.target.value);
                                    setError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !isUploading) confirmUpload();
                                }}
                                autoFocus
                                disabled={isUploading}
                                placeholder="e.g. Sunset Graphic"
                                className={error ? 'border-red-500' : ''}
                            />
                            {error && (
                                <div className="flex items-center text-red-400 text-xs mt-2 font-bold">
                                    <AlertCircle className="w-3.5 h-3.5 mr-1" />
                                    {error}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={cancelUpload}
                            disabled={isUploading}
                            className="flex-1 rounded-2xl"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="terracotta"
                            onClick={confirmUpload}
                            isLoading={isUploading}
                            loadingText="Uploading..."
                            className="flex-1 rounded-2xl font-bold"
                        >
                            Upload Image
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
