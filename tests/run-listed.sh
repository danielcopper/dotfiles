#!/usr/bin/env bash
# Runs test cases from the test files that list them, for the mise tasks
# install-dotfiles-test, memex-sync-test and shell-test.
# usage: run-listed.sh <task> <file>... -- [case ...]
#   Reads each file's --list once. A failing or empty --list, a line that is
#   no plain name ([A-Za-z_][A-Za-z0-9_]*), a name two files list, and an
#   empty or unknown case stop the run before any file runs. A named case runs
#   from the file that lists it; without names every file runs all of its
#   cases. Messages start with "<task>: ". Exits 1 when any file's run failed.
set -euo pipefail

[ $# -gt 0 ] || { echo "usage: run-listed.sh <task> <file>... -- [case ...]" >&2; exit 2; }
task=$1
shift
files=()
while [ $# -gt 0 ] && [ "$1" != -- ]; do
  files+=("$1")
  shift
done
if [ $# -eq 0 ] || [ ${#files[@]} -eq 0 ]; then
  echo "$task: usage: run-listed.sh <task> <file>... -- [case ...]" >&2
  exit 2
fi
shift

name_re='^[A-Za-z_][A-Za-z0-9_]*$'
# owner[case]: the file whose --list names the case.
declare -A owner=()
for file in "${files[@]}"; do
  [ -f "$file" ] || { echo "$task: no such file: $file" >&2; exit 1; }
  if ! list=$("$file" --list); then
    echo "$task: $file --list failed" >&2
    exit 1
  fi
  [ -n "$list" ] || { echo "$task: $file --list printed no names" >&2; exit 1; }
  mapfile -t listed <<<"$list"
  for name in "${listed[@]}"; do
    if ! [[ $name =~ $name_re ]]; then
      echo "$task: $file --list printed \"$name\", which is no case name" >&2
      exit 1
    fi
    if [ -n "${owner[$name]+set}" ]; then
      echo "$task: case $name is listed by ${owner[$name]} and $file" >&2
      exit 1
    fi
    owner[$name]=$file
  done
done
for name in "$@"; do
  [[ $name =~ $name_re ]] && [ -n "${owner[$name]+set}" ] ||
    { echo "$task: no such case: $name" >&2; exit 1; }
done

status=0
for file in "${files[@]}"; do
  cases=()
  for name in "$@"; do
    if [ "${owner[$name]}" = "$file" ]; then cases+=("$name"); fi
  done
  if [ $# -eq 0 ] || [ ${#cases[@]} -gt 0 ]; then
    "$file" "${cases[@]}" || status=1
  fi
done
exit "$status"
