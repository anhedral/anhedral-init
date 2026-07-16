#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != 'true' || "${RUNNER_ENVIRONMENT:-}" != 'github-hosted' ]]; then
  echo "Refusing to remove toolchains outside a GitHub-hosted Actions runner"
  exit 1
fi

sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$sdk_root" ]]; then
  echo "ANDROID_HOME or ANDROID_SDK_ROOT is required"
  exit 1
fi

echo "Disk space before Android runner cleanup:"
df -h /

sudo rm -rf -- \
  "$sdk_root/ndk" \
  /opt/hostedtoolcache/CodeQL \
  /usr/local/.ghcup \
  /usr/local/share/powershell \
  /usr/share/dotnet \
  /usr/share/swift

echo "Disk space after Android runner cleanup:"
df -h /

available_kib="$(df --output=avail -k / | tail -n 1 | tr -d ' ')"
minimum_kib=$((20 * 1024 * 1024))
if (( available_kib < minimum_kib )); then
  echo "Android acceptance requires at least 20 GiB free; only $((available_kib / 1024 / 1024)) GiB is available"
  exit 1
fi
