#!/bin/bash
set -e

PACKAGE_JSON="frontend/modal-run/package.json"
CURRENT=$(grep '"version"' $PACKAGE_JSON | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: ./deploy.sh <version> <message>"
  echo "Current version: $CURRENT"
  exit 1
fi

VERSION=$1
MESSAGE=$2

sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$VERSION\"/" $PACKAGE_JSON
git add .
git commit -m "$MESSAGE"
git tag "v$VERSION"
git push origin main
git push origin "v$VERSION"

echo "Deployed v$VERSION"
