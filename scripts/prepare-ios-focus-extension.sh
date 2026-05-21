#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${ROOT_DIR}/native/ios-focus/DailyDisciplineFocusShield"
IOS_DIR="${ROOT_DIR}/ios"
TARGET_DIR="${IOS_DIR}/DailyDisciplineFocusShield"

if [[ ! -d "${IOS_DIR}" ]]; then
  cat >&2 <<'PREBUILD'
The ios/ folder does not exist yet.
Run this when you are ready for native focus work:

  npx expo prebuild --platform ios
  npm run focus:ios:prepare
PREBUILD
  exit 1
fi

mkdir -p "${TARGET_DIR}"
cp "${SOURCE_DIR}"/* "${TARGET_DIR}/"

cat <<DONE
Copied native focus scaffold to:
  ${TARGET_DIR}

Next Xcode steps:
  1. Add FamilyControls, ManagedSettings, and DeviceActivity frameworks.
  2. Enable the Family Controls entitlement in Apple Developer.
  3. Bridge DailyDisciplineFocusShield into the React Native focus screen.
DONE
