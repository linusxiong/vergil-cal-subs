# Contributing

Run `bun install`, then `bun run hooks:install` to enable the local commit-message check. Run `bun run check` before submitting changes.

## Commit messages

New commits must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
feat(calendar): retain imported semesters
fix(auth): reject credentials for a different account
docs: explain subscription link rotation
```

Use `feat` for features, `fix` for fixes, and an appropriate conventional type for other changes. Add `!` after the type/scope or a `BREAKING CHANGE:` footer for breaking changes. Write commit descriptions in English. GitHub Actions checks every new commit in push and pull-request ranges; the local `commit-msg` hook checks before committing. Published history predating this policy is not rewritten.

## Translations and diagnostics

Keep UI and SEO translations in `src/locales/`, using semantic keys and i18next interpolation. English is the default language. Update both English and Simplified Chinese resources when adding interface text. Errors and diagnostic warnings remain English in every interface language. Do not translate upstream course names or other user data.

Keep documentation English by default, with `.zh-CN.md` translations linked from the English file. Never include school tokens, personal schedules, unredacted captures, or deployment secrets in contributions.
