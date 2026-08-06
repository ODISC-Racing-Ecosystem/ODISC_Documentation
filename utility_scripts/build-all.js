const buildHtml = require('./build-html.js');
const buildPdf = require('./build-pdf.js');
const verifyLinks = require('./verify-links.js');

function buildAll() {
  console.log('\x1b[35m=== Commencing Master Execution Sequence ===\x1b[0m\n');

  // 1. Validate Links First
  verifyLinks();
  if (process.exitCode === 1) {
    console.error('\x1b[31mAborting compilation due to validation failure.\x1b[0m');
    return;
  }

  // 2. Run HTML Compiler (Fast)
  buildHtml();

  // 3. Conditional Step: Only build PDFs if the "--prod" flag is passed
  const isProd = process.argv.includes('--prod');
  if (isProd) {
    buildPdf();
  } else {
    console.log('\x1b[33mNotice: Skipping PDF rendering step for fast local building. (Pass --prod to force PDF build)\x1b[0m\n');
  }

  console.log('\x1b[32m=== Master Build Routine Execution Complete ===\x1b[0m');
}

buildAll();
