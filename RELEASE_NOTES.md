# Release Notes

## Unreleased

- **Fishing mini-game:** Embed now shows the next arrow and remaining count while buttons highlight the correct input for faster play.
- **Shop commands:** Added `/bim sell` and `/bim buy` (placeholder). Sell flow supports selecting multiple fish/quantities into a cart and confirming in one transaction with button-driven UI.
- **Reliability:** Self-tests updated for the new shop helpers; image fallback and pacing improvements remain in deathroll mini-game.
- **Slash Commands:** Registered `/bim` slash command with `fish`, `sell`, and `buy` subcommands; slash invocations show fishing/shop embeds ephemerally (with public catch announcements on success).
- **Web fishing:** Added a web-based fishing minigame with moving shadow targets, tap-based catching, rarity colors, miss penalties, and audio cues.
- **Web rewards:** Added `/fishing` page flow and `/api/fishing/catch` to award fish from the shared loot table.
- **Loot table:** Shared fish loot data between Discord bot and web (`src/fish-data.js`).
- **UI updates:** Updated homepage feature cards and fishing copy, added a play link, and refreshed the Dev page with the GitHub link and project blurb.
- **Assets:** Added web sound effects and stored logo image in `web/assets`.
