#!/usr/bin/env bash
# Installs Superwiki from this checkout: the plugin for Claude Code, with this checkout as its
# marketplace, and the skills linked into the folder each other agent reads.
# A thin wrapper around bin/superwiki.mjs, for people who cloned the repository.
#
#   ./install.sh claude                 the plugin sw@superwiki for Claude Code, from this checkout
#   ./install.sh codex                  link the skills for Codex, as sw-<name>
#   ./install.sh --copy all             copy instead of link (the plugin is installed either way)
#   ./install.sh --uninstall codex      remove them
#   ./install.sh --help
set -euo pipefail

SUPERWIKI_HOME="${SUPERWIKI_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
command -v node >/dev/null 2>&1 || { echo "node not found; Superwiki needs Node 18 or newer" >&2; exit 1; }
[ -f "$SUPERWIKI_HOME/bin/superwiki.mjs" ] || { echo "no bin/superwiki.mjs in $SUPERWIKI_HOME; set SUPERWIKI_HOME to the Superwiki repository" >&2; exit 1; }

command="install"
link="--link"
args=()
for a in "$@"; do
  case "$a" in
    --uninstall) command="uninstall"; link="" ;;
    --copy) link="" ;;
    *) args+=("$a") ;;
  esac
done

# ${args[@]+...} keeps bash 3.2 (macOS) from failing on an empty array under `set -u`.
exec node "$SUPERWIKI_HOME/bin/superwiki.mjs" "$command" ${link:+"$link"} ${args[@]+"${args[@]}"}
