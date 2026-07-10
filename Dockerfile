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

# Assemble the full extension bundle — marketplace registry (with remote .foxe
# mirrored offline and sha-verified), fleet-baked builtins, and builtin/index.json
# — via the single source-of-truth script shared with .gitlab-ci.yml and the
# GitHub Pages deploy. See extensions/build_extensions.sh for the output layout.
RUN apt-get update && apt-get install -y --no-install-recommends jq \
    && rm -rf /var/lib/apt/lists/*
RUN bash /src/extensions/build_extensions.sh

# Release stage
FROM caddy:2.5.2-alpine
WORKDIR /src
COPY --from=build /src/web/.webpack ./

# Extension bundle assembled by extensions/build_extensions.sh in the build
# stage. Served under /extensions/ so the app resolves:
#   /extensions/registry.json       marketplace catalog (ExtensionMarketplaceProvider)
#   /extensions/<name>.foxe         marketplace blobs (mirrored offline)
#   /extensions/builtin/index.json  fleet-baked builtins (BuiltinExtensionLoader)
#   /extensions/builtin/<name>.foxe
COPY --from=build /src/extensions/release/ /src/extensions/

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
