const state = {
  files: [],
  selectedPageId: "",
  selectedEditorId: "",
  objectUrls: [],
  runtimeLogs: [],
  lastAudit: null,
};

const input = document.querySelector("#project-input");
const folderInput = document.querySelector("#folder-input");
const dropzone = document.querySelector("#dropzone");
const fileList = document.querySelector("#file-list");
const fileCount = document.querySelector("#file-count");
const entryCount = document.querySelector("#entry-count");
const assetCount = document.querySelector("#asset-count");
const issueCount = document.querySelector("#issue-count");
const pageSelect = document.querySelector("#page-select");
const editorSelect = document.querySelector("#editor-select");
const codeEditor = document.querySelector("#code-editor");
const previewFrame = document.querySelector("#preview-frame");
const buildButton = document.querySelector("#build-button");
const repairButton = document.querySelector("#repair-button");
const resetButton = document.querySelector("#reset-button");
const saveEditorButton = document.querySelector("#save-editor-button");
const downloadFileButton = document.querySelector("#download-file-button");
const downloadReportButton = document.querySelector("#download-report-button");
const report = document.querySelector("#report");
const reportStatus = document.querySelector("#report-status");
const runtimeLog = document.querySelector("#runtime-log");
const runtimeCount = document.querySelector("#runtime-count");

const textExtensions = new Set(["css", "csv", "htm", "html", "js", "json", "md", "svg", "txt", "xml", "webmanifest"]);
const assetExtensions = new Set(["avif", "gif", "jpg", "jpeg", "mp3", "mp4", "ogg", "otf", "png", "svg", "ttf", "wav", "webm", "webp", "woff", "woff2"]);
const pageExtensions = new Set(["htm", "html"]);
const scriptExtensions = new Set(["js", "mjs", "cjs", "ts", "tsx", "jsx"]);
const styleExtensions = new Set(["css", "scss", "sass", "less"]);

input.addEventListener("change", (event) => processFileList(event.target.files));
folderInput.addEventListener("change", (event) => processFileList(event.target.files));
buildButton.addEventListener("click", buildReport);
repairButton.addEventListener("click", repairCommonIssues);
resetButton.addEventListener("click", resetFactory);
saveEditorButton.addEventListener("click", applyEditorChanges);
downloadFileButton.addEventListener("click", downloadCurrentFile);
downloadReportButton.addEventListener("click", downloadAuditReport);
pageSelect.addEventListener("change", () => previewPage(pageSelect.value));
editorSelect.addEventListener("change", () => loadEditorFile(editorSelect.value));

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (event) => processFileList(event.dataTransfer.files));

async function processFileList(fileListObject) {
  const files = Array.from(fileListObject || []);
  if (!files.length) return;

  setStatus("Reading files", "warn");

  for (const file of files) {
    try {
      if (file.name.toLowerCase().endsWith(".zip")) {
        await expandZip(file);
      } else {
        await addBrowserFile(file);
      }
    } catch (error) {
      showError(`Could not load ${file.name}: ${error.message}`);
    }
  }

  renderFiles();
  renderPageOptions();
  renderEditorOptions();
  autoPreviewFirstPage();
  buildReport();
}

async function addBrowserFile(file) {
  const path = normalizePath(file.webkitRelativePath || file.name);
  const content = await readMaybeText(file, path);
  const blobUrl = URL.createObjectURL(file);
  state.objectUrls.push(blobUrl);
  addFile({ name: path.split("/").pop(), path, size: file.size, type: file.type || typeFor(path), content, blobUrl });
}

async function expandZip(file) {
  const entries = await readZipEntries(file);

  for (const entry of entries) {
    const extension = extensionFor(entry.name);
    const isText = textExtensions.has(extension);
    const blob = new Blob([entry.bytes], { type: typeFor(entry.name) });
    const content = isText ? new TextDecoder().decode(entry.bytes) : "";
    const blobUrl = URL.createObjectURL(blob);
    state.objectUrls.push(blobUrl);
    addFile({
      name: entry.name.split("/").pop(),
      path: normalizePath(entry.name),
      size: entry.bytes.byteLength || content.length,
      type: typeFor(entry.name),
      content,
      blobUrl,
    });
  }
}

