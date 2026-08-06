const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const config = require('./build-config.json');

// ANSI escape codes for terminal coloring
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function verifyLinks() {
  console.log(`${COLORS.cyan}--- Starting Link Verification ---${COLORS.reset}`);
  const { docsDir, publicationsDir } = config.paths;
  let brokenLinksCount = 0;

  const searchDirs = [docsDir, publicationsDir];

  searchDirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;

    const pattern = path.join(dir, '**/*.adoc').replace(/\\/g, '/');
    const files = globSync(pattern);

    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const currentDir = path.dirname(file);

      // --- ENGINE 1: VERIFY STRUCTURE INCLUDES ---
      // Matches include::path/to/file.adoc[...] (ignoring escaped ones if any)
      const includeRegex = /(?<!\\)include::([^\[]+)\[[^\]]*\]/g;
      let includeMatch;

      while ((includeMatch = includeRegex.exec(content)) !== null) {
        const includePath = includeMatch[1].trim();
        if (includePath.startsWith('http://') || includePath.startsWith('https://')) continue;

        const resolvedPath = path.normalize(path.resolve(currentDir, includePath));

        if (!fs.existsSync(resolvedPath)) {
          console.error(
            `${COLORS.red}Broken Include${COLORS.reset} in [${path.relative(process.cwd(), file)}]: target "${COLORS.yellow}${includePath}${COLORS.reset}" missing.`
          );
          brokenLinksCount++;
        }
      }

      // --- ENGINE 2: VERIFY CROSS REFERENCES (xref: and <<...>>) ---
      // FIX: Added (?<!\\) to assert that neither macro is preceded by a literal backslash escape character
      const xrefRegex = /(?<!\\)(?:xref:([^\[]+)\[[^\]]*\])|(?<!\\)(?:<<([^#,>]+)(?:#[^,>]*|),[^>]*>>)/g;
      let xrefMatch;

      while ((xrefMatch = xrefRegex.exec(content)) !== null) {
        // Grab whichever capture group matched (Group 1 for xref:, Group 2 for <<...>>)
        let targetPath = (xrefMatch[1] || xrefMatch[2] || '').trim();

        if (!targetPath || targetPath.startsWith('http://') || targetPath.startsWith('https://')) continue;

        // If it targets an internal anchor block within the same file (e.g. xref:#_anchor[]), ignore it
        if (targetPath.startsWith('#')) continue;

        // Strip anchor references from the file path calculation if they are explicitly typed out
        if (targetPath.includes('#')) {
          targetPath = targetPath.split('#')[0];
        }

        // Only validate if it's an actual inter-document file target (.adoc extension)
        if (targetPath.endsWith('.adoc')) {
          const resolvedXrefPath = path.normalize(path.resolve(currentDir, targetPath));

          if (!fs.existsSync(resolvedXrefPath)) {
            console.error(
              `${COLORS.red}Broken Xref Reference${COLORS.reset} in [${path.relative(process.cwd(), file)}]: linked file "${COLORS.yellow}${targetPath}${COLORS.reset}" missing.`
            );
            brokenLinksCount++;
          }
        }
      }
    });
  });

  if (brokenLinksCount > 0) {
    console.error(`\n${COLORS.red}Verification Failed: ${brokenLinksCount} broken structural assets.${COLORS.reset}`);
    process.exitCode = 1;
  } else {
    console.log(`\n${COLORS.green}Verification Success: Structural path mapping and xref networks are secure!${COLORS.reset}`);
  }
  console.log(`${COLORS.cyan}--- Link Verification Complete ---${COLORS.reset}\n`);
}

if (require.main === module) {
  verifyLinks();
}

module.exports = verifyLinks;
