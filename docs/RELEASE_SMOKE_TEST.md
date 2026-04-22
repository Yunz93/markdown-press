# Release Smoke Test

Run:

```bash
npm run smoke:release
```

What it does:

- builds the frontend production bundle
- builds the macOS `.app` bundle without generating a DMG
- verifies the expected hashed frontend assets and `.app` output exist
- prints the manual UI checklist below

Manual checklist:

1. Cold launch the packaged app and open the first file. Confirm the editor width is correct without switching tabs or view modes.
2. In Preview mode, open Outline in a non-fullscreen window. Confirm the panel appears and heading clicks jump to the correct section.
3. Compare Editor mode styling with dev: caret alignment, frontmatter colors, markdown token colors, and wrapping behavior.
4. Verify Preview navigation and attachments: `[[file]]`, `[[#heading]]`, `![[image.png]]`, and non-image attachments.
5. Click external links in Preview and confirm the system browser opens.
6. Resize the window and switch between Editor / Preview / Split. Confirm widths and outline visibility remain stable.
7. On Windows, open `Settings -> About` and verify the current version is shown correctly.
8. If the release is intended to support in-app updates, confirm the GitHub Release contains `latest.json` and updater signature assets.
9. On a Windows machine with an older installed build, confirm the app detects the new release and the in-app update flow completes.
