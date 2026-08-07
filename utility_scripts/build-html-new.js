const fs = require("fs");
const path = require("path");
const { globSync } = require("glob");
const asciidoctor = require("@asciidoctor/core")();
const config = require("./build-config.json");


/******************************************************************************
 * Console Colours
 *****************************************************************************/

const COLORS = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m"
};


/******************************************************************************
 * Configuration
 *****************************************************************************/

const RESOURCE_FOLDERS = [
    "css",
    "fonts",
    "icons",
    "images"
];

const TEMPLATE_FILE = path.join(
    "resources",
    "templates",
    "web_template.html"
);


/******************************************************************************
 * General Utilities
 *****************************************************************************/

function readTextFile(filename) {
    return fs.readFileSync(filename, "utf8");
}


function ensureDirectory(directory) {
    fs.mkdirSync(directory, {
        recursive: true
    });
}


function cleanDirectory(directory) {

    if (fs.existsSync(directory)) {

        fs.rmSync(directory, {
            recursive: true,
            force: true
        });

    }

    ensureDirectory(directory);
}


function normalizePath(value) {

    return value
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/");

}


function normalizeRelativePath(value) {

    if (!value || value === ".") {
        return "";
    }

    return normalizePath(value)
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");

}


function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}


/******************************************************************************
 * AsciiDoc Attribute Handling
 *****************************************************************************/

function hasAttribute(text, name) {

    const regex = new RegExp(
        "^:" + name + ":",
        "mi"
    );

    return regex.test(text);
}


function resolveAttributes(source) {

    const attributes = {};

    const attributePattern =
        /^:([^:]+):\s*(.*)$/gm;

    let match;

    while ((match = attributePattern.exec(source)) !== null) {

        const name = match[1].trim();
        const value = match[2].trim();

        attributes[name] = value;

    }

    /*
     * Resolve references such as:
     *
     * :doctitle: TLS-001 - Racetrack
     * :webtitle: {doctitle}
     */

    let changed = true;
    let iterations = 0;

    while (changed && iterations < 20) {

        changed = false;
        iterations++;

        for (const name of Object.keys(attributes)) {

            const original = attributes[name];

            const resolved =
                original.replace(
                    /\{([^}]+)\}/g,
                    (match, reference) => {

                        if (
                            Object.prototype.hasOwnProperty.call(
                                attributes,
                                reference
                            )
                        ) {
                            return attributes[reference];
                        }

                        return match;

                    }
                );

            if (resolved !== original) {

                attributes[name] = resolved;
                changed = true;

            }

        }

    }

    return attributes;

}


