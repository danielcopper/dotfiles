---
name: show-page
description: Show the user a page or images in their browser — renders, screenshots, mockups, report pages, prototypes — designed first, then served on the home network. Use whenever you are about to show the user something to look at, in any repo, before you write the page.
---

# Show a page

A page the user looks at gets the craft of a Claude Artifact: written after the **design pass**, self-contained, served from this machine with `preview-serve` and handed over as a link.

## 1. Build it

**The design pass.** Load the `artifact-design` skill and apply its design guidance to every page you write. Its publishing parts belong to the Artifact tool and stay there: the publish skeleton, the title and icon contract, the CDN allow-list. Here the page is a whole document of its own (doctype, charset and viewport meta) and self-contained: CSS and scripts inline, images beside it, an external request only for a library the page needs.

**Images** (renders, screenshots, photos, before and after): `image-page [--density D] [--title T] <dir> <image>[::caption] ...` copies them into `<dir>` and writes an `index.html` that stacks them, captioned, at their real size; its page has been through the design pass already. `--density` is the density a device render was drawn at (an Android render's own, such as 2.625); photos and screenshots take none. The rest, `--replace` among it, is in the header of `~/.local/bin/image-page`.

**Mockups and other pages** are written by hand, after the design pass:

- Screens stack in one column, one below the other: the user cannot scroll sideways, not in a browser and not in a design canvas (there every artboard takes the same `x`, and `y` steps by the artboard's height plus 120 px).
- A mockup is a specification, and an implementer takes measurements from it. So every string, value and width in it comes from the code that produces it (the formatter, the registration call, the API field), read before you draw. A width that matters is measured from the font tables or the live DOM. A page drawn inside another program takes the host's styles and its real viewport: measure the live page first.

## 2. Serve it

- `<dir>` is a directory of its own in the session scratchpad, holding only the files shown, as copies. One topic, one page: new images for the topic update that page (`image-page --replace`).
- `preview-serve <dir>` prints the link and the server's PID. A dev server binds to the address and port `preview-serve --addr` prints, and you stop it yourself: `preview-serve --stop` knows only its own servers.
- When `preview-serve` refuses or reports (a directory refused, every port taken), tell the user what it said; a way around it is the user's call.
- Fetch the link with `curl` from this machine before you hand it over. The first time you serve from a machine, ask the user whether it opens on their device; when it does not, say so, and leave the firewall to the user.

## 3. Hand it over

The link goes in the message, before the question about the page. Once the user is done with it, stop the server: `preview-serve --stop <pid>`.
