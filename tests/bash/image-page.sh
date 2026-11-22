#!/usr/bin/env bash
# Tests for bash/.local/bin/image-page, which copies images into a directory
# and writes an index.html that shows them at their real size. Each case runs
# the script in a clean environment (env -i) whose PATH holds python3 and a
# stand-in preview-serve that logs its calls to $ROOT/served, so a case can
# tell that the script starts no server. The images are written once, before
# the cases, by the python at the top of this file: a PNG that decodes, and
# headers of the other formats with the size where each format keeps it.
#   m1  a 725 px PNG at --density 2.625: CSS width 276; 5 px at 2: 3 (half
#       up); 1 px at 3: 1, never 0; the copy is the same bytes as the source;
#       the page's meta line says "3 images · density 2.625"
#   m2  without --density: the pixel width, 725, and "1 image · density 1"
#   m3  a density that is no positive decimal number, too large for a float
#       or too small to be told from 0 (0, 0.0, -1, abc, empty, nan, inf,
#       1e3, 1_0, " 2", 400 digits that overflow to infinity, 0. and 400
#       zeros and a 1, which is 0 to a float): exit 2, that reason and the
#       usage on stderr; a missing value, --title without its value, an
#       unknown option, no image: exit 2, that reason and the usage on
#       stderr; --title with a separate value that starts with -: exit 2,
#       pointing to --title=; the out-dir not created in each; the usage
#       names preview-serve <out-dir>; --title=-x gives the page the title -x
#   m4  each format's size read from the file, width and height, as the CSS
#       width and the caption show them: PNG, baseline and progressive JPEG
#       (a DHT segment and fill bytes before the frame header), GIF, WebP as
#       VP8 (scale bits set), VP8L and VP8X (a width above 16384)
#   m5  a size that cannot be read (a text file named .png, a PNG cut before
#       and one cut inside its IHDR, a PNG of width 0, a GIF cut after its
#       signature, a JPEG without a frame header and one cut inside it, a WebP
#       without a known chunk, VP8, VP8L and VP8X chunks too short for their
#       size, a missing file, a directory): exit 1, the file named on stderr,
#       no traceback, the out-dir not created
#   m6  a density so small that an image's CSS width overflows: exit 1, the
#       file named, no traceback, the out-dir not created
#   c1  without a caption: the basename without its extension, with the
#       image's pixel size beside it, above the image
#   c2  image::caption: that caption, above the image, the rest of the path
#       read as the image; an empty caption falls back to the default
#   c3  the images stand in the order given
#   c4  caption, title and file name are HTML-escaped in the caption, alt,
#       <title> and <h1>; the src is the file name URL-escaped
#   c5  --title sets <title> and <h1>; without it <title> is the out-dir's
#       name and there is no <h1>
#   c6  the page loads nothing from outside: no URL in it, every src a file
#       beside it
#   c7  light and dark: every color token of the bare :root block is
#       redefined in a prefers-color-scheme: dark block that sets only tokens
#       and color-scheme: dark, body takes its colors from the tokens, and
#       no color literal stands outside the two token blocks: no hex color,
#       no CSS named color and no rgb(), hsl(), hwb(), lab(), lch(), oklab(),
#       oklch() or color()
#   o1  a missing out-dir is created, parents too; an out-dir that is a file:
#       exit 1
#   o2  a non-empty out-dir is refused without --replace, also one holding
#       an earlier page: exit 1, nothing in it changed
#   o3  --replace on a page image-page wrote: the earlier images are gone,
#       the new ones and index.html in place, nothing left beside the
#       out-dir; on a missing or empty out-dir it writes the page
#   o4  --replace on an out-dir holding anything image-page did not write (a
#       foreign file beside a page, a subdirectory, a symlink under the name
#       of an image the page shows, a directory without image-page's list,
#       a list that is no JSON or no list of names, a list it cannot read):
#       exit 1, says why, no traceback, nothing in it changed, in each
#   o5  two images with the same basename, or an image named index.html:
#       exit 1, both named, the out-dir not created
#   o6  stdout is the path of index.html and nothing else; no server started
#   o7  options may follow the positional arguments; after -- a name that
#       starts with - is an image
#   o8  --replace whose writing fails (a file-size limit below the new
#       image's size): exit 3, "cannot write the page in <out-dir>: File too
#       large" on stderr, no traceback, the earlier page unchanged and no
#       temporary directory left beside it
#   o9  an out-dir that cannot be listed: exit 1, says so, no traceback
#   o10 a parent directory that cannot be written: exit 3, "cannot write the
#       page in <out-dir>: Permission denied" on stderr, no traceback,
#       nothing created
#   o11 --replace on the current directory when it holds a page, which the
#       swap would move: exit 1, says so, the page unchanged
#   l1  --section TITLE (or --section=TITLE) between images starts a section:
#       an <h2> with the title, HTML-escaped, then its images in the order
#       given, each section its own <section>; images before the first
#       --section form one without a heading; without --section there is one
#       such section; a --section right after <out-dir> makes no empty one;
#       the meta line counts the images of every section
#   l2  a --section without a title, with an empty or blank title, with a
#       separate title that starts with - (pointing to --section=), with no
#       image after it (at the end, or right before another --section), or
#       before <out-dir>: exit 2, the reason and the usage on stderr, the
#       out-dir not created, in each; --section=-x is the heading -x; after
#       -- a --section is an image name like any other
#   l3  the layout: each section's images in a grid whose column is its
#       widest image's CSS width (--col) and that fits as many columns as the
#       page allows, never wider than the screen; the page centered, as wide
#       as its widest section with every image in one row (--page), whichever
#       section that is, and at least 40rem
# The f cases run the script inside a python harness, $ROOT/faulty.py, that
# loads it as a module and makes the os calls the scenario FAULT names fail,
# the one way to reach a rename that fails between two that succeed:
#   f1  the swap's rename into place fails after the earlier page moved
#       aside: the earlier page put back, exit 3 naming <out-dir> and the
#       error, nothing left beside it
#   f2  the swap fails and so does putting the earlier page back: exit 3,
#       the swap's error, "<out-dir> is missing; the earlier page is at
#       <dir>", and that directory holds the earlier page
#   f3  moving the earlier page aside fails: exit 3, the page unchanged,
#       nothing left beside it
#   f4  removing the earlier page after the swap fails: exit 0, the new page
#       in place, its path on stdout, a warning naming the leftover directory,
#       which exists
#   f5  into an empty out-dir, every move after the first fails: the list
#       moved first, so --replace clears what is there; the move of
#       index.html alone fails: everything else moved, and --replace clears it
# usage: image-page.sh [image-page] [case ...]
#        image-page.sh --list
#   The script defaults to the repo's bash/.local/bin/image-page, the cases
#   to all of them. The script argument needs a / in its path.
# Prints "PASS <case>" or "FAIL <case>: <check>" per case; exits 1 when any
# case failed. HOME points into a temporary directory for the whole run,
# which is removed at the end. Needs python3.
set -uo pipefail

