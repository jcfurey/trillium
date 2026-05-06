#!/bin/bash

current_dir=$(pwd)
mkdir release

cp registry.json release/registry.json

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
    cp "$PACKAGE" ../release/"$PACKAGE"

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
       ' ../release/registry.json > ../release/registry.tmp \
       && mv ../release/registry.tmp ../release/registry.json

    git reset --hard
    git clean -fd

    cd "$current_dir" || exit 1
done
