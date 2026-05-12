// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Packages the webpack build output (dist/extension.js + the package
// manifest) into a single .foxe file. A .foxe is a renamed .zip that
// Foxglove's extension loaders unpack at install time; the only required
// entries are the package.json and whatever file its `main` field points
// at. We zip only what the manifest's `files` glob enumerates so the
// archive doesn't accidentally ship node_modules or source maps.
//
// Output: dist/<publisher>.<name>-<version>.foxe   (matches the naming
// convention the registry-style extensions use, so build_extensions.sh
// can pick it up unchanged in MR-future workflows.)

import { createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// JSZip is already in the trillium dep tree (used by BuiltinExtensionLoader
// + IdbExtensionLoader). Pull it from the workspace root rather than adding
// a new direct dependency to this package.
const JSZip = require("jszip");

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const distDir = join(pkgRoot, "dist");
const manifestPath = join(pkgRoot, "package.json");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const { publisher, name, version, main, files } = manifest;
if (!publisher || !name || !version || !main) {
  throw new Error(
    `package.json is missing required fields. Need publisher, name, version, main; got: ${JSON.stringify({ publisher, name, version, main })}`,
  );
}

const mainPath = resolve(pkgRoot, main);
if (!existsSync(mainPath)) {
  throw new Error(
    `main "${main}" does not exist at ${mainPath}. Did you run \`yarn build\` first?`,
  );
}

const zip = new JSZip();

// Always include the package manifest at the root of the archive.
zip.file("package.json", readFileSync(manifestPath, "utf8"));

// Plus everything the manifest enumerates in `files`. JSZip preserves the
// relative path from package root, which is exactly what the loader expects
// (it resolves `main` against the archive root after unpacking).
const fileGlobs = Array.isArray(files) && files.length > 0 ? files : ["dist"];
for (const entry of fileGlobs) {
  const entryAbs = resolve(pkgRoot, entry);
  if (!existsSync(entryAbs)) {
    continue;
  }
  if (statSync(entryAbs).isDirectory()) {
    await addDirectory(zip, entryAbs, entry);
  } else if (entry !== "package.json") {
    zip.file(entry, await readFile(entryAbs));
  }
}

const foxeName = `${publisher}.${name}-${version}.foxe`;
const foxePath = join(distDir, foxeName);
await mkdir(distDir, { recursive: true });

await new Promise((resolveStream, rejectStream) => {
  const out = createWriteStream(foxePath);
  zip
    .generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" })
    .pipe(out)
    .on("finish", resolveStream)
    .on("error", rejectStream);
});

console.log(`Wrote ${foxePath}`);

async function addDirectory(zipNode, dirAbs, relPrefix) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    const childAbs = join(dirAbs, entry.name);
    const childRel = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await addDirectory(zipNode, childAbs, childRel);
    } else {
      zipNode.file(childRel, await readFile(childAbs));
    }
  }
}