CASES=(m1_density_scales m2_default_density m3_bad_density m4_formats m5_unreadable_size
  c1_caption_default c2_caption_given c3_order_kept c4_escaping c5_title c6_no_external_resources
  c7_dark_tokens
  o1_out_dir_created o2_nonempty_refused o3_replace o4_replace_refuses_foreign o5_duplicate_basenames
  o6_prints_path_only o7_option_order o8_write_fails_keeps_page o9_unlistable_out_dir
  o10_parent_not_writable o11_replace_current_dir m6_width_overflows f1_swap_fails_rolls_back
  f2_rollback_fails_says_where f3_aside_fails f4_cleanup_fails_warns f5_empty_dir_move_fails
  l1_sections l2_section_usage l3_grid_layout)
if [ "${1:-}" = --list ]; then
  printf '%s\n' "${CASES[@]}"
  exit 0
fi

HERE=$(dirname "$(readlink -f "$0")")
REPO=$(readlink -f "$HERE/../..")
SUT=$REPO/bash/.local/bin/image-page
if [ $# -gt 0 ] && [[ $1 == */* ]] && [ -f "$1" ]; then
  SUT=$(readlink -f "$1")
  shift
fi
# Resolved, so the path the script prints for a relative out-dir compares equal.
ROOT=$(readlink -f "$(mktemp -d "${TMPDIR:-/tmp}/image-page-test.XXXXXX")")
trap 'rm -rf "$ROOT"' EXIT
export HOME=$ROOT/home
FX=$ROOT/fixtures
mkdir -p "$HOME" "$ROOT/bin" "$FX"

ln -s "$(type -P python3)" "$ROOT/bin/python3"
cat >"$ROOT/bin/preview-serve" <<EOF
#!/bin/sh
echo "preview-serve \$*" >>"$ROOT/served"
EOF
chmod +x "$ROOT/bin/preview-serve"
cat >"$ROOT/faulty.py" <<'EOF'
"""usage: faulty.py <image-page> <arg>...; FAULT names the os call to fail."""
import errno, importlib.machinery, importlib.util, os, sys

sut, argv, fault = sys.argv[1], sys.argv[2:], os.environ["FAULT"]
loader = importlib.machinery.SourceFileLoader("image_page", sut)
module = importlib.util.module_from_spec(importlib.util.spec_from_loader("image_page", loader))
loader.exec_module(module)
real_rename, real_rmdir = os.rename, os.rmdir
moves = 0
into_place = 0


def temp(path):
    return os.path.basename(path).startswith(".image-page-")


def fail(code, path):
    raise OSError(code, os.strerror(code), path)


def rename(src, dst, **kw):
    global moves, into_place
    if temp(os.path.dirname(src)):  # a file moved into an empty out-dir
        moves += 1
        if fault == "after-first-move" and moves > 1 or fault == "index-move" and dst.endswith("/index.html"):
            fail(errno.EIO, dst)
    elif temp(dst):  # the earlier page moved aside
        if fault == "aside":
            fail(errno.EIO, dst)
    elif temp(src):  # the new page, then on a failure the earlier one, into place
        into_place += 1
        if fault == "swap" and into_place == 1:
            fail(errno.EIO, dst)
        if fault == "rollback":
            fail(errno.EIO if into_place == 1 else errno.EACCES, dst)
    real_rename(src, dst, **kw)


def rmdir(path, **kw):
    if fault == "cleanup" and temp(path):
        fail(errno.EBUSY, path)
    real_rmdir(path, **kw)


os.rename, os.rmdir = rename, rmdir
sys.exit(module.main(argv))
EOF

python3 -I - "$FX" <<'EOF' || { echo "FAIL: the fixtures could not be written"; exit 1; }
import os, pathlib, struct, sys, zlib

fx = pathlib.Path(sys.argv[1])


def png(w, h, noise=False):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    # Noise does not compress, so the file is as large as its pixels.
    rows = b"".join(b"\0" + (os.urandom(3 * w) if noise else b"\x80\x80\x80" * w) for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))


def segment(marker, data):
    return b"\xff" + bytes([marker]) + struct.pack(">H", len(data) + 2) + data


