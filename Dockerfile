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

# Build every in-tree extension under extensions/ into a .foxe.
# joyteleop is a yarn workspace (depends on @foxglove/studio via
# workspace:*) so it's driven by yarn. The others are standalone npm
# packages with their own lockfiles — installed in isolation so their
# (often divergent) dep versions don't have to reconcile with the
# trillium root.
RUN yarn workspace trillium-joyteleop-extension build && \
    yarn workspace trillium-joyteleop-extension package

RUN for d in /src/extensions/*/; do \
        name=$(basename "$d"); \
        [ "$name" = "joyteleop" ] && continue; \
        [ -f "$d/package.json" ] || continue; \
        node -e "process.exit(require('$d/package.json').scripts?.package?0:1)" \
            2>/dev/null || { \
            echo "==> Skipping $name (no \`package\` script)"; continue; }; \
        echo "==> Building extension: $name"; \
        (cd "$d" && npm install --no-audit --no-fund --loglevel=warn && \
         npm run package); \
    done

# Stage every produced .foxe (some land at the package root via
# foxglove-extension package, others under dist/ via custom packagers)
# into a single dir so the runtime stage can copy them in one shot.
RUN mkdir -p /src/extensions/_built && \
    find /src/extensions -mindepth 2 -name '*.foxe' \
        -not -path '*/node_modules/*' \
        -not -path '*/_built/*' \
        -exec cp -v {} /src/extensions/_built/ \;

# Release stage
FROM caddy:2.5.2-alpine
WORKDIR /src
COPY --from=build /src/web/.webpack ./

# Marketplace extensions (per-user opt-in via the Add Extension dialog).
# Backed by extensions/registry.json. IdbExtensionLoader fetches the
# registry, downloads the chosen .foxe, and stores it in the browser's
# IndexedDB. Each user picks what they want.
COPY extensions/ extensions/
COPY extensions/registry.json /registry.json

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