async function readZipEntries(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const directoryOffset = findCentralDirectoryOffset(view);
  const entries = [];
  let offset = directoryOffset;

  while (offset < view.byteLength && view.getUint32(offset, true) === 0x02014b50) {
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (!name.endsWith("/") && !name.startsWith("__MACOSX/")) {
      entries.push({
        name,
        bytes: await extractZipEntry(view, bytes, localHeaderOffset, compressedSize, compressionMethod),
      });
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findCentralDirectoryOffset(view) {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return view.getUint32(offset + 16, true);
    }
  }
  throw new Error("This zip file could not be read. Try exporting a standard zip archive.");
}

async function extractZipEntry(view, bytes, localHeaderOffset, compressedSize, compressionMethod) {
  if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
    throw new Error("A zip entry has an invalid local header.");
  }

  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) return compressedBytes;
  if (compressionMethod === 8 && "DecompressionStream" in window) {
    const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  throw new Error("This zip uses a compression method this browser cannot preview.");
}

async function readMaybeText(file, path = file.name) {
  if (!textExtensions.has(extensionFor(path))) return "";
  return file.text();
}

function addFile(file) {
  const existingIndex = state.files.findIndex((candidate) => normalizePath(candidate.path) === normalizePath(file.path));
  const id = existingIndex >= 0 ? state.files[existingIndex].id : `${file.path}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const nextFile = { ...file, id, editable: isEditable(file.path) };

  if (existingIndex >= 0) {
    state.files[existingIndex] = nextFile;
  } else {
    state.files.push(nextFile);
  }
}

function renderFiles() {
  fileCount.textContent = `${state.files.length}`;
  entryCount.textContent = `${htmlFiles().length}`;
  assetCount.textContent = `${state.files.filter((file) => assetExtensions.has(extensionFor(file.path))).length}`;

  if (!state.files.length) {
    fileList.innerHTML = '<p class="empty-state">Upload a project to see files, page candidates, and asset hints.</p>';
    return;
  }

  fileList.innerHTML = state.files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => {
      const badges = [categoryFor(file), file.editable ? "editable" : "binary"];
      const previewButton = isHtmlFile(file.path) ? `<button type="button" data-page-id="${file.id}">Preview</button>` : "";
      const editButton = file.editable ? `<button type="button" data-edit-id="${file.id}">Edit</button>` : "";
      return `
        <div class="file-item">
          <div>
            <strong>${escapeHtml(file.path)}</strong>
            <div class="file-meta">${formatBytes(file.size)} • ${escapeHtml(file.type || typeFor(file.path))}</div>
            <div class="tag-row">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div>
          </div>
          <div class="file-actions">${previewButton}${editButton}</div>
        </div>
      `;
    })
    .join("");

  fileList.querySelectorAll("[data-page-id]").forEach((button) => {
    button.addEventListener("click", () => {
      pageSelect.value = button.dataset.pageId;
      previewPage(button.dataset.pageId);
    });
  });

  fileList.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      editorSelect.value = button.dataset.editId;
      loadEditorFile(button.dataset.editId);
    });
  });
}

function renderPageOptions() {
  const pages = htmlFiles();
  pageSelect.innerHTML = pages.length
    ? pages.map((file) => `<option value="${file.id}">${escapeHtml(file.path)}</option>`).join("")
    : '<option value="">No page loaded</option>';
}

function renderEditorOptions() {
  const editableFiles = state.files.filter((file) => file.editable).sort((a, b) => a.path.localeCompare(b.path));
  editorSelect.innerHTML = editableFiles.length
    ? editableFiles.map((file) => `<option value="${file.id}">${escapeHtml(file.path)}</option>`).join("")
    : '<option value="">No editable file</option>';

  if (!editableFiles.length) {
    state.selectedEditorId = "";
    codeEditor.value = "";
    return;
  }

  if (!state.selectedEditorId || !editableFiles.some((file) => file.id === state.selectedEditorId)) {
    state.selectedEditorId = editableFiles[0].id;
    editorSelect.value = state.selectedEditorId;
    loadEditorFile(state.selectedEditorId);
  }
}

function autoPreviewFirstPage() {
  if (state.selectedPageId && state.files.some((file) => file.id === state.selectedPageId)) return;
  const firstPage = htmlFiles()[0];
  if (firstPage) {
    pageSelect.value = firstPage.id;
    previewPage(firstPage.id);
  }
}

function previewPage(pageId) {
  const page = state.files.find((file) => file.id === pageId);
  state.selectedPageId = pageId;
  state.runtimeLogs = [];
  renderRuntimeLog();

  if (!page) {
    previewFrame.removeAttribute("srcdoc");
    return;
  }

  previewFrame.srcdoc = injectBaseAndConsole(rewriteLocalAssetReferences(page.content, page.path), page.path);
}

function rewriteLocalAssetReferences(html, pagePath) {
  const pageDirectory = pagePath.includes("/") ? pagePath.slice(0, pagePath.lastIndexOf("/") + 1) : "";
  return html.replace(/(src|href)=["']([^"'#]+)["']/gi, (fullMatch, attribute, asset) => {
    if (/^(https?:|data:|mailto:|tel:|#|blob:)/i.test(asset)) return fullMatch;
    const normalized = normalizePath(`${pageDirectory}${asset}`);
    const referencedFile = state.files.find((file) => normalizePath(file.path) === normalized);
    if (!referencedFile?.blobUrl) return fullMatch;
    return `${attribute}="${referencedFile.blobUrl}"`;
  });
}

function injectBaseAndConsole(html, path) {
  const basePath = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const debugScript = `
    <script>
      ['log', 'warn', 'error'].forEach((level) => {
        const original = console[level];
        console[level] = (...args) => {
          parent.postMessage({ type: 'demo-factory-console', level, message: args.map(String).join(' ') }, '*');
          original.apply(console, args);
        };
      });
      window.addEventListener('error', (event) => {
        parent.postMessage({ type: 'demo-factory-error', level: 'error', message: event.message, source: event.filename, line: event.lineno }, '*');
      });
      window.addEventListener('unhandledrejection', (event) => {
        parent.postMessage({ type: 'demo-factory-error', level: 'error', message: String(event.reason || 'Unhandled promise rejection') }, '*');
      });
    <\/script>
  `;
  const baseTag = basePath ? `<base href="${escapeAttribute(basePath)}">` : "";

  if (html.includes("</head>")) {
    return html.replace("</head>", `${baseTag}${debugScript}</head>`);
  }
  return `${baseTag}${debugScript}${html}`;
}

window.addEventListener("message", (event) => {
  if (!event.data?.type?.startsWith("demo-factory-")) return;
  state.runtimeLogs.push({
    level: event.data.level || (event.data.type === "demo-factory-error" ? "error" : "log"),
    message: event.data.message || "No message",
    source: event.data.source || "preview",
    line: event.data.line || "",
    time: new Date().toLocaleTimeString(),
  });
  renderRuntimeLog();
  if (event.data.type === "demo-factory-error") setStatus("Runtime warnings", "warn");
});

function renderRuntimeLog() {
  runtimeCount.textContent = `${state.runtimeLogs.length} ${state.runtimeLogs.length === 1 ? "log" : "logs"}`;
  if (!state.runtimeLogs.length) {
    runtimeLog.innerHTML = '<p class="empty-state">Preview a page to capture console messages and runtime errors.</p>';
    return;
  }

  runtimeLog.innerHTML = state.runtimeLogs
    .map((entry) => `
      <div class="log-entry ${entry.level}">
        <strong>${escapeHtml(entry.level.toUpperCase())}</strong>
        <span>${escapeHtml(entry.time)}</span>
        <p>${escapeHtml(entry.message)}${entry.line ? ` at ${escapeHtml(entry.source)}:${escapeHtml(entry.line)}` : ""}</p>
      </div>
    `)
    .join("");
}

function buildReport() {
  if (!state.files.length) {
    report.innerHTML = '<p class="empty-state">Upload files, then run an audit to generate repair notes.</p>';
    issueCount.textContent = "0";
    state.lastAudit = null;
    setStatus("Ready", "good");
    return;
  }

  const audit = auditProject();
  state.lastAudit = audit;
  issueCount.textContent = `${audit.issues.length}`;

  report.innerHTML = [
    reportCard("Build summary", audit.summary),
    reportCard("Repair queue", audit.issues.length ? audit.issues : ["No blocking repair items were found in this upload."]),
    reportCard("App, game & PWA signals", audit.appSignals.length ? audit.appSignals : ["No app/game-specific signals detected yet."]),
    reportCard("External resources", audit.externalResources.length ? audit.externalResources : ["No external http(s) resources detected in HTML files."]),
    reportCard("Suggested next steps", audit.nextSteps),
  ].join("");

  setStatus(audit.issues.length ? "Issues found" : "Clean", audit.issues.length ? "warn" : "good");
}

function auditProject() {
  const pages = htmlFiles();
  const scripts = state.files.filter((file) => scriptExtensions.has(extensionFor(file.path)));
  const styles = state.files.filter((file) => styleExtensions.has(extensionFor(file.path)));
  const assets = state.files.filter((file) => assetExtensions.has(extensionFor(file.path)));
  const packageFile = state.files.find((file) => file.path.endsWith("package.json"));
  const manifestFile = state.files.find((file) => /manifest\.json$|\.webmanifest$/i.test(file.path));
  const serviceWorker = state.files.find((file) => /(^|\/)sw\.js$|service-worker\.js$/i.test(file.path));
  const issues = collectWarnings(pages);
  const externalResources = collectExternalLinks(pages);
  const appSignals = collectAppSignals(pages, { packageFile, manifestFile, serviceWorker });
  const largeFiles = state.files.filter((file) => file.size > 5 * 1024 * 1024).map((file) => `${file.path} is ${formatBytes(file.size)}; consider compression or lazy loading.`);

  issues.push(...largeFiles);

  const summary = [
    `${state.files.length} total files loaded`,
    `${pages.length} HTML entry page${pages.length === 1 ? "" : "s"} ready for preview`,
    `${scripts.length} script file${scripts.length === 1 ? "" : "s"}, ${styles.length} stylesheet${styles.length === 1 ? "" : "s"}, and ${assets.length} media/font asset${assets.length === 1 ? "" : "s"} detected`,
    packageFile ? `Found package metadata at ${packageFile.path}.` : "No package.json found; build commands cannot be inferred from metadata.",
  ];

  const nextSteps = [
    "Preview every detected entry page and watch the runtime console for broken scripts or missing assets.",
    "Use the repair bench to apply safe HTML, CSS, JS, JSON, SVG, or text changes, then download patched files.",
    packageFile ? describePackageScripts(packageFile) : "If this is a framework app, upload the built static output or include package.json so build scripts can be audited.",
    "For release, re-run the audit after repairs and package your final static output as a clean zip.",
  ];

  return {
    summary,
    issues: [...new Set(issues)],
    externalResources,
    appSignals,
    nextSteps,
  };
}

function collectWarnings(pages) {
  const warnings = [];
  if (!pages.length) warnings.push("No HTML page was found, so the factory cannot preview the project yet.");

  for (const page of pages) {
    const lower = page.content.toLowerCase();
    if (!lower.includes("<title")) warnings.push(`${page.path} is missing a <title> tag.`);
    if (!lower.includes("viewport")) warnings.push(`${page.path} may be missing a responsive viewport meta tag.`);
    if (!/<html[^>]+lang=/i.test(page.content)) warnings.push(`${page.path} is missing an html lang attribute for accessibility.`);
    if (lower.includes("file://")) warnings.push(`${page.path} references a local file:// URL that will not work after publishing.`);
    if (/http:\/\//i.test(page.content)) warnings.push(`${page.path} references insecure http:// resources; use https:// where possible.`);
    if (/<img\b(?![^>]*\balt=)/i.test(page.content)) warnings.push(`${page.path} has images without alt text.`);
    const missingAssets = findMissingAssets(page.content, page.path);
    warnings.push(...missingAssets);
  }

  return [...new Set(warnings)];
}