def jpeg(w, h, sof):
    jfif = segment(0xE0, b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0")
    dht = segment(0xC4, b"\0" + b"\x01" + b"\0" * 15 + b"\0")
    frame = segment(sof, struct.pack(">BHHB", 8, h, w, 1) + b"\x01\x11\0")
    return b"\xff\xd8" + jfif + dht + b"\xff\xff" + frame + segment(0xDA, b"\x01\x01\0\0\x3f\0") + b"\0\xff\xd9"


def gif(w, h):
    return b"GIF89a" + struct.pack("<HHBBB", w, h, 0, 0, 0) + b";"


def riff(kind, data):
    chunk = kind + struct.pack("<I", len(data)) + data
    return b"RIFF" + struct.pack("<I", len(chunk) + 4) + b"WEBP" + chunk


def vp8(w, h):
    # Key frame tag, start code, then 14 bits of size and 2 of scale each.
    return riff(b"VP8 ", b"\x10\x02\0" + b"\x9d\x01\x2a" + struct.pack("<HH", w | 1 << 14, h | 2 << 14) + b"\0" * 10)


def vp8l(w, h):
    return riff(b"VP8L", b"\x2f" + struct.pack("<I", (w - 1) | (h - 1) << 14) + b"\0" * 5)


def vp8x(w, h):
    size = (w - 1).to_bytes(3, "little") + (h - 1).to_bytes(3, "little")
    return riff(b"VP8X", b"\0\0\0\0" + size)


files = {
    "wide.png": png(725, 4),
    "five.png": png(5, 2),
    "one.png": png(1, 1),
    "base.jpg": jpeg(641, 3, 0xC0),
    "prog.jpg": jpeg(1081, 7, 0xC2),
    "anim.gif": gif(333, 9),
    "lossy.webp": vp8(517, 11),
    "lossless.webp": vp8l(9999, 13),
    "extended.webp": vp8x(20000, 17),
    "notes.png": b"just some text\n",
    "cut.png": b"\x89PNG\r\n\x1a\n\0\0\0\x0dIH",
    "noframe.jpg": b"\xff\xd8" + segment(0xE0, b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0") + b"\xff\xd9",
    "odd.webp": riff(b"ALPH", b"\0" * 10),
    "ihdr-cut.png": b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">I", 725),
    "zero.png": png(0, 4),
    "cut.gif": b"GIF89a",
    "sof-cut.jpg": b"\xff\xd8" + segment(0xE0, b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0") + b"\xff\xc0\0\x11\x08\0\x03",
    "short-vp8.webp": riff(b"VP8 ", b"\x10\x02\0\x9d\x01\x2a\0\0"),
    "short-vp8l.webp": riff(b"VP8L", b"\x2f\0\0"),
    "short-vp8x.webp": riff(b"VP8X", b"\0\0\0\0\x01\0"),
    "big.png": png(64, 64, noise=True),
}
for name, data in files.items():
    (fx / name).write_bytes(data)
EOF

failures=0
fail() { echo "FAIL $CASE: $*"; FAILED=1; }
check() { # check <description> <command...>
  local what=$1
  shift
  "$@" || fail "$what"
}
page() { cat "$OUTDIR/index.html" 2>/dev/null; }
# img_width <src>: the CSS width, in px, index.html gives the image <src>.
img_width() {
  page | sed -n "s|.*<img src=\"$1\"[^>]*style=\"width:\([0-9]*\)px\".*|\1|p"
}
# caption <html> <w × h>: the figcaption line shown() expects for an image.
caption() { printf '<figcaption><span class="name">%s</span> <span class="size">%s px</span></figcaption>' "$1" "$2"; }
# shown: the figcaption and img lines of index.html, in order, one per line.
shown() { page | grep -E '<figcaption>|<img '; }
no_traceback() { ! grep -q Traceback <<<"$ERR"; }
# listing <dir>: the names in <dir>, dotfiles too, one per line, in byte order.
listing() { (cd "$1" && find . -mindepth 1 | LC_ALL=C sort); }
no_server() { [ ! -e "$ROOT/served" ]; }
# lacks <regex> <file>: no line of <file> matches <regex>, case ignored.
lacks() { ! grep -qiE -- "$1" "$2"; }

# run_cmd <command>...: runs <command> from $ROOT/caller in a clean
# environment (env -i: PATH, HOME, and FAULT when set), under a file-size
# limit of $FSIZE KiB when set; its stdout in $OUT, stderr in $ERR, exit
# code in $RC.
run_cmd() {
  RC=0
  OUT=$(cd "$ROOT/caller" && { [ -z "${FSIZE:-}" ] || ulimit -f "$FSIZE"; } &&
    env -i PATH="$ROOT/bin" HOME="$HOME" ${FAULT:+"FAULT=$FAULT"} "$@" 2>"$ROOT/stderr") || RC=$?
  ERR=$(cat "$ROOT/stderr")
}
# run <arg>...: the script with <arg>..., as run_cmd runs it.
run() { run_cmd "$SUT" "$@"; }
# run_faulty <fault> <arg>...: as run, inside $ROOT/faulty.py with FAULT=<fault>;
# -B, so loading the script as a module writes no __pycache__ beside it.
run_faulty() {
  local FAULT=$1
  shift
  run_cmd python3 -I -B "$ROOT/faulty.py" "$SUT" "$@"
}
written() { # written: exit 0 and an index.html in $OUTDIR
  check "exit 0, got $RC: $ERR" [ "$RC" = 0 ]
  check "index.html written" [ -f "$OUTDIR/index.html" ]
}
not_created() { # not_created <rc> <stderr text>: refused before $OUTDIR exists
  check "exit $1, got $RC: $ERR" [ "$RC" = "$1" ]
  check "stderr names '$2': $ERR" grep -qF -- "$2" <<<"$ERR"
  check "out-dir not created" [ ! -e "$OUTDIR" ]
  check "nothing on stdout: $OUT" [ -z "$OUT" ]
  check "no traceback: $ERR" no_traceback
}
# refused_usage <reason>: exit 2 before the out-dir exists, <reason> and the
# usage on stderr.
refused_usage() {
  not_created 2 "$1"
  check "the usage with '$1': $ERR" grep -qF "usage: image-page" <<<"$ERR"
}

m1_density_scales() {
  run --density 2.625 "$OUTDIR" "$FX/wide.png" "$FX/five.png" "$FX/one.png"
  written
  check "725 px at 2.625 is 276 px, got $(img_width wide.png)" [ "$(img_width wide.png)" = 276 ]
  check "meta line names count and density: $(page | grep 'class="meta"')" \
    grep -qxF '<p class="meta">3 images · density 2.625</p>' "$OUTDIR/index.html"
  run --replace --density 2 "$OUTDIR" "$FX/five.png"
  written
  check "5 px at 2 is 3 px, got $(img_width five.png)" [ "$(img_width five.png)" = 3 ]
  run --replace --density 3 "$OUTDIR" "$FX/one.png" "$FX/wide.png"
  written
  check "1 px at 3 is 1 px, got $(img_width one.png)" [ "$(img_width one.png)" = 1 ]
  check "the copy holds the source's bytes" cmp -s "$FX/wide.png" "$OUTDIR/wide.png"
  check "height auto and max-width 100%: $(page | grep -F 'img{')" \
    grep -qF 'img{display:block;height:auto;max-width:100%}' <<<"$(page)"
}

m2_default_density() {
  run "$OUTDIR" "$FX/wide.png"
  written
  check "725 px without --density, got $(img_width wide.png)" [ "$(img_width wide.png)" = 725 ]
  check "meta line for one image at density 1: $(page | grep 'class="meta"')" \
    grep -qxF '<p class="meta">1 image · density 1</p>' "$OUTDIR/index.html"
}

m3_bad_density() {
  local value
  local reason="is no positive decimal number, too large for a float or too small to be told from 0"
  for value in 0 0.0 -1 abc "" nan inf 1e3 1_0 " 2" "1$(printf '0%.0s' {1..400})" \
    "0.$(printf '0%.0s' {1..400})1"; do
    run --density "$value" "$OUTDIR" "$FX/wide.png"
    refused_usage "$reason"
    run "--density=$value" "$OUTDIR" "$FX/wide.png"
    refused_usage "$reason"
  done
  run "$OUTDIR" "$FX/wide.png" --density
  refused_usage "--density needs a value"
  run "$OUTDIR" "$FX/wide.png" --title
  refused_usage "--title needs a value"
  run "$OUTDIR" --title -x "$FX/wide.png"
  refused_usage "give a value that starts with - as --title=-x"
  run "$OUTDIR" --title=-x "$FX/wide.png"
  written
  check "--title=-x is the title: $(page | grep '<title>')" grep -qxF "<title>-x</title>" "$OUTDIR/index.html"
  rm -rf "$OUTDIR"
  run --size 3 "$OUTDIR" "$FX/wide.png"
  refused_usage "unknown option --size"
  run "$OUTDIR"
  refused_usage "an <out-dir> and at least one image are needed"
  run
  check "exit 2 without arguments, got $RC" [ "$RC" = 2 ]
  check "the usage says what to run next: $ERR" grep -qF "preview-serve <out-dir>" <<<"$ERR"
}

m4_formats() {
  run "$OUTDIR" "$FX/wide.png" "$FX/base.jpg" "$FX/prog.jpg" "$FX/anim.gif" \
    "$FX/lossy.webp" "$FX/lossless.webp" "$FX/extended.webp"
  written
  local entry name w h got size
  for entry in wide.png:725:4 base.jpg:641:3 prog.jpg:1081:7 anim.gif:333:9 lossy.webp:517:11 \
    lossless.webp:9999:13 extended.webp:20000:17; do
    IFS=: read -r name w h <<<"$entry"
    got=$(img_width "$name")
    check "$name is $w px wide, got $got" [ "$got" = "$w" ]
    size=$(page | grep -B1 -F "<img src=\"$name\"" | sed -n 's/.*<span class="size">\(.*\) px<.*/\1/p')
    check "$name's caption says $w × $h, got $size" [ "$size" = "$w × $h" ]
  done
}

m5_unreadable_size() {
  local name
  for name in notes.png cut.png ihdr-cut.png zero.png cut.gif noframe.jpg sof-cut.jpg odd.webp \
    short-vp8.webp short-vp8l.webp short-vp8x.webp missing.png; do
    run "$OUTDIR" "$FX/wide.png" "$FX/$name"
    not_created 1 "$FX/$name"
  done
  mkdir "$ROOT/folder.png"
  run "$OUTDIR" "$ROOT/folder.png"
  not_created 1 "$ROOT/folder.png"
}

m6_width_overflows() {
  run --density "0.$(printf '0%.0s' {1..310})1" "$OUTDIR" "$FX/wide.png"
  not_created 1 "$FX/wide.png"
}

c1_caption_default() {
  run "$OUTDIR" "$FX/wide.png" "$FX/lossless.webp"
  written
  check "each caption above its image: $(shown)" [ "$(shown)" = "$(caption wide '725 × 4')
<img src=\"wide.png\" alt=\"wide\" style=\"width:725px\">
$(caption lossless '9999 × 13')
<img src=\"lossless.webp\" alt=\"lossless\" style=\"width:9999px\">" ]
}

c2_caption_given() {
  run "$OUTDIR" "$FX/wide.png::Woche :: dark" "$FX/anim.gif::"
  written
  check "the given caption and the default: $(shown)" [ "$(shown)" = "$(caption 'Woche :: dark' '725 × 4')
<img src=\"wide.png\" alt=\"Woche :: dark\" style=\"width:725px\">
$(caption anim '333 × 9')
<img src=\"anim.gif\" alt=\"anim\" style=\"width:333px\">" ]
}

c3_order_kept() {
  run "$OUTDIR" "$FX/prog.jpg" "$FX/wide.png" "$FX/anim.gif" "$FX/base.jpg"
  written
  local srcs
  srcs=$(page | grep -o '<img src="[^"]*"' | tr '\n' ' ')
  check "order kept: $srcs" [ "$srcs" = '<img src="prog.jpg" <img src="wide.png" <img src="anim.gif" <img src="base.jpg" ' ]
}

c4_escaping() {
  cp "$FX/wide.png" "$ROOT/two words&more.png"
  run --title "<i>Tom & \"Jerry's\"</i>" "$OUTDIR" "$FX/anim.gif::<b>&\"x'</b>" "$ROOT/two words&more.png"
  written
  check "caption escaped: $(shown)" [ "$(shown)" = "$(caption '&lt;b&gt;&amp;&quot;x&#x27;&lt;/b&gt;' '333 × 9')
<img src=\"anim.gif\" alt=\"&lt;b&gt;&amp;&quot;x&#x27;&lt;/b&gt;\" style=\"width:333px\">
$(caption 'two words&amp;more' '725 × 4')
<img src=\"two%20words%26more.png\" alt=\"two words&amp;more\" style=\"width:725px\">" ]
  local esc='&lt;i&gt;Tom &amp; &quot;Jerry&#x27;s&quot;&lt;/i&gt;'
  check "title escaped: $(page | grep '<title>')" grep -qxF "<title>$esc</title>" <<<"$(page)"
  check "h1 escaped: $(page | grep '<h1>')" grep -qxF "<h1>$esc</h1>" <<<"$(page)"
  check "no raw markup from the input" lacks "<(b|i)>" "$OUTDIR/index.html"
  check "the file kept its name" [ -f "$OUTDIR/two words&more.png" ]
}

c5_title() {
  run --title "Woche" "$OUTDIR" "$FX/wide.png"
  written
  check "title set: $(page | grep '<title>')" grep -qxF "<title>Woche</title>" <<<"$(page)"
  check "h1 set: $(page | grep '<h1>')" grep -qxF "<h1>Woche</h1>" <<<"$(page)"
  run --replace "$OUTDIR" "$FX/wide.png"
  written
  check "title is the out-dir's name: $(page | grep '<title>')" grep -qxF "<title>page</title>" <<<"$(page)"
  check "no h1 without --title" lacks "<h1" "$OUTDIR/index.html"
}

c6_no_external_resources() {
  run --title T "$OUTDIR" "$FX/wide.png" "$FX/anim.gif"
  written
  check "no URL in the page" lacks "(https?|ftp|data):|//|@import|url\(" "$OUTDIR/index.html"
  local src
  while read -r src; do
    check "src $src lies beside the page" [ -f "$OUTDIR/$src" ]
  done < <(page | sed -n 's/.*src="\([^"]*\)".*/\1/p')
  check "the page names its images: $(page | grep -c 'src=')" [ "$(page | grep -c 'src=')" = 2 ]
}

c7_dark_tokens() {
  run "$OUTDIR" "$FX/wide.png"
  written
  local verdict
  verdict=$(python3 -I - "$OUTDIR/index.html" 2>&1 <<'EOF'
import re, sys
page = open(sys.argv[1], encoding="utf-8").read()
style = re.search(r"<style>(.*?)</style>", page, re.S)
if not style:
    sys.exit("no <style> block")
css = style.group(1)
light = re.search(r"(?m)^:root\{([^}]*)\}", css)
dark = re.search(r"@media \(prefers-color-scheme: ?dark\)\{:root\{([^}]*)\}\}", css)
if not light or not dark:
    sys.exit("no bare :root block or no prefers-color-scheme: dark block")
def decls(block):
    return dict(d.split(":", 1) for d in block.split(";") if d.strip())
light_d, dark_d = decls(light.group(1)), decls(dark.group(1))
# The CSS named colors; a font name, a keyword or a token name is none of them.
NAMED = set("""
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred
darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold
goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush
lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow
lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise
palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
""".split())
FUNCS = r"\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\("


def color_in(text):
    """The first color literal in CSS text, or None."""
    found = re.search(r"#[0-9a-fA-F]{3,8}\b|" + FUNCS, text, re.I)
    if found:
        return found.group(0)
    # A named color counts in a declaration's value, outside quotes.
    for value in re.findall(r":([^;{}]*)", re.sub(r'"[^"]*"', "", text)):
        for word in re.findall(r"(?<![-\w])[a-zA-Z]+(?![-\w(])", value):
            if word.lower() in NAMED:
                return word
    return None
colors = sorted(k for k, v in light_d.items() if k.startswith("--") and color_in(":" + v))
if len(colors) < 3:
    sys.exit(f"fewer than 3 color tokens on :root: {colors}")
missing = [k for k in colors if k not in dark_d]
if missing:
    sys.exit(f"not redefined for dark: {missing}")
extra = [k for k in dark_d if not k.startswith("--") and k != "color-scheme"]
if extra or dark_d.get("color-scheme") != "dark":
    sys.exit(f"the dark block sets {extra} or lacks color-scheme:dark")
rest = css.replace(light.group(0), "").replace(dark.group(0), "")
if color_in(rest):
    sys.exit(f"a color literal outside the token blocks: {color_in(rest)}")
body = re.search(r"(?m)^body\{([^}]*)\}", rest)
if not body or "background:var(--bg)" not in body.group(1) or "color:var(--fg)" not in body.group(1):
    sys.exit("body does not take background and color from the tokens")
print("ok")
EOF
  )
  check "dark-mode tokens: $verdict" [ "$verdict" = ok ]
}

o1_out_dir_created() {
  OUTDIR=$ROOT/deep/er/page
  run "$OUTDIR" "$FX/wide.png"
  written
  OUTDIR=$ROOT/plain-file
  echo x >"$OUTDIR"
  run "$OUTDIR" "$FX/wide.png"
  check "exit 1 for a file, got $RC" [ "$RC" = 1 ]
  check "says it is no directory: $ERR" grep -qF "$OUTDIR is no directory" <<<"$ERR"
  check "the file untouched" [ "$(cat "$OUTDIR")" = x ]
}

o2_nonempty_refused() {
  mkdir -p "$OUTDIR"
  echo keep >"$OUTDIR/keep.txt"
  run "$OUTDIR" "$FX/wide.png"
  check "exit 1, got $RC" [ "$RC" = 1 ]
  check "says it is not empty: $ERR" grep -qF "$OUTDIR is not empty" <<<"$ERR"
  check "only keep.txt in it: $(listing "$OUTDIR")" [ "$(listing "$OUTDIR")" = ./keep.txt ]
  rm "$OUTDIR/keep.txt"
  run "$OUTDIR" "$FX/wide.png"
  written
  local before
  before=$(listing "$OUTDIR")
  run "$OUTDIR" "$FX/anim.gif"
  check "exit 1 over an earlier page, got $RC" [ "$RC" = 1 ]
  check "the earlier page unchanged: $(listing "$OUTDIR")" [ "$(listing "$OUTDIR")" = "$before" ]
  check "its index.html unchanged" grep -qF 'src="wide.png"' "$OUTDIR/index.html"
}

o3_replace() {
  run "$OUTDIR" "$FX/wide.png" "$FX/anim.gif"
  written
  run --replace "$OUTDIR" "$FX/base.jpg"
  written
  check "nothing left beside it: $(leftovers)" [ -z "$(leftovers)" ]
  check "wide.png gone: $(listing "$OUTDIR")" [ ! -e "$OUTDIR/wide.png" ]
  check "anim.gif gone: $(listing "$OUTDIR")" [ ! -e "$OUTDIR/anim.gif" ]
  check "the new image in place" cmp -s "$FX/base.jpg" "$OUTDIR/base.jpg"
  check "index.html shows only the new image: $(shown)" [ "$(page | grep -o 'src="[^"]*"')" = 'src="base.jpg"' ]
  run --replace "$OUTDIR" "$FX/base.jpg" "$FX/wide.png"
  written
  check "nothing left beside it after the second: $(leftovers)" [ -z "$(leftovers)" ]
  check "the page rewritten again: $(page | grep -o 'src="[^"]*"' | tr '\n' ' ')" \
    [ "$(page | grep -o 'src="[^"]*"' | tr '\n' ' ')" = 'src="base.jpg" src="wide.png" ' ]
  OUTDIR=$ROOT/fresh
  run --replace "$OUTDIR" "$FX/wide.png"
  written
  check "nothing left beside a new out-dir: $(leftovers)" [ -z "$(leftovers)" ]
  OUTDIR=$ROOT/empty
  mkdir "$OUTDIR"
  run --replace "$OUTDIR" "$FX/wide.png"
  written
  check "nothing left beside an empty out-dir: $(leftovers)" [ -z "$(leftovers)" ]
}

o4_replace_refuses_foreign() {
  local foreign before
  for foreign in file dir link; do
    rm -rf "$OUTDIR"
    run "$OUTDIR" "$FX/wide.png"
    case $foreign in
      file) echo mine >"$OUTDIR/notes.txt" ;;
      dir) mkdir "$OUTDIR/sub" ;;
      # In place of the image the page names, so only its being a link tells.
      link) ln -sf "$FX/anim.gif" "$OUTDIR/wide.png" ;;
    esac
    before=$(listing "$OUTDIR")
    run --replace "$OUTDIR" "$FX/base.jpg"
    check "exit 1 with a foreign $foreign, got $RC" [ "$RC" = 1 ]
    check "says what it did not write: $ERR" grep -qF "image-page did not write" <<<"$ERR"
    check "no traceback with a foreign $foreign: $ERR" no_traceback
    check "nothing changed with a foreign $foreign: $(listing "$OUTDIR")" [ "$(listing "$OUTDIR")" = "$before" ]
    check "the page still shows wide.png" grep -qF 'src="wide.png"' "$OUTDIR/index.html"
  done
  rm -rf "$OUTDIR"
  mkdir "$OUTDIR"
  cp "$FX/wide.png" "$OUTDIR/wide.png"
  echo "<p>hand-made</p>" >"$OUTDIR/index.html"
  before=$(listing "$OUTDIR")
  run --replace "$OUTDIR" "$FX/base.jpg"
  check "exit 1 without image-page's list, got $RC" [ "$RC" = 1 ]
  check "says the list is missing: $ERR" grep -qF "$OUTDIR holds no .image-page.json" <<<"$ERR"
  check "no traceback without a list: $ERR" no_traceback
  check "nothing changed without a list" [ "$(listing "$OUTDIR")" = "$before" ]
  check "the hand-made page kept" grep -qF hand-made "$OUTDIR/index.html"
  check "its image kept" [ -f "$OUTDIR/wide.png" ]
  local list
  for list in 'not json' '{"wide.png": 1}' '["wide.png", 7]'; do
    printf '%s' "$list" >"$OUTDIR/.image-page.json"
    before=$(listing "$OUTDIR")
    run --replace "$OUTDIR" "$FX/base.jpg"
    check "exit 1 with the list $list, got $RC" [ "$RC" = 1 ]
    check "says the list is none: $ERR" grep -qF ".image-page.json is no list of file names" <<<"$ERR"
    check "no traceback with the list $list: $ERR" no_traceback
    check "nothing changed with the list $list" [ "$(listing "$OUTDIR")" = "$before" ]
  done
  echo '["wide.png"]' >"$OUTDIR/.image-page.json"
  chmod 000 "$OUTDIR/.image-page.json"
  before=$(listing "$OUTDIR")
  run --replace "$OUTDIR" "$FX/base.jpg"
  chmod 644 "$OUTDIR/.image-page.json"
  check "exit 1 with an unreadable list, got $RC" [ "$RC" = 1 ]
  check "says it cannot read the list: $ERR" grep -qF "cannot read $OUTDIR/.image-page.json: Permission denied" <<<"$ERR"
  check "no traceback: $ERR" no_traceback
  check "nothing changed with an unreadable list" [ "$(listing "$OUTDIR")" = "$before" ]
}

