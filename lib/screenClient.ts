import { spawn } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd(), '..'); // project root where venv & cli.py live
const PYTHON_PATH = path.join(PROJECT_ROOT, 'venv', 'bin', 'python');
const CLI_PATH = path.join(PROJECT_ROOT, 'cli.py');

export async function sendFileToScreen(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const absPath = path.resolve(filePath);
        console.log(`Sending file to screen: ${absPath}`);

        const proc = spawn(PYTHON_PATH, [CLI_PATH, 'image', absPath], {
            cwd: PROJECT_ROOT
        });

        let output = '';
        let errorOutput = '';

        proc.stdout.on('data', (d) => { output += d.toString(); });
        proc.stderr.on('data', (d) => { errorOutput += d.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve('Success');
            } else {
                reject(new Error(`Failed to send to screen (code ${code}): ${errorOutput}`));
            }
        });
    });
}

export async function sendTextToScreen(text: str, color = 'ffffff', bg = '000000'): Promise<string> {
    return new Promise((resolve, reject) => {
        console.log(`Sending text to screen: "${text}"`);

        const proc = spawn(PYTHON_PATH, [CLI_PATH, 'text', text, '--color', color, '--bg', bg], {
            cwd: PROJECT_ROOT
        });

        let errorOutput = '';
        proc.stderr.on('data', (d) => { errorOutput += d.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve('Success');
            } else {
                reject(new Error(`Failed to send text (code ${code}): ${errorOutput}`));
            }
        });
    });
}

export async function setScreenBrightness(level: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = spawn(PYTHON_PATH, [CLI_PATH, 'brightness', level.toString()], {
            cwd: PROJECT_ROOT
        });
        proc.on('close', (code) => code === 0 ? resolve('Success') : reject(new Error('Failed brightness')));
    });
}
