# Build stage
FROM node:22 AS build
WORKDIR /src
COPY . ./

RUN corepack enable

# This stage only builds the web bundle, but yarn install still walks every
# workspace (incl. studio-desktop) and runs Electron's postinstall, which
# downloads a ~150MB prebuilt from github.com/electron/electron. CI/network
# environments that don't allow that download fail the install with
# YN0009 — Electron isn't actually needed here, so skip the download.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

RUN yarn install --immutable

RUN yarn run web:build:prod

# Build every extension under extensions/ into a .foxe, each in isolation: they
# are standalone npm packages with their own lockfiles, so divergent dep versions
# don't have to reconcile with the trillium root. joyteleop is one of these now
# (self-contained, @foxglove/extension + create-foxglove-extension toolchain).
RUN for d in /src/extensions/*/; do \
        name=$(basename "$d"); \
        [ -f "$d/package.json" ] || continue; \
        node -e "process.exit(require('$d/package.json').scripts?.package?0:1)" \
            2>/dev/null || { \
            echo "==> Skipping $name (no \`package\` script)"; continue; }; \
        echo "==> Building extension: $name"; \
        (cd "$d" && npm install --no-audit --no-fund --loglevel=warn && \
         npm run package); \
    done

# joyteleop ships as a marketplace extension (opt-in via the Install button
# in Settings->Extensions), not a fleet-baked builtin. Stage its .foxe into the _mirrored overlay
# as joyteleop.foxe so it serves at the root as extensions/joyteleop.foxe,
# matching the relative "foxe": "extensions/joyteleop.foxe" entry in registry.json.
# foxglove-extension package writes the .foxe to the package root.
RUN mkdir -p /src/extensions/_mirrored && \
    cp /src/extensions/joyteleop/*.foxe /src/extensions/_mirrored/joyteleop.foxe

# Stage every OTHER produced .foxe into _built for the runtime builtin bake. The
# sweep skips _mirrored (marketplace-served) and the joyteleop dir (marketplace-
# only) so joyteleop is never double-registered as a builtin.
RUN mkdir -p /src/extensions/_built && \
    find /src/extensions -mindepth 2 -name '*.foxe' \
        -not -path '*/node_modules/*' \
        -not -path '*/_built/*' \
        -not -path '*/_mirrored/*' \
        -not -path '*/joyteleop/*' \
        -exec cp -v {} /src/extensions/_built/ \;

# Mirror every remote-URL .foxe entry in the marketplace registry into
# _mirrored/, then rewrite the foxe field to a relative path. Lets the
# runtime stage serve the marketplace fully offline — no install-time
# fetches to raw.githubusercontent.com. Each download is verified against
# the sha256sum already baked into registry.json; on any failure we leave
# the remote URL in place so behavior degrades to today's instead of
# poisoning the registry.
RUN apt-get update && apt-get install -y --no-install-recommends jq && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /src/extensions/_mirrored && \
    cp /src/extensions/registry.json /src/extensions/_mirrored/registry.json && \
    cd /src/extensions/_mirrored && \
    jq -c '.[] | select(.foxe | test("^https?://"))' registry.json > /tmp/remote_entries.jsonl && \
    while read -r entry; do \
        id=$(echo "$entry" | jq -r '.id'); \
        url=$(echo "$entry" | jq -r '.foxe'); \
        expected=$(echo "$entry" | jq -r '.sha256sum'); \
        foxe_name=$(basename "$url"); \
        echo "[$id] fetching $url"; \
        if ! curl -fsSL --retry 3 -o "$foxe_name" "$url"; then \
            echo "[$id] download failed, leaving remote URL in registry"; \
            rm -f "$foxe_name"; \
            continue; \
        fi; \
        actual=$(sha256sum "$foxe_name" | awk '{print $1}'); \
        if [ "$actual" != "$expected" ]; then \
            echo "[$id] sha mismatch (expected $expected, got $actual), leaving remote URL"; \
            rm -f "$foxe_name"; \
            continue; \
        fi; \
        jq --arg id "$id" --arg path "extensions/$foxe_name" \
           '(.[] | select(.id == $id) | .foxe) = $path' \
           registry.json > registry.tmp && mv registry.tmp registry.json; \
    done < /tmp/remote_entries.jsonl && \
    rm -f /tmp/remote_entries.jsonl

# Release stage
FROM caddy:2.5.2-alpine
WORKDIR /src
COPY --from=build /src/web/.webpack ./

# Marketplace extensions (per-user opt-in via Settings->Extensions).
# Backed by extensions/registry.json: the app fetches the registry
# (ExtensionMarketplaceProvider), the Install button downloads the chosen
# .foxe, and IdbExtensionLoader stores it in the browser's IndexedDB.
# Each user picks what they want.
COPY extensions/ extensions/
COPY extensions/registry.json /registry.json

# Overlay the mirrored .foxe blobs + rewritten registry.json from the
# build stage. Files land at /src/extensions/<name>.foxe so the relative
# extensions/<name>.foxe paths in the rewritten registry resolve locally.
COPY --from=build /src/extensions/_mirrored/ /src/extensions/

# Built-in Foxglove extensions (fleet-baked via BuiltinExtensionLoader).
# Operator stages .foxe files + an index.json under trillium/builtins/;
# the loader fetches /extensions/builtin/index.json on every page load
# and auto-registers each .foxe with no per-user install. Served at
# /extensions/builtin/ so it doesn't collide with the marketplace
# layout above. The directory is always present (gitkept) so this COPY
# never fails; if no .foxe files were staged, only the README/.gitignore
# are copied and the loader logs an empty manifest miss without breaking
# anything.
COPY builtins/ /src/extensions/builtin/
RUN rm -f /src/extensions/builtin/.gitignore /src/extensions/builtin/README.md

# In-tree extensions built in the previous stage. The build stage's
# find step gathered every produced .foxe into _built/ so this is one
# COPY regardless of how many extensions ship. Drop a new folder under
# trillium/extensions/ with a package.json + `package` script and it'll
# get picked up automatically — no Dockerfile edit required.
COPY --from=build /src/extensions/_built/ /src/extensions/builtin/

# Regenerate index.json from whatever .foxe files actually landed in
# /src/extensions/builtin/. BuiltinExtensionLoader fetches this manifest
# on every page load and registers each listed file. Doing the listing
# at image-build time keeps the manifest in sync with the directory
# contents — no human bookkeeping needed when a .foxe is added or removed.
RUN cd /src/extensions/builtin && \
    printf '[' > index.json && \
    first=1 && for f in *.foxe; do \
        if [ "$f" = "*.foxe" ]; then continue; fi; \
        if [ "$first" -eq 1 ]; then first=0; else printf ',' >> index.json; fi; \
        printf '"%s"' "$f" >> index.json; \
    done && \
    printf ']' >> index.json && \
    echo "Built /src/extensions/builtin/index.json:" && cat index.json && echo

EXPOSE 8080

COPY <<EOF /etc/caddy/Caddyfile
:8080 {
	root * /src
	file_server
	header {
		Cross-Origin-Opener-Policy "same-origin"
		Cross-Origin-Embedder-Policy "credentialless"
		X-Frame-Options "DENY"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "origin"
	}
}
EOF

COPY <<EOF /entrypoint.sh
# Optionally override the default layout with one provided via bind mount
mkdir -p /trillium
touch /trillium/default-layout.json
index_html=\$(cat index.html)
replace_pattern='/*FOXGLOVE_STUDIO_DEFAULT_LAYOUT_PLACEHOLDER*/'
replace_value=\$(cat /trillium/default-layout.json)
echo "\${index_html/"\$replace_pattern"/\$replace_value}" > index.html

# Continue executing the CMD
exec "\$@"
EOF

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
