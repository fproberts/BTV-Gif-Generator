declare module 'gif-encoder-2' {
    import { Readable } from 'stream';

    class GifEncoder {
        constructor(width: number, height: number, algorithm?: string, useOptimizer?: boolean, totalMemory?: number);

        createReadStream(): Readable;
        start(): void;
        finish(): void;
        setDelay(delay: number): void;
        setQuality(quality: number): void;
        setRepeat(repeat: number): void;
        setTransparent(color: number): void;
        setThreshold(threshold: number): void;
        addFrame(frame: Buffer): void;

        // Add other methods if needed
    }

    export = GifEncoder;
}
