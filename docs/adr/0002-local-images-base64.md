# ADR-0002: Local images via base64 data URIs

## Status
Accepted

## Context
The preview must display images referenced by relative paths in markdown.
A custom `local-resource://` protocol with an asset scope is fragile to
configure in Tauri 2, and easy to get wrong (it blocked the first build
attempts).

## Decision
Resolve local image paths on the Rust side (`file_resolve_path` + a
`sensitive`-dir-aware `is_image_allowed` check) and return a **base64 `data:` URI**
via the `image_data_uri` command. The frontend swaps `<img src>` to the data URI
after rendering. This satisfies the CSP `img-src 'self' data:` rule and avoids a
custom protocol entirely.

## Consequences
- Simpler, robust image handling; no asset-protocol config.
- Large images increase preview memory; acceptable for a markdown editor.
- Remote (`http(s)`) and existing `data:` images pass through untouched.
