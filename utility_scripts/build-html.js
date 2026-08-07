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

  // Clean the build directory before building
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

  // Intercept stderr to add color coding to warnings/errors
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

    let currentFilePrefix = "";
    let currentFileSuffix = ".html";

    const pathParts = relativePath.split(path.sep);
    const isSiteFile = pathParts[0] === 'site';

    if (isSiteFile) {
      pathParts.shift(); // Remove the 'site' parent folder segment from destination path
      relativePath = pathParts.join(path.sep);
      currentFileSuffix = ".html";
    }

    const targetFilePath = path.join(absoluteOutputDir, relativePath);
    const targetDir = path.dirname(targetFilePath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // --- DYNAMIC PATH CALCULATION FOR BUILD OUTPUT ---
    const relativeFromOutputRoot = path.relative(absoluteOutputDir, targetDir);
    const levelsDeep = relativeFromOutputRoot ? relativeFromOutputRoot.split(path.sep).length : 0;
    const backToRoot = levelsDeep > 0 ? '../'.repeat(levelsDeep) : './';

    // Establish environment variables for safe cross-platform environments
    const isGitHubCI = process.env.GITHUB_ACTIONS === 'true';

    // Point the production build directly to the copied global resources root
    const dynamicImagesDir = `${backToRoot}resources`;

    const options = {
      ...config.html.asciidocOptions,
      to_dir: targetDir,
      mkdirs: true,
      base_dir: path.dirname(path.resolve(file)),
      attributes: {
        ...(config.html.asciidocOptions?.attributes || {}),
        "outfilesuffix": currentFileSuffix,
        "relfileprefix": currentFilePrefix,
        "imagesdir": dynamicImagesDir
      }
    };

    // Instantiate extension registry for custom postprocessing
    options.extension_registry = asciidoctor.Extensions.create();
    options.extension_registry.postprocessor(function () {
      this.process(function (document, output) {
        let processedOutput = output;

        // Force a total path correction for GitHub Pages assets
        if (isGitHubCI) {
          // This safely catches: src="./resources/", src="resources/", src="../../resources/" etc.
          // and converts them to the correct base root repository endpoint.
          processedOutput = processedOutput.replace(
            /src="(?:\.\/|\.\.\/)*resources\//g,
            'src="/ODISC_Documentation/resources/'
          );
        }

        if (isSiteFile) {
          // Removes '../' from relative cross-references on flattened site files
          return processedOutput.replace(/(href=")\.\.\//g, '$1');
        }

        return processedOutput;
      });
    });

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