o5_duplicate_basenames() {
  mkdir -p "$ROOT/a" "$ROOT/b"
  cp "$FX/wide.png" "$ROOT/a/shot.png"
  cp "$FX/anim.gif" "$ROOT/b/shot.png"
  run "$OUTDIR" "$ROOT/a/shot.png" "$ROOT/b/shot.png"
  not_created 1 "$ROOT/a/shot.png"
  check "names the second one too: $ERR" grep -qF "$ROOT/b/shot.png" <<<"$ERR"
  cp "$FX/wide.png" "$ROOT/a/index.html"
  run "$OUTDIR" "$ROOT/a/index.html"
  not_created 1 "$ROOT/a/index.html"
}

o6_prints_path_only() {
  run "$OUTDIR" "$FX/wide.png"
  written
  check "stdout is the path of index.html: $OUT" [ "$OUT" = "$OUTDIR/index.html" ]
  check "nothing on stderr: $ERR" [ -z "$ERR" ]
  check "no server started: $(cat "$ROOT/served" 2>/dev/null)" no_server
  OUTDIR=$ROOT/caller/rel
  run rel "$FX/wide.png"
  check "a relative out-dir prints the absolute path: $OUT" [ "$OUT" = "$OUTDIR/index.html" ]
}

o7_option_order() {
  run "$OUTDIR" "$FX/wide.png" --density 2.625 --title Late
  written
  check "density after the images: $(img_width wide.png)" [ "$(img_width wide.png)" = 276 ]
  check "title after the images" grep -qxF "<title>Late</title>" "$OUTDIR/index.html"
  cp "$FX/anim.gif" "$ROOT/caller/-dash.gif"
  run --replace -- "$OUTDIR" -dash.gif
  written
  check "-dash.gif after -- is an image: $(shown)" grep -qF 'src="-dash.gif"' "$OUTDIR/index.html"
}

