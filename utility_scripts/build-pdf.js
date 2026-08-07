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

    // Read file and parse headers
    const fileContent = fs.readFileSync(file, 'utf8');
    const lines = fileContent.split(/\r?\n/);

    const attributes = {};
    let hasOutputFileAttribute = false;
    let rawOutputFileNameValue = '';

    // Step 1: Scan and map all declared attributes in the document
    for (const line of lines) {
      // Matches standard ':attribute-name: value' entries
      const attrMatch = line.match(/^:([^:]+):\s*(.*)$/);
      if (attrMatch) {
        const key = attrMatch[1].trim();
        const value = attrMatch[2].trim();
        attributes[key] = value;

        if (key === 'output_file_name') {
          hasOutputFileAttribute = true;
          rawOutputFileNameValue = value;
        }
      }
    }

    // Rule 1: Fail if attribute is completely missing
    if (!hasOutputFileAttribute) {
      console.error(`${COLORS.red}Error: "${path.basename(file)}" is missing the required ":output_file_name:" attribute in its header.${COLORS.reset}`);
      process.exit(1);
    }

    // Step 2: Resolve AsciiDoc attribute substitutions recursively (e.g. {doctitle})
    let customName = rawOutputFileNameValue;
    const maxIterations = 10; // Prevent infinite substitution loops
    let iterations = 0;

    while (customName.includes('{') && customName.includes('}') && iterations < maxIterations) {
      const updatedName = customName.replace(/\{([^}]+)\}/g, (match, attrName) => {
        // If the referenced attribute exists, substitute it; otherwise leave it intact
        return attributes[attrName] !== undefined ? attributes[attrName] : match;
      });

      if (updatedName === customName) break; // Break if no substitutions changed anything
      customName = updatedName;
      iterations++;
    }

    // Rule 2: Cross-platform illegal character validation (Windows & Linux)
    const illegalCharsRegex = /[\\/:*?"<>|\x00-\x1F]/;
    if (illegalCharsRegex.test(customName)) {
      console.error(`${COLORS.red}Error: Invalid character in resolved ":output_file_name:" ("${customName}") inside "${path.basename(file)}". Filenames cannot contain: \\ / : * ? " < > | ${COLORS.reset}`);
      process.exit(1);
    }

    // Rule 3: Case-insensitive check and capitalization enforcement
    let outputPdfName;
    if (customName.toUpperCase().startsWith('ODISC')) {
      const dynamicSuffix = customName.slice(5);
      outputPdfName = `ODISC${dynamicSuffix}.pdf`;
    } else {
      outputPdfName = `ODISC ${customName}.pdf`;
    }

    const finalPdfPath = path.join(targetDir, outputPdfName);

    try {
      const command = `asciidoctor-pdf -r asciidoctor-pdf -o "${finalPdfPath}" "${path.resolve(file)}"`;

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
