# Macro Engine Working Rules

- Read and write Korean files as UTF-8. Preserve user data and unrelated changes.
- Start from `README.md` and `docs/evidence.md`. Historical decisions are available at Git tag `archive/v8-before-rebuild-2026-10-05`; they are evidence, not current requirements.
- Inspect the actual code, data boundary and user flow before choosing a change. Reconsider the requested approach when evidence contradicts it.
- Keep nutrition functions pure in `src/nutrition.js`, persistence in `src/storage.js`, history interpretation in `src/insights.js`, and browser interaction in `src/app.js`.
- Distinguish research findings, model estimates, and product choices. Never call predicted expenditure, a target, or a score a diagnosis or a physiological certainty.
- Missing values are unknown, never zero by coercion. Exercise frequency is not experience. Skeletal muscle is not fat-free mass. Unsupported clinical populations need individual care, not invented equations.
- Preserve completed day snapshots when profiles change. Never overwrite corrupt data or import a backup before validation and a visible preview.
- Verify meaningful boundaries, continuity, monotonicity, mixed sessions, missing inputs, save/restore failure, keyboard access, and narrow screens when relevant. Run `npm test` and `npm run test:e2e` before shipping.
- Explain user-visible changes and scientific limits in plain Korean first. Put file/test details after that. Record consequential decisions concisely in `docs/rebuild.md`; do not grow chains of permission gates or duplicate policy documents.
- A skill or past document does not replace engineering judgment or the latest user instruction. No automatic next task or mandatory approval ritual.
