#!/bin/bash

extensions_dir=$(pwd)
mkdir release

cp registry.json release/registry.json

# Extensions that are .foxe files in the extensions directory
mapfile -d $'\0' foxe_paths < <(find $(pwd) -name "*.foxe" -print0)
for foxe_file in ${foxe_paths[@]}; do
    cp ${foxe_file} release/.
    unzip ${foxe_file} -d unpacked_extension
    cd unpacked_extension

    PACKAGE_ID="$(jq -r .publisher package.json).$(jq -r .name package.json)"
    PACKAGE_NAME=$(jq -r .name package.json)
    PACKAGE_DESCRIPTION=$(jq -r .description package.json)
    PACKAGE_PUBLISHER=$(jq -r .publisher package.json)
    PACKAGE_HOMEPAGE=$(jq -r .homepage package.json)
    PACKAGE_LICENSE=$(jq -r .license package.json)
    PACKAGE_VERSION=$(jq -r .version package.json)
    PACKAGE_KEYWORDS=$(jq .keywords package.json)

    # Cross-platform SHA256
    if command -v sha256sum >/dev/null 2>&1; then
        PACKAGE_SHA256=$(sha256sum ${foxe_file} | awk '{print $1}')
    else
        PACKAGE_SHA256=$(shasum -a 256 ${foxe_file} | awk '{print $1}')
    fi

    jq --arg id "$PACKAGE_ID" \
       --arg name "$PACKAGE_NAME" \
       --arg description "$PACKAGE_DESCRIPTION" \
       --arg publisher "$PACKAGE_PUBLISHER" \
       --arg homepage "$PACKAGE_HOMEPAGE" \
       --arg license "$PACKAGE_LICENSE" \
       --arg version "$PACKAGE_VERSION" \
       --arg sha256 "$PACKAGE_SHA256" \
       --arg foxe "extensions/$(basename ${foxe_file})" \
       --argjson keywords "$PACKAGE_KEYWORDS" \
       '
       . += [{
         id: $id,
         name: $name,
         description: $description,
         publisher: $publisher,
         homepage: $homepage,
         license: $license,
         version: $version,
         sha256sum: $sha256,
         foxe: $foxe,
         keywords: $keywords
       }]
       ' ${extensions_dir}/release/registry.json > ${extensions_dir}/release/registry.tmp \
       && mv ${extensions_dir}/release/registry.tmp ${extensions_dir}/release/registry.json
    cd ..
    rm -rf unpacked_extension
done;


# Extensions that are submodules and need to be built
git submodule -q foreach pwd | grep extensions | while IFS= read -r i
do
    cd "$i" || exit 1

    # Initialize the array
    mapfile -d $'\0' package_paths < <(find $(pwd) -name "package.json" -print0)

    foxglove_extension_path=''
    for path in ${package_paths[@]}; do
        # Verify the array contents
        printf '%s\n' "$(dirname ${path})"
        is_foxglove_extension=$(jq '(.devDependencies // {}) | keys | any(startswith("@foxglove/extension"))' ${path})

        if [[ "${is_foxglove_extension}" == 'true' ]]; then
            foxglove_extension_path=${path}
        fi
    done

    if [[ "${is_foxglove_extension}" == '' ]]; then
        echo "No foxglove extension found in $i"
        continue
    fi;

    touch CHANGELOG.md
    npm install
    npm run package

    PACKAGE=$(ls | grep .foxe)

    # Move it up into release directory
    cp "$PACKAGE" ${extensions_dir}/release/"$PACKAGE"

    PACKAGE_ID="$(jq -r .publisher package.json).$(jq -r .name package.json)"
    PACKAGE_NAME=$(jq -r .name package.json)
    PACKAGE_DESCRIPTION=$(jq -r .description package.json)
    PACKAGE_PUBLISHER=$(jq -r .publisher package.json)
    PACKAGE_HOMEPAGE=$(jq -r .homepage package.json)
    PACKAGE_LICENSE=$(jq -r .license package.json)
    PACKAGE_VERSION=$(jq -r .version package.json)
    PACKAGE_KEYWORDS=$(jq .keywords package.json)

    # Cross-platform SHA256
    if command -v sha256sum >/dev/null 2>&1; then
        PACKAGE_SHA256=$(sha256sum "$PACKAGE" | awk '{print $1}')
    else
        PACKAGE_SHA256=$(shasum -a 256 "$PACKAGE" | awk '{print $1}')
    fi

    jq --arg id "$PACKAGE_ID" \
       --arg name "$PACKAGE_NAME" \
       --arg description "$PACKAGE_DESCRIPTION" \
       --arg publisher "$PACKAGE_PUBLISHER" \
       --arg homepage "$PACKAGE_HOMEPAGE" \
       --arg license "$PACKAGE_LICENSE" \
       --arg version "$PACKAGE_VERSION" \
       --arg sha256 "$PACKAGE_SHA256" \
       --arg foxe "extensions/$PACKAGE" \
       --argjson keywords "$PACKAGE_KEYWORDS" \
       '
       . += [{
         id: $id,
         name: $name,
         description: $description,
         publisher: $publisher,
         homepage: $homepage,
         license: $license,
         version: $version,
         sha256sum: $sha256,
         foxe: $foxe,
         keywords: $keywords
       }]
       ' ${extensions_dir}/release/registry.json > ${extensions_dir}/release/registry.tmp \
       && mv ${extensions_dir}/release/registry.tmp ${extensions_dir}/release/registry.json

    git reset --hard
    git clean -fd

    cd "$current_dir" || exit 1
done


# Mirror any remaining remote .foxe URLs into release/ and rewrite the
# foxe field to a relative path. Verifies sha256sum from the registry
# before rewriting; leaves the remote URL in place on any failure.
cd "${extensions_dir}/release" || exit 1

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

mapfile -t remote_entries < <(jq -c '.[] | select(.foxe | test("^https?://"))' registry.json)

for entry in "${remote_entries[@]}"; do
    id=$(echo "$entry" | jq -r '.id')
    url=$(echo "$entry" | jq -r '.foxe')
    expected_sha=$(echo "$entry" | jq -r '.sha256sum')
    foxe_name=$(basename "$url")

    if [[ -f "$foxe_name" ]]; then
        actual_sha=$(sha256_of "$foxe_name")
        if [[ "$actual_sha" == "$expected_sha" ]]; then
            echo "[$id] cached, sha matches"
        else
            echo "[$id] cached file sha differs, re-downloading"
            rm -f "$foxe_name"
        fi
    fi

    if [[ ! -f "$foxe_name" ]]; then
        echo "[$id] fetching $url"
        if ! curl -fsSL --retry 3 -o "$foxe_name" "$url"; then
            echo "[$id] download failed, leaving remote URL in registry"
            rm -f "$foxe_name"
            continue
        fi
        actual_sha=$(sha256_of "$foxe_name")
        if [[ "$actual_sha" != "$expected_sha" ]]; then
            echo "[$id] sha mismatch (expected $expected_sha, got $actual_sha), leaving remote URL"
            rm -f "$foxe_name"
            continue
        fi
    fi

    jq --arg id "$id" --arg path "extensions/$foxe_name" \
       '(.[] | select(.id == $id) | .foxe) = $path' \
       registry.json > registry.tmp && mv registry.tmp registry.json
done

cd "$extensions_dir" || exit 1