# the_page: index.html and the listing of $OUTDIR, to compare before and after.
the_page() { cat "$OUTDIR/index.html" 2>/dev/null; listing "$OUTDIR"; }
# leftovers: entries image-page left beside $OUTDIR, one per line.
leftovers() { (cd "$(dirname "$OUTDIR")" && find . -maxdepth 1 -name '.image-page-*'); }

o8_write_fails_keeps_page() {
  run "$OUTDIR" "$FX/wide.png"
  written
  local before
  before=$(the_page)
  # A 4 KiB file-size limit: big.png is three times that, so its copy fails.
  FSIZE=4 run --replace "$OUTDIR" "$FX/big.png"
  check "exit 3, got $RC: $ERR" [ "$RC" = 3 ]
  check "says it cannot write the page: $ERR" grep -qxF "image-page: cannot write the page in $OUTDIR: File too large" <<<"$ERR"
  check "no traceback: $ERR" no_traceback
  check "the earlier page unchanged: $(listing "$OUTDIR")" [ "$(the_page)" = "$before" ]
  check "nothing left beside it: $(leftovers)" [ -z "$(leftovers)" ]
}

o9_unlistable_out_dir() {
  mkdir "$OUTDIR"
  echo x >"$OUTDIR/x"
  chmod 000 "$OUTDIR"
  run --replace "$OUTDIR" "$FX/wide.png"
  chmod 755 "$OUTDIR"
  check "exit 1, got $RC: $ERR" [ "$RC" = 1 ]
  check "says it cannot read the out-dir: $ERR" grep -qF "image-page: cannot read $OUTDIR" <<<"$ERR"
  check "no traceback: $ERR" no_traceback
  check "its file kept: $(listing "$OUTDIR")" [ "$(listing "$OUTDIR")" = ./x ]
}

