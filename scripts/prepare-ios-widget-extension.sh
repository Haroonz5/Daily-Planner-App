#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${ROOT_DIR}/native/ios-widget/DailyDisciplineWidget"
IOS_DIR="${ROOT_DIR}/ios"
TARGET_DIR="${IOS_DIR}/DailyDisciplineWidget"

if [[ ! -d "${IOS_DIR}" ]]; then
  cat >&2 <<'PREBUILD'
The ios/ folder does not exist yet.
Run this first when you are ready for native widget work:

  npx expo prebuild --platform ios

Then rerun:

  npm run widget:ios:prepare
PREBUILD
  exit 1
fi

mkdir -p "${TARGET_DIR}"
cp "${SOURCE_DIR}"/* "${TARGET_DIR}/"

cat <<DONE
Copied WidgetKit source to:
  ${TARGET_DIR}

Next manual Xcode steps:
  1. Add a Widget Extension target named DailyDisciplineWidget.
  2. Add these copied Swift files to that target.
  3. Enable App Group group.com.haroonzaman.dailydiscipline on app + widget.
DONE
