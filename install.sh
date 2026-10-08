#!/usr/bin/env bash
# Installs Superwiki from this checkout: each skill folder, sw-<name>, linked into the folder each
# agent reads skills from, Claude Code's included, so `git pull` updates every agent.
# A thin wrapper around bin/superwiki.mjs, for people who cloned the repository.
#
#   ./install.sh claude                 link the skills for Claude Code (~/.claude/skills)
#   ./install.sh codex                  link the skills for Codex (~/.agents/skills)
#   ./install.sh --copy all             copy instead of link
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
