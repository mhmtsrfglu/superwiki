#!/usr/bin/env bash
# Installs the Superwiki skills for one or more coding agents by linking them into the folder each agent reads.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh [options] <target>...

Targets:
  claude     ~/.claude/skills    Claude Code
  codex      ~/.agents/skills    Codex CLI
  copilot    ~/.copilot/skills   GitHub Copilot CLI
  global     ~/.agents/skills    the shared folder: Codex, Copilot CLI and other agents that read it
                                 (Claude Code does not)
  all        claude + codex + copilot

Options:
  --project <dir>  install into that project instead of your home folder
                   (.claude/skills for claude, .agents/skills for the others)
  --copy           copy the skills instead of linking them (updates then need a re-install)
  --force          replace a skill folder that is not a link made by this script
  --uninstall      remove the Superwiki skills from the given targets
  -h, --help       show this help

Environment:
  SUPERWIKI_HOME          where this repository is (default: the folder this script is in)

Examples:
  ./install.sh claude
  ./install.sh claude codex
  ./install.sh --project ~/code/my-app all
  ./install.sh --uninstall copilot
EOF
}

SUPERWIKI_HOME="${SUPERWIKI_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
project=""
mode="link"
force=0
uninstall=0
targets=""

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --project) [ $# -ge 2 ] || { echo "--project needs a folder" >&2; exit 2; }; project="$2"; shift ;;
    --copy) mode="copy" ;;
    --force) force=1 ;;
    --uninstall) uninstall=1 ;;
    claude|codex|copilot|global) targets="$targets $1" ;;
    all) targets="$targets claude codex copilot" ;;
    *) echo "unknown argument: $1" >&2; echo >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[ -n "$targets" ] || { usage >&2; exit 2; }
[ -d "$SUPERWIKI_HOME/skills" ] || { echo "no skills/ folder in $SUPERWIKI_HOME; set SUPERWIKI_HOME to the Superwiki repository" >&2; exit 1; }
if [ -n "$project" ]; then
  [ -d "$project" ] || { echo "no such project folder: $project" >&2; exit 1; }
  project="$(cd "$project" && pwd)"
fi

# The folder an agent reads skills from.
dest_for() {
  if [ -n "$project" ]; then
    case "$1" in
      claude) echo "$project/.claude/skills" ;;
      *) echo "$project/.agents/skills" ;;
    esac
  else
    case "$1" in
      claude) echo "$HOME/.claude/skills" ;;
      copilot) echo "$HOME/.copilot/skills" ;;
      *) echo "$HOME/.agents/skills" ;;
    esac
  fi
}

# True when the path is a link into this repository, or (for copies) carries our marker file.
is_ours() {
  if [ -L "$1" ]; then
    case "$(readlink "$1")" in "$SUPERWIKI_HOME"/skills/*) return 0 ;; esac
    # A link that goes through another folder we installed into (for example ~/.claude -> ~/.agents).
    [ "$(cd "$1" 2>/dev/null && pwd -P)" = "$(cd "$SUPERWIKI_HOME/skills/$(basename "$1")" && pwd -P)" ] && return 0
    return 1
  fi
  [ -f "$1/.sw-installed" ]
}

done_dests=""
status=0
for target in $targets; do
  dest="$(dest_for "$target")"
  case " $done_dests " in *" $dest "*) continue ;; esac   # codex and global share a folder
  done_dests="$done_dests $dest"
  echo "$target: $dest"

  if [ "$uninstall" -eq 1 ]; then
    for skill in "$SUPERWIKI_HOME"/skills/sw-*; do
      name="$(basename "$skill")"
      path="$dest/$name"
      if [ ! -e "$path" ] && [ ! -L "$path" ]; then continue; fi
      if is_ours "$path" || [ "$force" -eq 1 ]; then
        rm -rf "${path:?}"
        echo "  removed  $name"
      else
        echo "  kept     $name (not installed by this script; --force removes it)"
      fi
    done
    continue
  fi

  mkdir -p "$dest"
  for skill in "$SUPERWIKI_HOME"/skills/sw-*; do
    name="$(basename "$skill")"
    path="$dest/$name"
    if [ -e "$path" ] || [ -L "$path" ]; then
      if is_ours "$path" || [ "$force" -eq 1 ]; then
        rm -rf "${path:?}"
      else
        echo "  skipped  $name (a different $name is already there; --force replaces it)"
        status=1
        continue
      fi
    fi
    if [ "$mode" = "copy" ]; then
      cp -R "$skill" "$path"
      : > "$path/.sw-installed"
      echo "  copied   $name"
    else
      ln -s "$skill" "$path"
      echo "  linked   $name"
    fi
  done
done

if [ "$uninstall" -eq 0 ]; then
  if command -v node >/dev/null 2>&1; then
    major="$(node -p 'process.versions.node.split(".")[0]')"
    [ "$major" -ge 18 ] || echo "warning: Node $major found; the Superwiki scripts need Node 18 or newer" >&2
  else
    echo "warning: node not found; the Superwiki scripts need Node 18 or newer" >&2
  fi
  echo
  echo "Start a new agent session, then run sw-init in a project."
fi
exit "$status"
