#!/bin/bash
#
# Single source of truth for assembling the Trillium extension bundle.
#
# Every deploy path calls THIS script and copies its output, so the marketplace,
# the offline-mirrored blobs, and the fleet-baked builtins are identical whether
# you run the container, the GitLab Pages bundle, or the GitHub Pages site:
#
#   - Dockerfile:          RUN bash /src/extensions/build_extensions.sh
#                          COPY --from=build /src/extensions/release/ /src/extensions/
#   - .gitlab-ci.yml:      bash build_extensions.sh && cp -r release ../web/.webpack/extensions
#   - web-github-pages.yml: bash extensions/build_extensions.sh
#                          cp -r extensions/release web/.webpack/extensions
#
# Output layout (served at /extensions/):
#
#   release/registry.json         Marketplace catalog. ExtensionMarketplaceProvider
#                                 fetches "extensions/registry.json"; the Install
#                                 button downloads the entry's .foxe. Remote-URL
#                                 entries are mirrored locally (below) and rewritten
#                                 to relative paths; already-relative entries are
#                                 left untouched.
#   release/<name>.foxe           Marketplace .foxe blobs, each served at the
#                                 relative path its registry entry points to.
#   release/builtin/<name>.foxe   Fleet-baked builtins. BuiltinExtensionLoader
#   release/builtin/index.json    fetches "/extensions/builtin/index.json" and
#                                 auto-registers every listed .foxe — no per-user
#                                 install, no marketplace entry.
#
# Classification of in-tree extensions (extensions/<dir>/ with a `package` script,
# including submodules like erdc_joystick):
#
#   marketplace  iff registry.json has an entry whose foxe == "extensions/<dir>.foxe"
#   builtin      otherwise
#
# so a directory becomes a marketplace extension purely by being named in the
# registry (e.g. erdc_joystick <-> "extensions/erdc_joystick.foxe"); everything
# else that builds is baked in as a builtin. Prebuilt .foxe not built from
# source: a loose blob committed in extensions/ (e.g. cloudini-foxglove-*.foxe)
# ships as a marketplace extension via its registry entry, while anything under
# builtins/ is baked in as a builtin.
#
# Requires: bash, node/npm, jq, curl, sha256sum (shasum accepted as a fallback).

set -euo pipefail
shopt -s nullglob

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extensions_dir="$script_dir"
repo_root="$(cd "$extensions_dir/.." && pwd)"
builtins_dir="$repo_root/builtins"
release_dir="$extensions_dir/release"
builtin_out="$release_dir/builtin"

rm -rf "$release_dir"
mkdir -p "$release_dir" "$builtin_out"

# Seed the catalog from the committed registry; remote URLs get rewritten to
# local paths in the mirror step below.
cp "$extensions_dir/registry.json" "$release_dir/registry.json"

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

# True if the registry serves <basename> as a relative marketplace entry.
is_marketplace_foxe() {
    jq -e --arg f "extensions/$1" 'any(.[]; .foxe == $f)' \
        "$release_dir/registry.json" >/dev/null
}

