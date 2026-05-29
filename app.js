const state = {
  files: [],
  selectedPageId: "",
  objectUrls: [],
};

const input = document.querySelector("#project-input");
const dropzone = document.querySelector("#dropzone");
const fileList = document.querySelector("#file-list");
const fileCount = document.querySelector("#file-count");
const pageSelect = document.querySelector("#page-select");
const previewFrame = document.querySelector("#preview-frame");
const buildButton = document.querySelector("#build-button");
const resetButton = document.querySelector("#reset-button");
const report = document.querySelector("#report");
const reportStatus = document.querySelector("#report-status");

const textExtensions = new Set(["css", "csv", "htm", "html", "js", "json", "md", "svg", "txt", "xml"]);

input.addEventListener("change", (event) => processFileList(event.target.files));
buildButton.addEventListener("click", buildReport);
resetButton.addEventListener("click", resetFactory);
pageSelect.addEventListener("change", () => previewPage(pageSelect.value));

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
      } else if (isHtmlFile(file.name)) {
        const content = await file.text();
        addFile({ name: file.name, path: file.name, size: file.size, type: file.type || "text/html", content });
      } else {
        const content = await readMaybeText(file);
        const blobUrl = URL.createObjectURL(file);
        state.objectUrls.push(blobUrl);
        addFile({ name: file.name, path: file.name, size: file.size, type: file.type || "application/octet-stream", content, blobUrl });
      }
    } catch (error) {
      showError(`Could not load ${file.name}: ${error.message}`);
    }
  }

  renderFiles();
  renderPageOptions();
  autoPreviewFirstPage();
  buildReport();
}

async function expandZip(file) {
  const entries = await readZipEntries(file);

  for (const entry of entries) {
    const extension = extensionFor(entry.name);
    const isText = textExtensions.has(extension);
    const blob = new Blob([entry.bytes]);
    const content = isText ? new TextDecoder().decode(entry.bytes) : "";
    const blobUrl = URL.createObjectURL(blob);
    state.objectUrls.push(blobUrl);
    addFile({
      name: entry.name.split("/").pop(),
      path: entry.name,
      size: entry.bytes.byteLength || content.length,
      type: isHtmlFile(entry.name) ? "text/html" : extension || "file",
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

    if (!name.endsWith("/")) {
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

async function readMaybeText(file) {
  const extension = extensionFor(file.name);
  if (!textExtensions.has(extension)) return "";
  return file.text();
}

function addFile(file) {
  const id = `${file.path}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.files.push({ ...file, id });
}

function renderFiles() {
  fileCount.textContent = `${state.files.length} ${state.files.length === 1 ? "file" : "files"}`;

  if (!state.files.length) {
    fileList.innerHTML = '<p class="empty-state">Upload a project to see files, page candidates, and asset hints.</p>';
    return;
  }

  fileList.innerHTML = state.files
    .map((file) => {
      const previewButton = isHtmlFile(file.path) ? `<button type="button" data-page-id="${file.id}">Preview</button>` : "";
      return `
        <div class="file-item">
          <div>
            <strong>${escapeHtml(file.path)}</strong>
            <div class="file-meta">${formatBytes(file.size)} • ${escapeHtml(file.type || extensionFor(file.path) || "file")}</div>
          </div>
          ${previewButton}
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
}

function renderPageOptions() {
  const pages = htmlFiles();
  pageSelect.innerHTML = pages.length
    ? pages.map((file) => `<option value="${file.id}">${escapeHtml(file.path)}</option>`).join("")
    : '<option value="">No page loaded</option>';
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
      window.addEventListener('error', (event) => {
        parent.postMessage({ type: 'demo-factory-error', message: event.message, source: event.filename, line: event.lineno }, '*');
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
  if (event.data?.type !== "demo-factory-error") return;
  const current = report.innerHTML;
  report.innerHTML = `${current}<div class="report-card"><h3>Runtime error</h3><p>${escapeHtml(event.data.message)} at ${escapeHtml(event.data.source || "inline script")}:${event.data.line || "?"}</p></div>`;
  setStatus("Warnings", "warn");
});

function buildReport() {
  if (!state.files.length) {
    report.innerHTML = '<p class="empty-state">Upload files, then build a report to generate debug notes.</p>';
    setStatus("Ready", "good");
    return;
  }

  const pages = htmlFiles();
  const scripts = state.files.filter((file) => extensionFor(file.path) === "js");
  const styles = state.files.filter((file) => extensionFor(file.path) === "css");
  const warnings = collectWarnings(pages);
  const externalLinks = collectExternalLinks(pages);

  report.innerHTML = [
    reportCard("Build summary", [
      `${state.files.length} total files loaded`,
      `${pages.length} HTML page${pages.length === 1 ? "" : "s"} ready for preview`,
      `${scripts.length} script file${scripts.length === 1 ? "" : "s"} and ${styles.length} stylesheet${styles.length === 1 ? "" : "s"} detected`,
    ]),
    reportCard("Debug checklist", warnings.length ? warnings : ["No obvious structural warnings found."]),
    reportCard("External resources", externalLinks.length ? externalLinks : ["No external http(s) resources detected in HTML files."]),
    reportCard("Next build steps", [
      "Verify page routing and relative asset paths in the preview.",
      "Run project-specific build commands outside this static demo shell when needed.",
      "Package final static output as a zip and upload it again for a release smoke test.",
    ]),
  ].join("");

  setStatus(warnings.length ? "Warnings" : "Clean", warnings.length ? "warn" : "good");
}

function collectWarnings(pages) {
  const warnings = [];
  if (!pages.length) warnings.push("No HTML page was found, so the factory cannot preview the project yet.");

  for (const page of pages) {
    const lower = page.content.toLowerCase();
    if (!lower.includes("<title")) warnings.push(`${page.path} is missing a <title> tag.`);
    if (!lower.includes("viewport")) warnings.push(`${page.path} may be missing a responsive viewport meta tag.`);
    if (lower.includes("file://")) warnings.push(`${page.path} references a local file:// URL that will not work after publishing.`);
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
  state.selectedPageId = "";
  input.value = "";
  renderFiles();
  renderPageOptions();
  previewFrame.removeAttribute("srcdoc");
  buildReport();
}

function htmlFiles() {
  return state.files.filter((file) => isHtmlFile(file.path));
}

function isHtmlFile(path) {
  return /\.html?$/i.test(path);
}

function extensionFor(path) {
  return path.split(".").pop()?.toLowerCase() || "";
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
