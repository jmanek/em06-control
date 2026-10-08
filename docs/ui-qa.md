# UI QA procedure

Run `npm test`, `node --check web/app.js`, `git diff --check`, and `npm run ui:qa` before pushing a UI change.

`npm run ui:qa` starts a local static server, opens the app in a real browser, checks for page and sidebar overflow, verifies the profile header stays compact, verifies the mouse remains large, and saves a browser screenshot under `output/playwright/`.

After the automated check passes, visually inspect the screenshot at desktop width and, when layout changes are involved, repeat the browser check at a narrow width. The visual checklist is:

- The mouse image and clickable key hotspots are the dominant interaction.
- The selected-control editor is readable without competing with the mouse.
- Sidebar labels, badges, buttons, and dropdowns stay inside their panels.
- Related controls line up on a shared baseline and use the same spacing as neighboring panels.
- Helper text is short, useful, and does not create unnecessary vertical bulk.
- Disabled, unloaded, loaded, and unsaved states remain visually distinct.
- No new horizontal scrollbar, clipped label, awkward overlap, or unexplained empty space appears.

Only after both the automated checks and the screenshot review pass should the change be committed and pushed.
