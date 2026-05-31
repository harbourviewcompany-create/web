# Demo Factory

Demo Factory is a static browser workspace for testing small web projects. Upload standalone HTML files, folders, or zipped static projects, then preview detected pages in a sandboxed iframe, inspect the file inventory, capture runtime logs, edit repairable files, and generate an audit/build checklist.

## Features

- Drag-and-drop intake for `.html`, `.htm`, standard `.zip` archives, and browser folder uploads.
- Client-side zip expansion with no server upload required.
- Sandboxed HTML preview with local asset reference rewriting for files included in the upload.
- Project audit for missing titles, viewport tags, language attributes, missing relative assets, insecure resources, large files, package scripts, PWA files, and game/app runtime signals.
- Runtime console and error capture from previewed pages.
- Repair bench for editing text-based files, applying safe HTML repairs, downloading patched files, and exporting a Markdown audit report.

## Run locally

```bash
python3 -m http.server 4173
```

Open <http://127.0.0.1:4173/> and upload a demo package.
