# vendor

Reference clones, not part of the product and not committed.

- `cua/`: shallow clone of https://github.com/trycua/cua at commit `0147fb8d42c332a492c2154804069134f4e25e9c` (2026-11-14). The app consumes Cua through the published `@trycua/cua` package; the only code copied from here is the browser stream viewer (see `docs/hackathon/spec/workstreams.md`, W6).
- `_research/`: shallow clones read during research (agent harnesses, Synthesia quickstarts). Safe to delete.

Re-create: `git clone --depth 1 https://github.com/trycua/cua.git vendor/cua`
