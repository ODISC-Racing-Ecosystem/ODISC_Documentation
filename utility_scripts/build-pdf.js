const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { globSync } = require('glob');
const config = require('./build-config.json');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function buildPdf() {
  console.log(`${COLORS.cyan}--- Starting PDF Build ---${COLORS.reset}`);
  const { publicationsDir, pdfOutputDir } = config.paths;

  if (fs.existsSync(pdfOutputDir)) {
    console.log(`${COLORS.yellow}Cleaning PDF target subdirectory:${COLORS.reset} ${path.normalize(pdfOutputDir)}`);
    fs.rmSync(pdfOutputDir, { recursive: true, force: true });
  }

  fs.mkdirSync(pdfOutputDir, { recursive: true });

  const pattern = path.join(publicationsDir, '**/*.adoc').replace(/\\/g, '/');
  const files = globSync(pattern);

  const filteredFiles = files.filter(file => path.basename(file) !== config.html.entryFile);

  if (filteredFiles.length === 0) {
    console.log('No reference publications found for PDF rendering.');
    return;
  }

  filteredFiles.forEach(file => {
    const relativePath = path.relative(publicationsDir, file);
    const targetFilePath = path.join(pdfOutputDir, relativePath);
    const targetDir = path.dirname(targetFilePath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const outputPdfName = path.basename(file, '.adoc') + '.pdf';
    const finalPdfPath = path.join(targetDir, outputPdfName);

    try {
      // FIX: Removed -B and -a docroot so the CLI natively resolves relative to the input file
      const command = `asciidoctor-pdf -r asciidoctor-pdf -D "${targetDir}" "${path.resolve(file)}"`;

      execSync(command, { stdio: 'inherit' });
      console.log(`${COLORS.green}Rendered PDF:${COLORS.reset} ${relativePath} -> ${finalPdfPath}`);
    } catch (err) {
      console.error(`${COLORS.red}Error rendering PDF for ${file}.${COLORS.reset} Make sure asciidoctor-pdf tool is installed.`);
      process.exitCode = 1;
    }
  });
  console.log(`${COLORS.cyan}--- PDF Build Complete ---${COLORS.reset}\n`);
}

if (require.main === module) {
  buildPdf();
}

module.exports = buildPdf;