o10_parent_not_writable() {
  mkdir "$ROOT/locked"
  chmod 555 "$ROOT/locked"
  OUTDIR=$ROOT/locked/page
  run "$OUTDIR" "$FX/wide.png"
  chmod 755 "$ROOT/locked"
  check "exit 3, got $RC: $ERR" [ "$RC" = 3 ]
  check "says it cannot write the page: $ERR" grep -qF "image-page: cannot write the page in $OUTDIR: Permission denied (" <<<"$ERR"
  check "no traceback: $ERR" no_traceback
  check "nothing created: $(listing "$ROOT/locked")" [ -z "$(listing "$ROOT/locked")" ]
  check "nothing on stdout: $OUT" [ -z "$OUT" ]
}

o11_replace_current_dir() {
  OUTDIR=$ROOT/caller
  run . "$FX/wide.png"
  written
  local before
  before=$(the_page)
  run --replace . "$FX/anim.gif"
  check "exit 1, got $RC: $ERR" [ "$RC" = 1 ]
  check "says why: $ERR" grep -qF "is the current directory or holds it" <<<"$ERR"
  check "the page unchanged" [ "$(the_page)" = "$before" ]
}

# earlier_page: a page of wide.png in $OUTDIR, and $BEFORE as the_page sees it.
earlier_page() {
  run "$OUTDIR" "$FX/wide.png"
  written
  BEFORE=$(the_page)
}

