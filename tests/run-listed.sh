#!/usr/bin/env bash
# Runs test cases from the test files that list them.
# usage: run-listed.sh <task> <file>... -- [case ...]
#   Reads each file's --list once. A file given twice, a failing or empty
#   --list, a line that is no plain name ([A-Za-z_][A-Za-z0-9_]*), a name
#   listed twice, and an empty or unknown case stop the run with exit 1 before
#   any file runs. A named
#   case runs from the file that lists it; without names every file runs all
#   of its cases. Messages start with "<task>: ". A file that exits non-zero
#   is named with its code, and the run exits with the first such code.
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

# given[path]: the files given, by their resolved path.
declare -A given=()
for file in "${files[@]}"; do
  [ -f "$file" ] || { echo "$task: no such file: $file" >&2; exit 1; }
  path=$(readlink -f -- "$file")
  [ -z "${given[$path]+set}" ] || { echo "$task: $file given twice" >&2; exit 1; }
  given[$path]=1
done

name_re='^[A-Za-z_][A-Za-z0-9_]*$'
# owner[case]: the file whose --list names the case.
declare -A owner=()
for file in "${files[@]}"; do
  list=$("$file" --list) || { echo "$task: $file --list exited with $?" >&2; exit 1; }
  [ -n "$list" ] || { echo "$task: $file --list printed no names" >&2; exit 1; }
  mapfile -t listed <<<"$list"
  for name in "${listed[@]}"; do
    if ! [[ $name =~ $name_re ]]; then
      printf '%s: %s --list printed %q, which is no case name\n' "$task" "$file" "$name" >&2
      exit 1
    fi
    if [ "${owner[$name]-}" = "$file" ]; then
      echo "$task: $file lists case $name twice" >&2
      exit 1
    elif [ -n "${owner[$name]+set}" ]; then
      echo "$task: case $name is listed by ${owner[$name]} and $file" >&2
      exit 1
    fi
    owner[$name]=$file
  done
done
for name in "$@"; do
  [[ $name =~ $name_re ]] && [ -n "${owner[$name]+set}" ] ||
    { printf '%s: no such case: %q\n' "$task" "$name" >&2; exit 1; }
done

status=0
for file in "${files[@]}"; do
  cases=()
  for name in "$@"; do
    if [ "${owner[$name]}" = "$file" ]; then cases+=("$name"); fi
  done
  if [ $# -eq 0 ] || [ ${#cases[@]} -gt 0 ]; then
    rc=0
    "$file" "${cases[@]}" || rc=$?
    if [ "$rc" != 0 ]; then
      echo "$task: $file exited with $rc" >&2
      [ "$status" != 0 ] || status=$rc
    fi
  fi
done
exit "$status"
