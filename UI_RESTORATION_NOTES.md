# UI Restoration

The original pre-redesign `index.html` and `styles.css` have been restored from the user's latest pre-redesign source archive.

The responsive redesign CSS and markup have been removed. Existing hardened main-process, preload, renderer, tracking, and storage code from the prior reviewed source has been retained.

Security compatibility: the restrictive Content Security Policy remains enabled, and remote Google Fonts loading was removed. The original font-family stacks remain in CSS and will use local system fallbacks. No remote font requests are made.

No claims are made here about live Electron GUI validation. Run `npm install` and `npm start` on the target Windows machine to verify the restored appearance and behavior.