function collectExternalLinks(pages) {
  const links = [];
  const urlPattern = /(?:src|href)=["'](https?:\/\/[^"']+)["']/gi;

  for (const page of pages) {
    for (const match of page.content.matchAll(urlPattern)) {
      links.push(`${page.path}: ${match[1]}`);
    }
  }

  return [...new Set(links)];
}

function collectAppSignals(pages, { packageFile, manifestFile, serviceWorker }) {
  const signals = [];
  if (packageFile) signals.push(describePackageScripts(packageFile));
  if (manifestFile) signals.push(`PWA manifest detected at ${manifestFile.path}.`);
  if (serviceWorker) signals.push(`Service worker detected at ${serviceWorker.path}; verify offline caching in a deployed origin.`);

  for (const page of pages) {
    if (/<canvas\b/i.test(page.content)) signals.push(`${page.path} uses canvas, which is common for games and visual apps.`);
    if (/requestAnimationFrame|WebGL|AudioContext|Gamepad/i.test(page.content)) signals.push(`${page.path} includes game/app runtime APIs.`);
  }

  return [...new Set(signals)];
}

function describePackageScripts(packageFile) {
  try {
    const packageJson = JSON.parse(packageFile.content || "{}");
    const scripts = Object.keys(packageJson.scripts || {});
    if (!scripts.length) return `${packageFile.path} exists, but no npm scripts were found.`;
    return `${packageFile.path} scripts: ${scripts.map((script) => `npm run ${script}`).join(", ")}.`;
  } catch {
    return `${packageFile.path} could not be parsed as JSON.`;
  }
}