f1_swap_fails_rolls_back() {
  earlier_page
  run_faulty swap --replace "$OUTDIR" "$FX/base.jpg"
  check "exit 3, got $RC: $ERR" [ "$RC" = 3 ]
  check "names the out-dir and the error: $ERR" grep -qF "image-page: cannot write the page in $OUTDIR: Input/output error" <<<"$ERR"
  check "no traceback: $ERR" no_traceback
  check "the earlier page put back" [ "$(the_page)" = "$BEFORE" ]
  check "nothing left beside it: $(leftovers)" [ -z "$(leftovers)" ]
}

f2_rollback_fails_says_where() {
  earlier_page
  run_faulty rollback --replace "$OUTDIR" "$FX/base.jpg"
  local old
  old=$(sed -n 's/.*the earlier page is at \(.*\)$/\1/p' <<<"$ERR")
  check "exit 3, got $RC: $ERR" [ "$RC" = 3 ]
  check "keeps the swap's error: $ERR" grep -qF "image-page: cannot write the page in $OUTDIR: Input/output error;" <<<"$ERR"
  check "says the out-dir is missing: $ERR" grep -qF "$OUTDIR is missing; the earlier page is at $(dirname "$OUTDIR")/.image-page-" <<<"$ERR"
  check "no traceback: $ERR" no_traceback
  check "the named directory holds the earlier page" \
    [ "$(cat "$old/index.html" 2>/dev/null; listing "$old")" = "$BEFORE" ]
}

f3_aside_fails() {
  earlier_page
  run_faulty aside --replace "$OUTDIR" "$FX/base.jpg"
  check "exit 3, got $RC: $ERR" [ "$RC" = 3 ]
  check "names the out-dir: $ERR" grep -qF "image-page: cannot write the page in $OUTDIR: Input/output error" <<<"$ERR"
  check "the page unchanged" [ "$(the_page)" = "$BEFORE" ]
  check "nothing left beside it: $(leftovers)" [ -z "$(leftovers)" ]
}

f4_cleanup_fails_warns() {
  earlier_page
  run_faulty cleanup --replace "$OUTDIR" "$FX/base.jpg"
  check "exit 0, got $RC: $ERR" [ "$RC" = 0 ]
  check "path on stdout: $OUT" [ "$OUT" = "$OUTDIR/index.html" ]
  check "the new page in place" grep -qF 'src="base.jpg"' "$OUTDIR/index.html"
  check "warns, naming the leftover: $ERR" grep -qF \
    "image-page: the page is written, but $(dirname "$OUTDIR")/.image-page-" <<<"$ERR"
  local leftover
  leftover=$(sed -n 's/^image-page: the page is written, but \(.*\) could not be removed: .*/\1/p' <<<"$ERR")
  check "the warned directory exists: $leftover" [ -d "${leftover:-/no warned path}" ]
  check "no traceback: $ERR" no_traceback
}

f5_empty_dir_move_fails() {
  mkdir "$OUTDIR"
  run_faulty after-first-move "$OUTDIR" "$FX/wide.png" "$FX/anim.gif"
  check "exit 3 when moves fail, got $RC: $ERR" [ "$RC" = 3 ]
  check "the list moved first: $(listing "$OUTDIR")" [ "$(listing "$OUTDIR")" = ./.image-page.json ]
  run --replace "$OUTDIR" "$FX/base.jpg"
  written
  check "--replace cleared it: $(listing "$OUTDIR")" \
    [ "$(listing "$OUTDIR" | tr '\n' ' ')" = "./.image-page.json ./base.jpg ./index.html " ]
  rm -rf "$OUTDIR"
  mkdir "$OUTDIR"
  run_faulty index-move "$OUTDIR" "$FX/wide.png" "$FX/anim.gif"
  check "exit 3 when index.html cannot move, got $RC: $ERR" [ "$RC" = 3 ]
  check "everything but index.html moved: $(listing "$OUTDIR")" \
    [ "$(listing "$OUTDIR" | tr '\n' ' ')" = "./.image-page.json ./anim.gif ./wide.png " ]
  run --replace "$OUTDIR" "$FX/base.jpg"
  written
  check "nothing left beside it: $(leftovers)" [ -z "$(leftovers)" ]
}

