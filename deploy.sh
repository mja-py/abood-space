#!/usr/bin/env bash
# Publish the game to the gh-pages branch (the same thing .github/workflows/pages.yml did in the original repo).
# Stamps the commit id into every __BUILD__ (cache names and asset URLs) so players always get the new version.
# Usage: ./deploy.sh        (from a clean, committed main)
set -euo pipefail
cd "$(dirname "$0")"
if [ -n "$(git status --porcelain)" ]; then echo "commit or stash your changes first"; exit 1; fi
V="$(git rev-parse --short=8 HEAD)"
SITE="$(mktemp -d)"
cp -r index.html sw.js manifest.webmanifest .nojekyll css js assets "$SITE/"
if [ "$(uname)" = "Darwin" ]; then SED=(sed -i ''); else SED=(sed -i); fi
find "$SITE" -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.webmanifest' \) -exec "${SED[@]}" "s/__BUILD__/$V/g" {} +
if grep -rl __BUILD__ "$SITE"; then echo "unstamped files above"; exit 1; fi
WT="$(mktemp -d)"
git worktree add --detach "$WT" >/dev/null
( cd "$WT" && git checkout --orphan gh-pages >/dev/null 2>&1 && git rm -rfq . && cp -r "$SITE"/. . && git add -A && git -c user.name="deploy" -c user.email="deploy@local" commit -qm "Build $V" && git push -f origin gh-pages )
git worktree remove --force "$WT"
rm -rf "$SITE"
echo "published build $V to gh-pages"