function getDocumentId(source) {

    /*
     * Supports:
     *
     * [#tls-001]
     * = TLS-001...
     *
     * and the same form when the ID immediately precedes the title.
     */

    const match =
        source.match(
            /^\[#([^\]]+)\]\s*$/m
        );

    return match
        ? match[1]
        : null;

}


/******************************************************************************
 * Document Model
 *****************************************************************************/

function createDocument(
    sourceFile,
    docsRoot
) {

    const source =
        readTextFile(sourceFile);

    const sourceRelative =
        path.relative(
            docsRoot,
            sourceFile
        );

    const sourceRelativeNormalized =
        normalizePath(
            sourceRelative
        );

    const filename =
        path.basename(
            sourceRelative
        );

    const isIndex =
        filename.toLowerCase() === "index.adoc";

    /*
     * Files beneath /site are published at the website root.
     */

    let outputBase;

    if (
        sourceRelativeNormalized === "site/index.adoc"
    ) {

        outputBase = "";

    } else if (
        sourceRelativeNormalized.startsWith("site/")
    ) {

        outputBase =
            sourceRelativeNormalized.substring(5);

    } else {

        outputBase =
            sourceRelativeNormalized;

    }

    /*
     * Remove .adoc.
     */

    outputBase =
        outputBase.replace(
            /\.adoc$/i,
            ""
        );

    /*
     * index.adoc represents its containing directory.
     *
     * Everything else becomes:
     *
     * filename/index.html
     */

    let outputRelative;

    if (
        outputBase === "" ||
        outputBase.toLowerCase() === "index"
    ) {

        outputRelative =
            "index.html";

    } else if (
        outputBase.endsWith("/index")
    ) {

        outputRelative =
            outputBase.substring(
                0,
                outputBase.length - 5
            ) +
            "/index.html";

    } else {

        outputRelative =
            outputBase +
            "/index.html";

    }

    outputRelative =
        normalizePath(
            outputRelative
        );

    const attributes =
        resolveAttributes(
            source
        );

    return {

        source,

        sourceFile,

        sourceRelative:
            sourceRelativeNormalized,

        filename,

        isIndex,

        outputRelative,

        outputDirectory:
            path.dirname(
                outputRelative
            ),

        documentId:
            getDocumentId(
                source
            ),

        doctitle:
            attributes.doctitle ||
            "",

        webtitle:
            attributes.webtitle ||
            attributes.doctitle ||
            "",

        navtitle:
            attributes.navtitle ||
            attributes.webtitle ||
            attributes.doctitle ||
            "",

        navInclude:
            hasAttribute(
                source,
                "navinclude"
            ),

        navExclude:
            hasAttribute(
                source,
                "navexclude"
            ),

        fragment:
            hasAttribute(
                source,
                "fragment"
            ),

        attributes,

        html: ""

    };

}


/******************************************************************************
 * Document Titles
 *****************************************************************************/

function getPageTitle(document) {

    return (
        document.webtitle ||
        document.doctitle ||
        document.documentId ||
        ""
    );

}


function getNavigationTitle(document) {

    return (
        document.navtitle ||
        document.webtitle ||
        document.doctitle ||
        document.documentId ||
        ""
    );

}


function getBrowserTitle(document) {

    return (
        document.doctitle ||
        document.documentId ||
        ""
    );

}


/******************************************************************************
 * Navigation Rules
 *****************************************************************************/

function shouldIncludeInNavigation(document) {

    if (document.fragment) {
        return false;
    }

    if (document.navExclude) {
        return false;
    }

    /*
     * index.adoc is automatically included.
     */

    if (document.isIndex) {
        return true;
    }

    /*
     * All other documents require explicit inclusion.
     */

    return document.navInclude;

}


/******************************************************************************
 * Repository Scan
 *****************************************************************************/

function scanRepository() {

    console.log(
        `${COLORS.cyan}Scanning repository...${COLORS.reset}`
    );

    const pattern =
        path.join(
            config.paths.docsDir,
            "**/*.adoc"
        ).replace(
            /\\/g,
            "/"
        );

    const files =
        globSync(pattern);

    const documents =
        files.map(
            file =>
                createDocument(
                    file,
                    path.resolve(
                        config.paths.docsDir
                    )
                )
        );

    console.log(
        `${COLORS.green}Found ${documents.length} documents.${COLORS.reset}`
    );

    return documents;

}


/******************************************************************************
 * Resource Copying
 *****************************************************************************/

function copyDirectory(
    sourceDirectory,
    destinationDirectory
) {

    if (!fs.existsSync(sourceDirectory)) {
        return;
    }

    ensureDirectory(
        destinationDirectory
    );

    const entries =
        fs.readdirSync(
            sourceDirectory,
            {
                withFileTypes: true
            }
        );

    for (const entry of entries) {

        const source =
            path.join(
                sourceDirectory,
                entry.name
            );

        const destination =
            path.join(
                destinationDirectory,
                entry.name
            );

        if (entry.isDirectory()) {

            copyDirectory(
                source,
                destination
            );

        } else {

            fs.copyFileSync(
                source,
                destination
            );

        }

    }

}


function copyResources() {

    console.log(
        `${COLORS.cyan}Copying web resources...${COLORS.reset}`
    );

    const resourcesRoot =
        path.resolve(
            "resources"
        );

    const outputRoot =
        path.resolve(
            config.paths.htmlOutputDir
        );

    for (const folder of RESOURCE_FOLDERS) {

        const source =
            path.join(
                resourcesRoot,
                folder
            );

        const destination =
            path.join(
                outputRoot,
                folder
            );

        if (!fs.existsSync(source)) {

            console.log(
                `${COLORS.yellow}Resource folder not found:${COLORS.reset} ` +
                `resources/${folder}`
            );

            continue;

        }

        copyDirectory(
            source,
            destination
        );

        console.log(
            `${COLORS.green}Copied:${COLORS.reset} ` +
            `resources/${folder}`
        );

    }

}


/******************************************************************************
 * Site Tree
 *****************************************************************************/

function createTreeNode(
    name,
    document = null
) {

    return {

        name,

        document,

        directoryName:
            null,

        parent:
            null,

        children:
            []

    };

}


function getPathDepth(value) {

    const normalized =
        normalizeRelativePath(
            value
        );

    if (!normalized) {
        return 0;
    }

    return normalized.split("/").length;

}


function buildSiteTree(documents) {

    const root =
        createTreeNode(
            "Site"
        );

    const navigationDocuments =
        documents.filter(
            shouldIncludeInNavigation
        );

    /*
     * Create the directory structure from index.adoc files.
     */

    const indexes =
        navigationDocuments
            .filter(
                document =>
                    document.isIndex
            )
            .sort(
                (a, b) =>
                    getPathDepth(
                        a.outputRelative
                    ) -
                    getPathDepth(
                        b.outputRelative
                    )
            );

    for (const document of indexes) {

        const directory =
            normalizeRelativePath(
                path.dirname(
                    document.outputRelative
                )
            );

        const parts =
            directory
                ? directory.split("/")
                : [];

        let node = root;

        for (const part of parts) {

            let child =
                node.children.find(
                    candidate =>
                        candidate.directoryName === part
                );

            if (!child) {

                child =
                    createTreeNode(
                        part
                    );

                child.directoryName =
                    part;

                child.parent =
                    node;

                node.children.push(
                    child
                );

            }

            node = child;

        }

        node.document =
            document;

    }

    /*
     * Add explicitly included non-index documents.
     */

    const includedDocuments =
        navigationDocuments.filter(
            document =>
                !document.isIndex
        );

    for (const document of includedDocuments) {

        const parent =
            findNavigationParent(
                root,
                document
            );

        const node =
            createTreeNode(
                getNavigationTitle(
                    document
                ),
                document
            );

        node.parent =
            parent;

        parent.children.push(
            node
        );

    }

    sortSiteTree(root);

    return root;

}


function findNavigationParent(
    root,
    document
) {

    const directory =
        normalizeRelativePath(
            path.dirname(
                document.outputRelative
            )
        );

    if (!directory) {
        return root;
    }

    const parts =
        directory.split("/");

    let node = root;

    for (const part of parts) {

        let child =
            node.children.find(
                candidate =>
                    candidate.directoryName === part
            );

        if (!child) {

            child =
                createTreeNode(
                    part
                );

            child.directoryName =
                part;

            child.parent =
                node;

            node.children.push(
                child
            );

        }

        node = child;

    }

    return node;

}


function getNavigationTitleFromNode(node) {

    if (node.document) {

        return getNavigationTitle(
            node.document
        );

    }

    return node.name;

}


function sortSiteTree(node) {

    node.children.sort(
        (a, b) => {

            const aDocument =
                a.document;

            const bDocument =
                b.document;

            /*
             * Sections/directories first.
             */

            if (
                aDocument === null &&
                bDocument !== null
            ) {
                return -1;
            }

            if (
                aDocument !== null &&
                bDocument === null
            ) {
                return 1;
            }

            const aTitle =
                aDocument
                    ? getNavigationTitle(aDocument)
                    : getNavigationTitleFromNode(a);

            const bTitle =
                bDocument
                    ? getNavigationTitle(bDocument)
                    : getNavigationTitleFromNode(b);

            return aTitle.localeCompare(
                bTitle,
                undefined,
                {
                    sensitivity: "base"
                }
            );

        }
    );

    for (const child of node.children) {

        sortSiteTree(
            child
        );

    }

}


/******************************************************************************
 * Output Paths
 *****************************************************************************/

function getOutputDirectory(document) {

    return path.resolve(
        config.paths.htmlOutputDir,
        document.outputDirectory
    );

}


function getRootPath(document) {

    const outputDirectory =
        getOutputDirectory(
            document
        );

    const outputRoot =
        path.resolve(
            config.paths.htmlOutputDir
        );

    let relative =
        path.relative(
            outputDirectory,
            outputRoot
        );

    relative =
        normalizePath(
            relative
        );

    if (!relative) {
        return "./";
    }

    if (!relative.endsWith("/")) {
        relative += "/";
    }

    return relative;

}


function getRelativeDocumentUrl(
    fromDocument,
    toDocument
) {

    const fromDirectory =
        getOutputDirectory(
            fromDocument
        );

    const toDirectory =
        getOutputDirectory(
            toDocument
        );

    let relative =
        path.relative(
            fromDirectory,
            toDirectory
        );

    relative =
        normalizePath(
            relative
        );

    if (!relative) {
        return "./";
    }

    if (!relative.endsWith("/")) {
        relative += "/";
    }

    return relative;

}


function getDocumentUrl(document) {

    const relative =
        normalizeRelativePath(
            document.outputRelative
        );

    return (
        "/" +
        relative.replace(
            /\/index\.html$/i,
            "/"
        )
    );

}


/******************************************************************************
 * Navigation Rendering
 *****************************************************************************/

function renderNavigation(
    tree,
    currentDocument
) {

    if (!tree.children.length) {
        return "";
    }

    return renderNavigationChildren(
        tree,
        currentDocument
    );

}


function renderNavigationChildren(
    node,
    currentDocument
) {

    let html =
        "<ul>";

    for (const child of node.children) {

        const document =
            child.document;

        if (document) {

            const current =
                document === currentDocument;

            const classes =
                current
                    ? ' class="current"'
                    : "";

            const url =
                getRelativeDocumentUrl(
                    currentDocument,
                    document
                );

            html +=
                `<li${classes}>`;

            html +=
                `<a href="${escapeHtml(url)}">`;

            html +=
                escapeHtml(
                    getNavigationTitle(
                        document
                    )
                );

            html +=
                "</a>";

            if (child.children.length) {

                html +=
                    renderNavigationChildren(
                        child,
                        currentDocument
                    );

            }

            html +=
                "</li>";

        } else {

            html +=
                "<li>";

            html +=
                escapeHtml(
                    getNavigationTitleFromNode(
                        child
                    )
                );

            if (child.children.length) {

                html +=
                    renderNavigationChildren(
                        child,
                        currentDocument
                    );

            }

            html +=
                "</li>";

        }

    }

    html +=
        "</ul>";

    return html;

}


/******************************************************************************
 * Breadcrumbs
 *****************************************************************************/

function findTreePath(
    node,
    document,
    currentPath = []
) {

    if (node.document === document) {

        return [
            ...currentPath,
            node
        ];

    }

    for (const child of node.children) {

        const result =
            findTreePath(
                child,
                document,
                [
                    ...currentPath,
                    child
                ]
            );

        if (result.length) {
            return result;
        }

    }

    return [];

}


function buildBreadcrumbs(
    document,
    siteTree
) {

    const nodes =
        findTreePath(
            siteTree,
            document
        );

    if (!nodes.length) {
        return "";
    }

    let html =
        '<nav class="breadcrumbs" aria-label="Breadcrumb">';

    html +=
        "<ol>";

    nodes.forEach(
        (node, index) => {

            const nodeDocument =
                node.document;

            const current =
                index === nodes.length - 1;

            const title =
                nodeDocument
                    ? getNavigationTitle(
                        nodeDocument
                    )
                    : getNavigationTitleFromNode(
                        node
                    );

            html +=
                "<li>";

            if (
                nodeDocument &&
                !current
            ) {

                const url =
                    getRelativeDocumentUrl(
                        document,
                        nodeDocument
                    );

                html +=
                    `<a href="${escapeHtml(url)}">`;

                html +=
                    escapeHtml(
                        title
                    );

                html +=
                    "</a>";

            } else {

                html +=
                    escapeHtml(
                        title
                    );

            }

            html +=
                "</li>";

        }
    );

    html +=
        "</ol>";

    html +=
        "</nav>";

    return html;

}


/******************************************************************************
 * Template
 *****************************************************************************/

let WEB_TEMPLATE = null;


function validateTemplate(template) {

    const required =
        [
            "TITLE",
            "ROOT",
            "CONTENT"
        ];

    const missing =
        required.filter(
            key =>
                !template.includes(
                    `{{${key}}}`
                )
        );

    if (missing.length) {

        throw new Error(
            "Web template is missing required placeholders: " +
            missing.join(", ")
        );

    }

}


function loadTemplate() {

    if (WEB_TEMPLATE !== null) {
        return WEB_TEMPLATE;
    }

    const templateFile =
        path.resolve(
            TEMPLATE_FILE
        );

    if (!fs.existsSync(templateFile)) {

        throw new Error(
            `Web template not found: ${templateFile}`
        );

    }

    WEB_TEMPLATE =
        readTextFile(
            templateFile
        );

    validateTemplate(
        WEB_TEMPLATE
    );

    return WEB_TEMPLATE;

}


function renderTemplate(
    template,
    values
) {

    let result =
        template;

    for (
        const [key, value]
        of Object.entries(values)
    ) {

        result =
            result.replaceAll(
                `{{${key}}}`,
                value ?? ""
            );

    }

    return result;

}


/******************************************************************************
 * Global Header
 *****************************************************************************/

function renderGlobalNavigation() {

    const sections =
        config.navigation &&
        Array.isArray(
            config.navigation.sections
        )
            ? config.navigation.sections
            : [];

    if (!sections.length) {
        return "";
    }

    return sections
        .map(
            section => {

                const title =
                    escapeHtml(
                        section.title || ""
                    );

                const url =
                    escapeHtml(
                        section.url || "#"
                    );

                return (
                    `<a href="${url}">${title}</a>`
                );

            }
        )
        .join("\n");

}


function renderHeader() {

    return `
<header class="site-header">
    <div class="site-header-inner">
        <a class="site-logo" href="/">ODISC</a>
        <nav class="site-navigation" aria-label="Main navigation">
            ${renderGlobalNavigation()}
        </nav>
    </div>
</header>`;

}


function renderFooter() {

    return `
<footer class="site-footer">
    <div class="site-footer-inner">
        <p>ODISC Racing Ecosystem</p>
    </div>
</footer>`;

}


/******************************************************************************
 * AsciiDoc Compilation
 *****************************************************************************/

function compileDocument(document) {

    const asciidocOptions =
        config.html &&
        config.html.asciidocOptions
            ? config.html.asciidocOptions
            : {};

    const attributes =
        asciidocOptions.attributes || {};

    try {

        document.html =
            asciidoctor.convert(
                document.source,
                {
                    ...asciidocOptions,

                    standalone: false,

                    safe: "unsafe",

                    base_dir:
                        path.dirname(
                            path.resolve(
                                document.sourceFile
                            )
                        ),

                    attributes: {
                        ...attributes,
                        showtitle: false
                    }
                }
            );

        return true;

    } catch (error) {

        console.error(
            `${COLORS.red}ERROR compiling ${document.sourceRelative}:${COLORS.reset}`
        );

        console.error(
            error.message
        );

        return false;

    }

}


/******************************************************************************
 * /site Link Correction
 *****************************************************************************/

function rewriteSiteRelativeLinks(
    html,
    document
) {

    if (
        !document.sourceRelative.startsWith(
            "site/"
        )
    ) {

        return html;

    }

    /*
     * Files under docs/site are moved one directory level upward
     * during publication.
     *
     * Therefore one leading ../ in an href/src path is removed.
     */

    return html.replace(
        /((?:href|src)\s*=\s*["'])((?:\.\.\/)+)/gi,
        (match, prefix, traversal) => {

            const count =
                (
                    traversal.match(
                        /\.\.\//g
                    ) || []
                ).length;

            if (count <= 1) {
                return prefix;
            }

            return (
                prefix +
                "../".repeat(
                    count - 1
                )
            );

        }
    );

}


/******************************************************************************
 * Page Assembly
 *****************************************************************************/

function buildPage(
    document,
    siteTree
) {

    const template =
        loadTemplate();

    const title =
        getBrowserTitle(
            document
        );

    const webTitle =
        getPageTitle(
            document
        );

    const navigation =
        renderNavigation(
            siteTree,
            document
        );

    const breadcrumbs =
        buildBreadcrumbs(
            document,
            siteTree
        );

    const root =
        getRootPath(
            document
        );

    const header =
        renderHeader(
            document
        );

    const footer =
        renderFooter(
            document
        );

    return renderTemplate(
        template,
        {

            TITLE:
                escapeHtml(
                    title
                ),

            WEBTITLE:
                escapeHtml(
                    webTitle
                ),

            ROOT:
                escapeHtml(
                    root
                ),

            HEADER:
                header,

            NAVIGATION:
                navigation,

            BREADCRUMBS:
                breadcrumbs,

            CONTENT:
                document.html,

            FOOTER:
                footer

        }
    );

}


/******************************************************************************
 * Document Validation
 *****************************************************************************/

function validateDocuments(
    documents
) {

    const warnings = [];

    for (const document of documents) {

        if (document.fragment) {
            continue;
        }

        if (!document.doctitle) {

            warnings.push(
                `${document.sourceRelative}: missing :doctitle:`
            );

        }

        if (!document.documentId) {

            warnings.push(
                `${document.sourceRelative}: missing document ID`
            );

        }

    }

    if (!warnings.length) {
        return;
    }

    console.log(
        `${COLORS.yellow}Document validation warnings:${COLORS.reset}`
    );

    for (const warning of warnings) {

        console.log(
            `${COLORS.yellow}  ${warning}${COLORS.reset}`
        );

    }

    console.log("");

}


/******************************************************************************
 * Write Document
 *****************************************************************************/

function writeDocument(
    document,
    siteTree
) {

    if (document.fragment) {

        console.log(
            `${COLORS.yellow}Fragment:${COLORS.reset} ` +
            document.sourceRelative
        );

        return "fragment";

    }

    if (!compileDocument(document)) {
        return "failed";
    }

    document.html =
        rewriteSiteRelativeLinks(
            document.html,
            document
        );

    const page =
        buildPage(
            document,
            siteTree
        );

    const outputFile =
        path.resolve(
            config.paths.htmlOutputDir,
            document.outputRelative
        );

    ensureDirectory(
        path.dirname(
            outputFile
        )
    );

    fs.writeFileSync(
        outputFile,
        page,
        "utf8"
    );

    console.log(
        `${COLORS.green}Compiled:${COLORS.reset} ` +
        `${document.sourceRelative} -> ` +
        `${document.outputRelative}`
    );

    return "success";

}


/******************************************************************************
 * Main Build
 *****************************************************************************/

function buildHtml() {

    console.log(
        `${COLORS.cyan}--- Starting HTML Build ---${COLORS.reset}`
    );

    const outputRoot =
        path.resolve(
            config.paths.htmlOutputDir
        );

    /*
     * Only the configured HTML output directory is cleaned.
     */

    console.log(
        `${COLORS.yellow}Cleaning HTML output directory:${COLORS.reset} ` +
        outputRoot
    );

    cleanDirectory(
        outputRoot
    );

    /*
     * Copy publishable resources.
     */

    copyResources();

    /*
     * Load and validate the web template.
     */

    loadTemplate();

    /*
     * Scan the documentation source tree.
     */

    const documents =
        scanRepository();

    if (!documents.length) {

        console.log(
            `${COLORS.yellow}No AsciiDoc files found to compile.${COLORS.reset}`
        );

        return;

    }

    validateDocuments(
        documents
    );

    /*
     * Build navigation once for the entire site.
     */

    const siteTree =
        buildSiteTree(
            documents
        );

    let compiled = 0;
    let fragments = 0;
    let failed = 0;

    for (const document of documents) {

        const result =
            writeDocument(
                document,
                siteTree
            );

        if (result === "success") {
            compiled++;
        }

        if (result === "fragment") {
            fragments++;
        }

        if (result === "failed") {
            failed++;
        }

    }

    console.log("");

    console.log(
        `${COLORS.cyan}--- HTML Build Complete ---${COLORS.reset}`
    );

    console.log(
        `${COLORS.green}Compiled:${COLORS.reset} ${compiled}`
    );

    console.log(
        `${COLORS.yellow}Fragments:${COLORS.reset} ${fragments}`
    );

    console.log(
        `${COLORS.red}Failed:${COLORS.reset} ${failed}`
    );

    if (failed > 0) {

        process.exitCode = 1;

    } else {

        console.log(
            `${COLORS.green}Build successful.${COLORS.reset}`
        );

    }

}


/******************************************************************************
 * Entry Point
 *****************************************************************************/

if (require.main === module) {

    try {

        buildHtml();

    } catch (error) {

        console.error(
            `${COLORS.red}Critical HTML build error:${COLORS.reset}`
        );

        console.error(
            error.stack ||
            error.message
        );

        process.exitCode = 1;

    }

}


module.exports = buildHtml;