function findMissingAssets(content, pagePath) {
  const warnings = [];
  const assetPattern = /(?:src|href)=["']([^"'#]+)["']/gi;
  const pageDirectory = pagePath.includes("/") ? pagePath.slice(0, pagePath.lastIndexOf("/") + 1) : "";

  for (const match of content.matchAll(assetPattern)) {
    const asset = match[1];
    if (/^(https?:|data:|mailto:|tel:|#)/i.test(asset)) continue;
    const normalized = normalizePath(`${pageDirectory}${asset}`);
    if (!state.files.some((file) => normalizePath(file.path) === normalized)) {
      warnings.push(`${pagePath} references ${asset}, but that file was not found in the upload.`);
    }
  }

  return warnings;
}

function repairCommonIssues() {
  let repairCount = 0;

  for (const page of htmlFiles()) {
    let content = ensureRepairableHtmlShell(page.content);
    if (!/<title[\s>]/i.test(content)) {
      content = content.replace(/<head[^>]*>/i, (match) => `${match}\n    <title>${escapeHtml(baseName(page.path))}</title>`);
      repairCount += 1;
    }
    if (!/name=["']viewport["']/i.test(content)) {
      content = content.replace(/<head[^>]*>/i, (match) => `${match}\n    <meta name="viewport" content="width=device-width, initial-scale=1" />`);
      repairCount += 1;
    }
    if (!/<html[^>]+lang=/i.test(content)) {
      content = content.replace(/<html(\s|>)/i, '<html lang="en"$1');
      repairCount += 1;
    }
    if (content !== page.content) updateFileContent(page.id, content);
  }

  renderFiles();
  renderPageOptions();
  renderEditorOptions();
  if (state.selectedPageId) previewPage(state.selectedPageId);
  buildReport();

  if (repairCount) {
    addRuntimeNote(`Applied ${repairCount} safe HTML repair${repairCount === 1 ? "" : "s"}. Review and download patched files.`);
  } else {
    addRuntimeNote("No safe automatic HTML repairs were needed.");
  }
}


function ensureRepairableHtmlShell(content) {
  let nextContent = content;
  if (!/<html[\s>]/i.test(nextContent)) {
    nextContent = `<!doctype html>
<html>
<head></head>
<body>
${nextContent}
</body>
</html>`;
  } else if (!/<head[\s>]/i.test(nextContent)) {
    nextContent = nextContent.replace(/<html[^>]*>/i, (match) => `${match}
<head></head>`);
  }
  return nextContent;
}

function loadEditorFile(fileId) {
  const file = state.files.find((candidate) => candidate.id === fileId);
  state.selectedEditorId = fileId;
  codeEditor.value = file?.content || "";
}

function applyEditorChanges() {
  const file = state.files.find((candidate) => candidate.id === state.selectedEditorId);
  if (!file) {
    showError("Choose an editable file before applying changes.");
    return;
  }

  updateFileContent(file.id, codeEditor.value);
  renderFiles();
  renderPageOptions();
  buildReport();
  if (state.selectedPageId === file.id) previewPage(file.id);
  addRuntimeNote(`Applied edits to ${file.path}.`);
}

function updateFileContent(fileId, content) {
  const file = state.files.find((candidate) => candidate.id === fileId);
  if (!file) return;
  if (file.blobUrl) URL.revokeObjectURL(file.blobUrl);
  const blob = new Blob([content], { type: typeFor(file.path) });
  const blobUrl = URL.createObjectURL(blob);
  state.objectUrls.push(blobUrl);
  file.content = content;
  file.size = blob.size;
  file.blobUrl = blobUrl;
}

function downloadCurrentFile() {
  const file = state.files.find((candidate) => candidate.id === state.selectedEditorId);
  if (!file) {
    showError("Choose an editable file before downloading.");
    return;
  }
  downloadBlob(new Blob([file.content], { type: typeFor(file.path) }), file.name || baseName(file.path));
}

function downloadAuditReport() {
  const audit = state.lastAudit || auditProject();
  const lines = [
    "# Demo Factory Audit Report",
    "",
    "## Summary",
    ...audit.summary.map((item) => `- ${item}`),
    "",
    "## Repair Queue",
    ...(audit.issues.length ? audit.issues : ["No blocking repair items were found."]).map((item) => `- ${item}`),
    "",
    "## App, Game & PWA Signals",
    ...(audit.appSignals.length ? audit.appSignals : ["No app/game-specific signals detected."]).map((item) => `- ${item}`),
    "",
    "## External Resources",
    ...(audit.externalResources.length ? audit.externalResources : ["No external resources detected."]).map((item) => `- ${item}`),
    "",
    "## Runtime Logs",
    ...(state.runtimeLogs.length ? state.runtimeLogs.map((entry) => `- [${entry.level}] ${entry.message}`) : ["No runtime logs captured."]),
  ];
  downloadBlob(new Blob([lines.join("\n")], { type: "text/markdown" }), "demo-factory-audit.md");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function addRuntimeNote(message) {
  state.runtimeLogs.push({ level: "log", message, source: "factory", line: "", time: new Date().toLocaleTimeString() });
  renderRuntimeLog();
}

function showError(message) {
  report.innerHTML = `<div class="report-card"><h3>Upload issue</h3><p>${escapeHtml(message)}</p></div>`;
  setStatus("Error", "danger");
}

function reportCard(title, items) {
  return `
    <section class="report-card">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function resetFactory() {
  state.objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  state.files = [];
  state.objectUrls = [];
  state.runtimeLogs = [];
  state.lastAudit = null;
  state.selectedPageId = "";
  state.selectedEditorId = "";
  input.value = "";
  folderInput.value = "";
  codeEditor.value = "";
  renderFiles();
  renderPageOptions();
  renderEditorOptions();
  renderRuntimeLog();
  previewFrame.removeAttribute("srcdoc");
  buildReport();
}

function htmlFiles() {
  return state.files.filter((file) => isHtmlFile(file.path));
}

function isHtmlFile(path) {
  return pageExtensions.has(extensionFor(path));
}

function isEditable(path) {
  return textExtensions.has(extensionFor(path));
}

function extensionFor(path) {
  return path.split(".").pop()?.toLowerCase() || "";
}

function categoryFor(file) {
  const extension = extensionFor(file.path);
  if (pageExtensions.has(extension)) return "page";
  if (scriptExtensions.has(extension)) return "script";
  if (styleExtensions.has(extension)) return "style";
  if (assetExtensions.has(extension)) return "asset";
  if (file.path.endsWith("package.json")) return "build metadata";
  return "file";
}

function typeFor(path) {
  const extension = extensionFor(path);
  const types = {
    css: "text/css",
    csv: "text/csv",
    gif: "image/gif",
    htm: "text/html",
    html: "text/html",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    png: "image/png",
    svg: "image/svg+xml",
    txt: "text/plain",
    wav: "audio/wav",
    webmanifest: "application/manifest+json",
    webm: "video/webm",
    webp: "image/webp",
    xml: "application/xml",
  };
  return types[extension] || "application/octet-stream";
}

function normalizePath(path) {
  const segments = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

function baseName(path) {
  return path.split("/").pop() || "demo";
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function setStatus(label, type) {
  reportStatus.textContent = label;
  reportStatus.className = `badge ${type}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
