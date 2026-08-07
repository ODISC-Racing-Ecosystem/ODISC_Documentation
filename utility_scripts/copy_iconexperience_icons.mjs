import fs from 'fs';
import path from 'path';
import readline from 'readline';

// Create readline interface for terminal interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Define base paths using absolute paths
const SOURCEROOT = path.join('C:', 'D-Drive', 'Software', 'Icon Experience', 'iconexperience', 'v_collections_png');
const TARGETROOT = path.join('C:', 'D-Drive', 'Code', 'ODISC_Documentation', 'resources', 'icons', 'navigation');

// Define sizes to copy
const SIZES = ['16x16', '24x24', '32x32', '48x48', '64x64', '128x128', '256x256'];

// Helper function to turn prompts into promises
const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function mainLoop() {
  console.log('🚀 Icon Copy Utility Started. (Press [Enter] on an empty line or type "exit" to quit)\n');

  while (true) {
    // 1. Get Category Name
    let categoryInput = await askQuestion('📂 Enter Category Name: ');
    let cleanCategory = categoryInput.trim();
    if (cleanCategory === '' || cleanCategory.toLowerCase() === 'exit') break;

    // Normalize category: spaces/commas to underscores, then lowercase
    let categoryName = cleanCategory
      .replace(/[\s,]+/g, '_')
      .toLowerCase();

    // 2. Get File Name
    let fileInput = await askQuestion('📄 Enter File Name (with or without .png): ');
    let cleanFile = fileInput.trim();
    if (cleanFile === '' || cleanFile.toLowerCase() === 'exit') break;

    // Normalize file name: ensure it ends with .png
    let fileName = cleanFile;
    if (!fileName.toLowerCase().endsWith('.png')) {
      fileName += '.png';
    }

    // 3. Get Output Name
    let outputInput = await askQuestion('💾 Enter Output Folder Name: ');
    let cleanOutput = outputInput.trim();
    if (cleanOutput === '' || cleanOutput.toLowerCase() === 'exit') break;
    let outputName = cleanOutput;

    // Define specific run paths
    const sourceBase = path.join(SOURCEROOT, categoryName);
    const targetBase = path.join(TARGETROOT, outputName);

    console.log(`\nProcessing: [Category: ${categoryName}] -> [File: ${fileName}] -> [Target: ${outputName}]`);

    try {
      // Create target directory if it doesn't exist
      if (!fs.existsSync(targetBase)) {
        fs.mkdirSync(targetBase, { recursive: true });
        console.log(`📁 Created folder: ${targetBase}`);
      }

      let copiedCount = 0;

      // Loop through sizes
      SIZES.forEach(size => {
        const isShadowSize = !['16x16', '24x24'].includes(size);
        const subFolder = isShadowSize ? 'shadow' : 'plain';

        const sourceFile = path.join(sourceBase, size, subFolder, fileName);
        const destinationFile = path.join(targetBase, `${size}.png`);

        if (fs.existsSync(sourceFile)) {
          fs.copyFileSync(sourceFile, destinationFile);
          copiedCount++;
        } else {
          console.warn(`⚠️  Missing: ${size} (${subFolder}) at expected path: ${sourceFile}`);
        }
      });

      if (copiedCount > 0) {
        console.log(`🎉 Successfully copied ${copiedCount} icon sizes to ${targetBase}\n`);
      } else {
        console.log(`❌ No files were copied. Please check if the category or file name is spelled correctly.\n`);
      }

    } catch (error) {
      console.error(`❌ An error occurred during file operations: ${error.message}\n`);
    }
  }

  console.log('\n👋 Exiting. Goodbye!');
  rl.close();
}

mainLoop();
