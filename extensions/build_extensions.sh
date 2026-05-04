#!/usr/bin/env bash

mapfile -t extensions < <(git submodule -q foreach pwd | grep extensions)
current_dir=$(pwd)
mkdir release
rm -rf release
cp registry.json release/registry.json
for i in "${extensions[@]}"
do
    cd $i
    touch CHANGELOG.md
    npm install
    npm run package

    PACKAGE=$(ls | grep .foxe)
    # # Move it up into extensions directory
    
    cp $PACKAGE ../release/$PACKAGE

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

    jq --arg id "$(jq -r .publisher package.json).$(jq -r .name package.json)" \
    --arg name "$(jq -r .name package.json)" \
    --arg description "$(jq -r .description package.json)" \
    --arg publisher "$(jq -r .publisher package.json)" \
    --arg homepage "$(jq -r .homepage package.json)" \
    --arg license "$(jq -r .license package.json)" \
    --arg version "$(jq -r .version package.json)" \
    --arg sha256 "$PACKAGE_SHA256" \
    --arg foxe "$PACKAGE" \
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
    ' ../release/registry.json > ../release/registry.tmp && mv ../release/registry.tmp ../release/registry.json

    git reset --hard
    git clean -fd
done