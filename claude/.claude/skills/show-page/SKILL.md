---
name: show-page
description: Show the user a page or images in their browser — renders, screenshots, mockups, report pages, prototypes — designed first, then served on the home network. Use whenever you are about to show the user something to look at, in any repo, before you write the page.
---

# Show a page

A page the user looks at gets the craft of a Claude Artifact: written after the **design pass**, self-contained, served from this machine with `preview-serve` and handed over as a link.

## 1. Build it

**The design pass.** Load the `artifact-design` skill and apply its design guidance to every page you style yourself. Its Page contract (the Artifact tool's own rules) and its publishing steps belong to the Artifact tool and stay there. Here the page is a whole document of its own (doctype, charset and viewport meta) and self-contained: CSS and scripts inline, images beside it, an external request only for a library the page needs. A page inside an existing app, such as a prototype mounted in one of its screens, takes that app's styles instead.

**Use the width.** A page you build is centered and uses the screen's width: images and mockup screens flow in a wrapping grid, as many side by side as fit at their real size, one column on a phone, and the page never scrolls sideways.

**Images** (renders, screenshots, photos, before and after): `image-page [--density D] [--title T] <dir> [--section TITLE] <image>[::caption] ...` copies them into `<dir>` and writes an `index.html` that lays them out that way, captioned, at their real size; `--section TITLE` before a group of images gives the images that belong together a heading and rows of their own. Its page already follows that guidance, so use it as it is. `--density` is the density a device drew the image at: a render's own (an Android render's, such as 2.625), and for a screenshot the scale of the screen it was taken on (a phone's density, a desktop's scale factor). Photos take none. The rest, `--replace` among it, is in the header of `~/.local/bin/image-page`.

**Mockups and other pages** are written by hand, after the design pass:

- Only a design canvas stacks its screens one below the other, as it cannot scroll sideways, not even with Shift+scroll: there every artboard takes the same `x`, and `y` steps by the artboard's height plus 120 px.
- A mockup is a specification, and an implementer takes measurements from it. So every string, value and width in it comes from the code that produces it (the formatter, the registration call, the API field), read before you draw. A width that matters is measured from the font tables or the live DOM. A page drawn inside another program takes the host's styles and its real viewport: measure the live page first.

## 2. Serve it

- `<dir>` is a directory of its own in the session scratchpad, holding only the files shown, as copies. One topic, one page: when the topic gets new images, rewrite that page with every image it should show (`image-page --replace`; the new page shows only the images given).
- `preview-serve <dir>` prints the link and the server's PID. A dev server binds to the address and port `preview-serve --addr` prints, and you stop it yourself: `preview-serve --stop` knows only its own servers.
- Fetch the link with `curl` from this machine before you hand it over, and the first time you serve from a machine, ask the user whether it opens on their device. A firewall port is the user's to open.
- When `image-page` or `preview-serve` exits non-zero (a refusal, a page it could not write, every port taken, a server that did not come up), or the reachability check fails, tell the user what it said; a way around it is the user's call.

## 3. Hand it over

The link goes in the message, before the question about the page. Once the user is done with it, stop the server: `preview-serve --stop <pid>`.
