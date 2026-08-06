
const buildHtml = require('./build-html.js');
const buildPdf = require('./build-pdf.js');
const verifyLinks = require('./verify-links.js');

function buildAll() {
  console.log('=== Commencing Master Execution Sequence ===');

  // 1. Validate Links First
  verifyLinks();
  if (process.exitCode === 1) {
    console.error('Aborting compilation loops due to validation rule failure.');
    return;
  }

  // 2. Run Compilers
  buildHtml();
  buildPdf();

  console.log('=== Master Build Routine Execution Successful ===');
}

buildAll();
