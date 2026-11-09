#!/usr/bin/env bash
# Decide whether a repository is the owner's or foreign, by the rule and with the
# own-remotes file and FORGEJO_TOKEN that SKILL.md, step 2, describes.
# Usage: ownership.sh <path inside the checkout>
# Prints "own: <reason>" or "foreign: <reason>" and exits 0. Every other outcome
# exits 2 with the reason on stderr.
set -euo pipefail
trap 'echo "undecided: a command failed at line $LINENO" >&2; exit 2' ERR
trap 'echo "undecided: stopped by a signal" >&2; exit 2' HUP INT TERM
errors=$(mktemp)
# Any other way out (an unset variable) still ends in exit 2.
on_exit() {
  local rc=$?
  rm -f "$errors"
  if ((rc != 0 && rc != 2)); then
    echo "undecided: stopped with status $rc" >&2
    exit 2
  fi
}
trap on_exit EXIT

GITHUB_HOST=github.com
GITHUB_OWNER=danielcopper

undecided() {
  echo "undecided: $*" >&2
  exit 2
}

# verdict <who answered> <"fork mirror owner" as answered>: own only for a
# repository that is neither a fork nor a mirror and still has the expected owner.
verdict() {
  case "$2" in
    "false false $owner") echo "own: origin $norm" ;;
    "true false $owner" | "true true $owner") echo "foreign: origin $norm is a fork" ;;
    "false true $owner") echo "foreign: origin $norm is a mirror" ;;
    *) undecided "origin $norm, $1 answered \"$2\" for its fork and mirror flags and owner" ;;
  esac
}

(($# == 1)) || undecided "usage: ownership.sh <path inside the checkout>"
checkout=$1
git -C "$checkout" rev-parse --git-dir >/dev/null 2>&1 \
  || undecided "$checkout is not a directory inside a git repository"

remotes=$(git -C "$checkout" remote)
if [[ -z $remotes ]]; then
  echo "own: no remote yet (assumed the owner's)"
  exit 0
fi
grep -qx origin <<<"$remotes" \
  || undecided "remotes ($(tr '\n' ' ' <<<"$remotes")) but no origin"

url=$(git -C "$checkout" remote get-url origin)
# host/path form: drop the scheme, the user part, a port, and the scp-style colon.
norm=$(sed -E 's#^[a-z+]+://##; s#^[^@/]+@##; s#^([^/:]+):[0-9]+/#\1/#; s#^([^/:]+):#\1/#' <<<"$url")
case "/$norm/" in
  */../* | */./*) undecided "origin $norm holds a dot segment" ;;
esac
host=${norm%%/*}
repo_path=${norm#*/}
repo_path=${repo_path%.git}
[[ $repo_path =~ ^[^/]+/[^/]+$ ]] \
  || undecided "origin $norm does not end in an owner/repository pair"
owner=${repo_path%%/*}
name=${repo_path#*/}

if [[ $host == "$GITHUB_HOST" && $owner == "$GITHUB_OWNER" ]]; then
  answer=$(timeout 30 gh repo view "$GITHUB_HOST/$repo_path" --json isFork,isMirror,owner \
    --jq '"\(.isFork) \(.isMirror) \(.owner.login)"' 2>"$errors") || {
    (($? == 124)) && undecided "origin $norm, and gh did not answer within 30 s"
    undecided "origin $norm, and gh could not say whether it is a fork or a mirror: $(<"$errors")"
  }
  verdict gh "$answer"
  exit 0
fi
not_github="origin $norm is not under $GITHUB_HOST/$GITHUB_OWNER/"

if [[ -n ${SETUP_REPO_OWN_REMOTES:-} ]]; then
  own_remotes_file=$SETUP_REPO_OWN_REMOTES
elif [[ -n ${HOME:-} ]]; then
  own_remotes_file=$HOME/.config/setup-repo/own-remotes
else
  undecided "$not_github, and neither SETUP_REPO_OWN_REMOTES nor HOME names an own-remotes file"
fi
if [[ ! -e $own_remotes_file ]]; then
  echo "foreign: $not_github, and there is no own-remotes file at $own_remotes_file"
  exit 0
fi
[[ -f $own_remotes_file && -r $own_remotes_file ]] \
  || undecided "the own-remotes file $own_remotes_file is not a readable file"

listed=false
line_no=0
while IFS= read -r line || [[ -n $line ]]; do
  line_no=$((line_no + 1))
  [[ -z $line || $line == \#* ]] && continue
  [[ $line =~ ^[A-Za-z0-9.-]+/[A-Za-z0-9._-]+/$ ]] \
    || undecided "$own_remotes_file:$line_no is not exactly host/owner/: $(printf '%q' "$line")"
  [[ $line == "$host/$owner/" ]] && listed=true
done <"$own_remotes_file"
if [[ $listed == false ]]; then
  echo "foreign: $not_github, and no line of $own_remotes_file names $host/$owner/"
  exit 0
fi

# The forge's API answers on an https origin's own port. An http origin on its
# own port gives no verdict; any other origin (ssh, or http or https without a
# port) uses the default https port.
api_host=$host
if [[ $url =~ ^https://([^@/]+@)?[^/:]+:([0-9]+)/ ]]; then
  api_host=$host:${BASH_REMATCH[2]}
elif [[ $url =~ ^http://([^@/]+@)?[^/:]+:[0-9]+/ ]]; then
  undecided "origin $norm is served over http on its own port, so the forge's https API address is not known"
fi

# From here on the token is in play: no trace, and it goes to curl through
# stdin, with any curlrc ignored (-q), so it is in no argument list, message or
# file.
{ set +x; } 2>/dev/null
[[ -n ${FORGEJO_TOKEN:-} ]] \
  || undecided "origin $norm is on the owner's forge, which needs a read token for this check (set FORGEJO_TOKEN)"
[[ $FORGEJO_TOKEN != *[$'\r\n']* ]] \
  || undecided "FORGEJO_TOKEN holds a line break"
response=$(printf 'Authorization: token %s\n' "$FORGEJO_TOKEN" \
  | curl -q --silent --show-error --max-time 15 --header @- --write-out '\n%{http_code}' \
    "https://$api_host/api/v1/repos/$owner/$name" 2>"$errors") \
  || undecided "origin $norm, and the forge could not be asked whether it is a fork or a mirror: $(<"$errors")"
status=${response##*$'\n'}
body=${response%$'\n'*}
# The forge's own explanation, printable characters only and cut short.
forge_message=$(jq -r '.message // empty | tostring' <<<"$body" 2>/dev/null \
  | tr '\t\r\n' '   ' | tr -cd '[:print:]' | sed -E 's/ +/ /g; s/^ //; s/ $//' | cut -c1-200) \
  || forge_message=""
[[ -n $forge_message ]] && forge_message=" (the forge says: $forge_message)"
case "$status" in
  200) ;;
  401 | 403) undecided "origin $norm, and the forge refused the token in FORGEJO_TOKEN (HTTP $status): it may have expired or lack read access$forge_message" ;;
  404) undecided "origin $norm, and the forge answered HTTP 404: the repository is not there, or the token in FORGEJO_TOKEN cannot see it$forge_message" ;;
  *) undecided "origin $norm, and the forge answered HTTP $status$forge_message" ;;
esac
flags=$(jq -r '"\(.fork) \(.mirror) \(.owner.login)"' <<<"$body" 2>"$errors") \
  || undecided "origin $norm, and its fork and mirror flags and owner could not be read from the forge's answer: $(<"$errors")"
verdict "the forge" "$flags"