# --- 1. Build every in-tree extension, classify builtin vs marketplace ---------
for d in "$extensions_dir"/*/; do
    name="$(basename "$d")"
    if [ "$name" = "release" ] || [ "$name" = "node_modules" ]; then continue; fi
    [ -f "${d}package.json" ] || continue

    # Only build extensions that expose a `package` script (the
    # create-foxglove-extension toolchain). Submodules or dirs without it
    # (docs, helpers) are skipped. An uninitialized submodule (empty dir) has no
    # package.json and is skipped here too.
    if ! node -e "process.exit(require('${d}package.json').scripts?.package?0:1)" 2>/dev/null; then
        echo "==> Skipping $name (no \`package\` script)"
        continue
    fi

    echo "==> Building extension: $name"
    # create-foxglove-extension refuses to package without a CHANGELOG.md.
    [ -f "${d}CHANGELOG.md" ] || echo "# $name" > "${d}CHANGELOG.md"
    # Drop any stale .foxe (a developer's prior local build riding in via the
    # Docker build context) so exactly one archive exists after the build.
    rm -f "${d}"*.foxe
    ( cd "$d" && npm install --no-audit --no-fund --loglevel=warn && npm run package ) \
        || { echo "==> FAILED building $name" >&2; exit 1; }

    built=( "${d}"*.foxe )
    if [ "${#built[@]}" -eq 0 ]; then
        echo "==> ERROR: $name produced no .foxe" >&2
        exit 1
    fi
    foxe="${built[0]}"

    # Marketplace iff the registry serves this directory at extensions/<name>.foxe;
    # otherwise bake it in as a builtin.
    if is_marketplace_foxe "$name.foxe"; then
        echo "    -> marketplace: extensions/$name.foxe"
        cp "$foxe" "$release_dir/$name.foxe"
    else
        echo "    -> builtin: $(basename "$foxe")"
        cp "$foxe" "$builtin_out/$(basename "$foxe")"
    fi
done

# --- 2. Stage prebuilt builtin .foxe drops ------------------------------------
# .foxe under builtins/ are fleet-baked builtins (see builtins/README.md). Loose
# .foxe committed in extensions/ (e.g. cloudini) are marketplace extensions
# instead — they carry a registry entry and are staged through in step 5.
stage_builtin() {
    echo "==> Staging prebuilt builtin: $(basename "$1")"
    cp "$1" "$builtin_out/$(basename "$1")"
}
for foxe in "$builtins_dir"/*.foxe; do
    stage_builtin "$foxe"
done

# --- 3. Generate builtin/index.json from whatever actually landed --------------
(
    cd "$builtin_out"
    printf '[' > index.json
    first=1
    for f in *.foxe; do
        if [ "$first" -eq 1 ]; then first=0; else printf ',' >> index.json; fi
        printf '"%s"' "$f" >> index.json
    done
    printf ']' >> index.json
)
echo "==> builtin/index.json: $(cat "$builtin_out/index.json")"

# --- 4. Mirror remote-URL marketplace entries into release/ --------------------
# Fetch each remote .foxe, verify its sha256 against the registry, and rewrite
# the entry to a relative path so the marketplace serves fully offline. On any
# failure the remote URL is left in place, so behavior degrades to a live fetch
# instead of a broken entry.
cd "$release_dir"
mapfile -t remote_entries < <(jq -c '.[] | select(.foxe | test("^https?://"))' registry.json)
for entry in "${remote_entries[@]}"; do
    id="$(jq -r '.id' <<<"$entry")"
    url="$(jq -r '.foxe' <<<"$entry")"
    expected_sha="$(jq -r '.sha256sum' <<<"$entry")"
    foxe_name="$(basename "$url")"

    if [ -f "$foxe_name" ] && [ "$(sha256_of "$foxe_name")" != "$expected_sha" ]; then
        echo "[$id] cached file sha differs, re-downloading"
        rm -f "$foxe_name"
    fi

    if [ ! -f "$foxe_name" ]; then
        echo "[$id] fetching $url"
        if ! curl -fsSL --retry 3 -o "$foxe_name" "$url"; then
            echo "[$id] download failed, leaving remote URL in registry"
            rm -f "$foxe_name"
            continue
        fi
        if [ "$(sha256_of "$foxe_name")" != "$expected_sha" ]; then
            echo "[$id] sha mismatch (expected $expected_sha), leaving remote URL"
            rm -f "$foxe_name"
            continue
        fi
    fi

    jq --arg id "$id" --arg path "extensions/$foxe_name" \
       '(.[] | select(.id == $id) | .foxe) = $path' \
       registry.json > registry.tmp && mv registry.tmp registry.json
done

# --- 5. Validate: every relative marketplace entry must have a local blob ------
# Catches the class of bug this script exists to prevent: a registry entry
# advertising extensions/<x>.foxe with no file behind it (a dead Install button).
# A committed .foxe alongside the registry (a prebuilt marketplace drop) is
# copied through; anything still missing is a loud warning (e.g. an extension
# whose submodule wasn't checked out on this runner).
missing=0
while read -r rel; do
    b="$(basename "$rel")"
    if [ ! -f "$release_dir/$b" ]; then
        if [ -f "$extensions_dir/$b" ]; then
            cp "$extensions_dir/$b" "$release_dir/$b"
        else
            echo "WARNING: marketplace entry '$rel' has no staged .foxe (Install will 404)" >&2
            missing=1
        fi
    fi
done < <(jq -r '.[] | select(.foxe | test("^https?://") | not) | .foxe' "$release_dir/registry.json")

echo "==> Extension bundle assembled in $release_dir (missing marketplace blobs: $missing)"
