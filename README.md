# Demo Factory

Demo Factory is a static browser workspace for testing small web projects. Upload standalone HTML files or zipped static projects, then preview detected pages in a sandboxed iframe, inspect the file inventory, and generate a debug/build checklist.

## Features

- Drag-and-drop intake for `.html`, `.htm`, and standard `.zip` archives.
- Client-side zip expansion with no server upload required.
- Sandboxed HTML preview with local asset reference rewriting for files included in the upload.
- Debug report covering missing titles, viewport hints, missing relative assets, external resources, and next build steps.

## Run locally

```bash
python3 -m http.server 4173
```

Open <http://127.0.0.1:4173/> and upload a demo package.
