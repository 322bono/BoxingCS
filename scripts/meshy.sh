#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
runner="/workspace/.tools/meshy/bin/meshy"
if [[ ! -x "$runner" ]]; then
  echo 'Meshy CLI missing. Install meshy-cli@0.8 with prefix /workspace/.tools/meshy.' >&2
  exit 127
fi
export NODE_USE_ENV_PROXY=1
cd "$project_root"
exec "$runner" "$@" --format json --no-update-check
