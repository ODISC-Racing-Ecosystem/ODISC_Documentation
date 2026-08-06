const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const asciidoctor = require('@asciidoctor/core')();
const config = require('./build-config.json');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function buildHtml() {
  console.log(`${COLORS.cyan}--- Starting HTML Build ---${COLORS.reset}`);
  const { docsDir, htmlOutputDir } = config.paths;

  const absoluteOutputDir = path.resolve(htmlOutputDir);

  if (fs.existsSync(absoluteOutputDir)) {
    console.log(`${COLORS.yellow}Cleaning HTML output directory:${COLORS.reset} ${path.normalize(absoluteOutputDir)}`);
    fs.rmSync(absoluteOutputDir, { recursive: true, force: true });
  }

  const pattern = path.join(docsDir, '**/*.adoc').replace(/\\/g, '/');
  const files = globSync(pattern);

  if (files.length === 0) {
    console.log('No AsciiDoc files found to compile.');
    return;
  }

  const originalStderrWrite = process.stderr.write;
  process.stderr.write = function (chunk, encoding, callback) {
    const output = chunk.toString();
    if (output.includes('ERROR:')) {
      originalStderrWrite.call(process.stderr, `${COLORS.red}${output.trim()}${COLORS.reset}\n`, encoding, callback);
    } else {
      originalStderrWrite.call(process.stderr, chunk, encoding, callback);
    }
  };

  files.forEach(file => {
    let relativePath = path.relative(docsDir, file);

    // FIX: Intercept files inside /docs/site and flatten their path structure
    // e.g., converts "site/index.adoc" or "site/about.adoc" to just "index.adoc" or "about.adoc"
    const pathParts = relativePath.split(path.sep);
    if (pathParts[0] === 'site') {
      pathParts.shift(); // Remove the 'site' parent folder segment
      relativePath = pathParts.join(path.sep);
    }

    const targetFilePath = path.join(absoluteOutputDir, relativePath);
    const targetDir = path.dirname(targetFilePath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const options = {
      ...config.html.asciidocOptions,
      to_dir: targetDir,
      mkdirs: true,
      base_dir: path.dirname(path.resolve(file)),
      attributes: {
        ...(config.html.asciidocOptions?.attributes || {})
      }
    };

    try {
      asciidoctor.convertFile(path.resolve(file), options);
      const outputFileName = path.basename(file, '.adoc') + '.html';
      console.log(`${COLORS.green}Compiled:${COLORS.reset} ${path.relative(docsDir, file)} -> ${path.join(targetDir, outputFileName)}`);
    } catch (err) {
      console.error(`${COLORS.red}Critical execution error compiling ${file}:${COLORS.reset}`, err.message);
      process.exitCode = 1;
    }
  });

  process.stderr.write = originalStderrWrite;
  console.log(`${COLORS.cyan}--- HTML Build Complete ---${COLORS.reset}\n`);
}

if (require.main === module) {
  buildHtml();
}

module.exports = buildHtml;