# layout: the section, h2, grid and img lines of index.html, in order, the
# img lines cut to their src.
layout() {
  page | grep -E '<section>|<h2>|class="grid"|<img ' | sed 's/\(<img src="[^"]*"\).*/\1>/'
}

l1_sections() {
  run "$OUTDIR" "$FX/anim.gif" --section "Monat <&>" "$FX/wide.png" "$FX/base.jpg" \
    --section=Woche "$FX/prog.jpg"
  written
  check "the meta line counts every section's images: $(page | grep 'class="meta"')" \
    grep -qxF '<p class="meta">4 images · density 1</p>' "$OUTDIR/index.html"
  check "sections in order: $(layout)" [ "$(layout | grep -v grid)" = '<section>
<img src="anim.gif">
<section>
<h2>Monat &lt;&amp;&gt;</h2>
<img src="wide.png">
<img src="base.jpg">
<section>
<h2>Woche</h2>
<img src="prog.jpg">' ]
  check "each section closed: $(page | grep -c '</section>')" [ "$(page | grep -c '</section>')" = 3 ]
  run --replace "$OUTDIR" "$FX/wide.png" "$FX/anim.gif"
  written
  check "one section without a heading: $(layout)" [ "$(layout | grep -v grid)" = '<section>
<img src="wide.png">
<img src="anim.gif">' ]
  run --replace "$OUTDIR" --section Nur "$FX/wide.png"
  written
  check "a first --section leaves no section without images: $(layout)" [ "$(layout | grep -v grid)" = '<section>
<h2>Nur</h2>
<img src="wide.png">' ]
}

l2_section_usage() {
  run "$OUTDIR" "$FX/wide.png" --section
  refused_usage "--section needs a value"
  run "$OUTDIR" --section "" "$FX/wide.png"
  refused_usage "--section needs a title"
  run "$OUTDIR" --section "   " "$FX/wide.png"
  refused_usage "--section needs a title"
  run "$OUTDIR" --section --replace "$FX/wide.png"
  refused_usage "give a value that starts with - as --section=--replace"
  run "$OUTDIR" "$FX/wide.png" --section Leer
  refused_usage "--section Leer has no image after it"
  run "$OUTDIR" --section Leer --section Voll "$FX/wide.png"
  refused_usage "--section Leer has no image after it"
  run --section Vorne "$OUTDIR" "$FX/wide.png"
  refused_usage "<out-dir> comes before the first --section"
  check "the usage names --section: $ERR" grep -qF "[--section TITLE]" <<<"$ERR"
  run "$OUTDIR" --section=-x "$FX/wide.png"
  written
  check "--section=-x is the heading -x: $(layout)" grep -qxF '<h2>-x</h2>' <<<"$(layout)"
  rm -rf "$OUTDIR"
  cp "$FX/wide.png" "$ROOT/caller/--section"
  run "$OUTDIR" "$FX/anim.gif" -- --section
  written
  check "after -- it is an image: $(layout)" grep -qF '<img src="--section">' <<<"$(layout)"
}

l3_grid_layout() {
  # At 2.625: wide.png 725 px is 276 CSS px, base.jpg 641 px is 244.
  cp "$FX/base.jpg" "$ROOT/caller/other.jpg"
  run --density 2.625 "$OUTDIR" --section A "$FX/base.jpg" "$FX/wide.png" --section B "$ROOT/caller/other.jpg"
  written
  check "each grid's column is its widest image: $(page | grep 'class="grid"')" \
    [ "$(page | grep 'class="grid"')" = '<div class="grid" style="--col:276px">
<div class="grid" style="--col:244px">' ]
  check "the page as wide as section A in one row, 276+24+276: $(page | grep '<main')" \
    grep -qxF '<main class="page" style="--page:576px">' "$OUTDIR/index.html"
  check "the header first inside the page" [ "$(page | grep -A1 '^<main' | tail -1)" = '<header>' ]
  # The 24px column gap is the one the page width above counts.
  check "the grid fits columns of --col, never wider than the screen" \
    grep -qF '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--col)),var(--col)));gap:32px 24px;' "$OUTDIR/index.html"
  check "the page centered, at least 40rem" \
    grep -qF '.page{width:100%;max-width:max(40rem,var(--page));margin-inline:auto' "$OUTDIR/index.html"
  check "each image still at its real size: $(img_width wide.png)" [ "$(img_width wide.png)" = 276 ]
  run --replace --density 2.625 "$OUTDIR" --section A "$ROOT/caller/other.jpg" --section B "$FX/base.jpg" "$FX/wide.png"
  written
  check "the widest section counts when it is not first: $(page | grep '<main')" \
    grep -qxF '<main class="page" style="--page:576px">' "$OUTDIR/index.html"
}

missing=0
for CASE in "${CASES[@]}"; do
  if ! declare -F "$CASE" >/dev/null; then
    echo "FAIL $CASE: listed in CASES, but no such function"
    missing=1
  fi
done
[ "$missing" = 0 ] || exit 1

in_cases() {
  local name
  for name in "${CASES[@]}"; do [ "$name" = "$1" ] && return 0; done
  return 1
}

all=("${CASES[@]}")
[ $# -gt 0 ] && all=("$@")
for CASE in "${all[@]}"; do
  FAILED=0
  OUTDIR=$ROOT/page
  rm -rf "$OUTDIR" "$ROOT/caller" "$ROOT/served" "$ROOT/a" "$ROOT/b" "$ROOT/deep" "$ROOT/plain-file" \
    "$ROOT/fresh" "$ROOT/empty" "$ROOT/folder.png" "$ROOT/two words&more.png" "$ROOT/locked" \
    "$ROOT"/.image-page-*
  mkdir -p "$ROOT/caller"
  if in_cases "$CASE"; then
    "$CASE"
  else
    fail "no such case"
  fi
  if [ "$FAILED" = 0 ]; then echo "PASS $CASE"; else failures=$((failures + 1)); fi
done
[ "$failures" = 0 ]
