'use client';

import { useState, useRef } from 'react';
import { Upload, X, AlertCircle } from 'lucide-react';
import { Modal } from './Modal';

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
            alert("Images only, please!");
            return;
        }
        setFileToUpload(file);
        setCustomName(file.name.split('.')[0]); // Default name
        setError(null);
    };

    const cancelUpload = () => {
        setFileToUpload(null);
        setCustomName("");
        if (inputRef.current) inputRef.current.value = ""; // Reset input to allow re-upload
    };

    const confirmUpload = async () => {
        if (!fileToUpload || isUploading) return;

        const name = customName.trim();
        if (!name) {
            setError("Name cannot be empty.");
            return;
        }
        if (existingNames.includes(name)) {
            setError("Name already taken! Choose another.");
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', fileToUpload);
            formData.append('customName', name);
            await onUpload(formData);
            cancelUpload(); // Close and reset on success
        } catch (e) {
            console.error(e);
            alert("Upload failed.");
        } finally {
            setIsUploading(false); // Only stop loading on error, success closes modal
            // Note: If success, modal closes. If error, we stay to let user try again or cancel. 
            // Wait, logic says 'Only stop loading on error'. 
            // But if success, component might re-render or modal close.
            // Safe to set false.
        }
    };


    return (
        <>
            <div
                className={`relative w-full h-64 border-4 border-dashed rounded-3xl transition-all duration-300 flex flex-col items-center justify-center cursor-pointer group overflow-hidden ${isDragging
                    ? 'border-primary bg-primary/10 scale-[1.02] shadow-[0_0_50px_rgba(112,0,255,0.3)]'
                    : 'border-white/10 hover:border-white/30 hover:bg-white/5'
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

                <div className={`transition-transform duration-500 ${isDragging ? 'scale-110' : 'group-hover:scale-110'}`}>
                    <Upload className={`w-16 h-16 mb-4 ${isDragging ? 'text-primary' : 'text-white/50 group-hover:text-white'}`} />
                </div>

                <h3 className="text-xl font-bold text-white mb-2">
                    {isDragging ? "Drop it like it's hot!" : "Drop Image Here"}
                </h3>
                <p className="text-white/40 font-mono text-sm">
                    or click to browse
                </p>

                {isUploading && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
                        <div className="text-center animate-pulse">
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                            <p className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                                UPLOADING...
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Custom Naming Modal */}
            <Modal isOpen={!!fileToUpload} onClose={cancelUpload} title="Name Your Upload">
                <div className="space-y-4">
                    <div className="relative">
                        <div className="w-full h-48 bg-black/50 rounded-xl overflow-hidden flex items-center justify-center mb-4 border border-white/10">
                            {fileToUpload && (
                                <img
                                    src={URL.createObjectURL(fileToUpload)}
                                    className="max-w-full max-h-full object-contain"
                                    alt="preview"
                                />
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-white/50 mb-1 uppercase tracking-wider">Display Name</label>
                        <input
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
                            className={`w-full bg-black/50 border ${error ? 'border-red-500' : 'border-white/10 focus:border-primary'} rounded-lg px-4 py-3 text-white outline-none transition-colors disabled:opacity-50`}
                            placeholder="e.g. Cool Pattern"
                        />
                        {error && (
                            <div className="flex items-center text-red-500 text-xs mt-2 font-bold animate-pulse">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="flex space-x-3 pt-4">
                        <button
                            onClick={cancelUpload}
                            className="flex-1 py-3 rounded-xl font-bold text-white/50 hover:bg-white/5 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmUpload}
                            disabled={isUploading}
                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-accent font-bold text-white shadow-lg hover:shadow-[0_0_20px_rgba(112,0,255,0.4)] transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isUploading ? "Uploading..." : "Upload Image"}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
