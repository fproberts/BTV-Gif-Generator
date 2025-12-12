import { generateGif } from './lib/gifGenerator';
import path from 'path';

const imagePath = process.argv[2];
if (!imagePath) {
    console.error("Please provide image path");
    process.exit(1);
}

console.log(`Testing GIF generator with: ${imagePath}`);

generateGif(imagePath)
    .then((output) => {
        console.log(`Success! GIF generated at: ${output}`);
    })
    .catch((err) => {
        console.error("Failed:", err);
        process.exit(1);
    });
