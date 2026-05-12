// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import JSZip from "jszip";

import Log from "@foxglove/log";
import { ExtensionLoader } from "@foxglove/studio-base/services/ExtensionLoader";
import { ExtensionInfo, ExtensionNamespace } from "@foxglove/studio-base/types/Extensions";

const log = Log.getLogger(__filename);

type BuiltinEntry = {
  info: ExtensionInfo;
  src: string;
};

// Read-only loader for extensions baked into the served bundle. The operator
// stages .foxe files into the build context (trillium/builtins/) and the
// Dockerfile copies them under /extensions/, alongside an index.json listing
// the filenames. Each browser session fetches and registers them on first
// load, so there is no per-browser install step.
export class BuiltinExtensionLoader implements ExtensionLoader {
  public readonly namespace: ExtensionNamespace = "builtin";
  readonly #manifestUrl: string;
  #cache?: Promise<BuiltinEntry[]>;

  public constructor(manifestUrl: string) {
    this.#manifestUrl = manifestUrl;
  }

  public async getExtensions(): Promise<ExtensionInfo[]> {
    return (await this.#load()).map((e) => e.info);
  }

  public async loadExtension(id: string): Promise<string> {
    const entry = (await this.#load()).find((e) => e.info.id === id);
    if (entry == undefined) {
      throw new Error(`Builtin extension ${id} not found`);
    }
    return entry.src;
  }

  public async installExtension(): Promise<ExtensionInfo> {
    throw new Error("Builtin extensions are server-managed; rebuild the image to add or update");
  }

  public async uninstallExtension(): Promise<void> {
    throw new Error("Builtin extensions are server-managed; rebuild the image to remove");
  }

  #load(): Promise<BuiltinEntry[]> {
    return (this.#cache ??= this.#fetchAll());
  }

  async #fetchAll(): Promise<BuiltinEntry[]> {
    let manifest: string[];
    try {
      const res = await fetch(this.#manifestUrl);
      if (!res.ok) {
        log.info(`No builtin extension manifest at ${this.#manifestUrl} (${res.status})`);
        return [];
      }
      manifest = (await res.json()) as string[];
    } catch (err) {
      log.warn("Failed to fetch builtin extension manifest:", err);
      return [];
    }

    const baseDir = this.#manifestUrl.replace(/\/[^/]*$/, "");
    const entries = await Promise.all(
      manifest.map(async (filename): Promise<BuiltinEntry | undefined> => {
        try {
          const url = `${baseDir}/${filename}`;
          const res = await fetch(url);
          if (!res.ok) {
            log.warn(`Skipping builtin ${filename}: HTTP ${res.status}`);
            return undefined;
          }
          const buf = new Uint8Array(await res.arrayBuffer());
          const zip = await new JSZip().loadAsync(buf);

          const pkgText = await zip.file("package.json")?.async("string");
          if (pkgText == undefined) {
            log.warn(`Skipping builtin ${filename}: missing package.json`);
            return undefined;
          }
          const src = await zip.file("dist/extension.js")?.async("string");
          if (src == undefined) {
            log.warn(`Skipping builtin ${filename}: missing dist/extension.js`);
            return undefined;
          }

          const pkg = JSON.parse(pkgText) as Partial<ExtensionInfo>;
          if (pkg.name == undefined || pkg.publisher == undefined) {
            log.warn(`Skipping builtin ${filename}: package.json missing name or publisher`);
            return undefined;
          }
          const normalizedPublisher = pkg.publisher.replace(/[^A-Za-z0-9_\s]+/g, "");
          const info: ExtensionInfo = {
            description: pkg.description ?? "",
            displayName: pkg.displayName ?? pkg.name,
            homepage: pkg.homepage ?? "",
            keywords: pkg.keywords ?? [],
            license: pkg.license ?? "",
            name: pkg.name.toLowerCase(),
            publisher: pkg.publisher,
            version: pkg.version ?? "0.0.0",
            id: `builtin.${normalizedPublisher}.${pkg.name.toLowerCase()}`,
            namespace: "builtin",
            qualifiedName: ["builtin", normalizedPublisher, pkg.name.toLowerCase()].join(":"),
          };
          return { info, src };
        } catch (err) {
          log.warn(`Failed to load builtin ${filename}:`, err);
          return undefined;
        }
      }),
    );

    const loaded = entries.filter((e): e is BuiltinEntry => e != undefined);
    log.info(`Loaded ${loaded.length} builtin extension(s)`);
    return loaded;
  }
}
