# Changelog

## Unreleased
- Add shop page with rod purchases, selling UI, and rod status display.
- Add rod equip endpoint and profile dropdown to select owned rods.
- Persist equipment ownership and selected rod in storage (JSON + Postgres) and ensure basic rod is always owned.
- Fix fishing tap handling to avoid double-registered input and clamp tap counter.
- Serve `/favicon.ico` to avoid 404 noise.
