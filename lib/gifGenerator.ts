import { spawn } from 'child_process';
import path from 'path';

const PYTHON_SCRIPT_PATH = path.join(process.cwd(), 'gif-generator.py');

export async function generateGif(imagePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Ensure absolute path
        const absImagePath = path.resolve(imagePath);

        console.log(`Starting Python GIF generation for: ${absImagePath}`);
        const pythonProcess = spawn('python3', [PYTHON_SCRIPT_PATH, absImagePath]);

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log(`[Python]: ${data.toString().trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error(`[Python Err]: ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                // Assume success. The python script saves the file as _1px_scroll.gif
                // We verify the file exists or just return the expected path
                const expectedOutputPath = absImagePath.replace(/\.[^/.]+$/, "") + "_1px_scroll.gif";
                resolve(expectedOutputPath);
            } else {
                reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
            }
        });

        pythonProcess.on('error', (err) => {
            reject(new Error(`Failed to start python process: ${err.message}`));
        });
    });
}
