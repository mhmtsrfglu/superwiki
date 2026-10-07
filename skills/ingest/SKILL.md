---
name: ingest
description: Use when the user adds or points to a source (article, paper, transcript, notes, meeting record, PDF, URL, data file) to be filed, processed or ingested into Superwiki, or invokes sw:ingest.
---

# sw:ingest

Turns one source into wiki knowledge. A source touches few files by default: its summary page, `index.md` and `log.md`. Wider cross-updates are recorded as follow-ups and done in sw:lint, so an ingest stays cheap.

## Steps

1. **Put the source in `docs/raw/`** as `<yyyy-mm-dd>-<slug>.<ext>` (date of the source if known, else today):
   - a file outside `docs/`: copy it in under that name and leave the original where it is;
   - a file already in `docs/raw/`: use it as it is;
   - a URL or pasted text: save it as markdown, with the URL on the first line.

   After this, never edit anything in `raw/`.
2. **Read the source.** Read `docs/index.md` (not the wiki pages) to see what already exists.
3. **Tell the user the three to five points worth keeping** and which existing pages they bear on, judged from the index lines. Wait for their steer unless they asked for a batch or unattended ingest.
4. **Write the summary page** `docs/wiki/<slug>.md` from `docs/.sw/templates/page.md`. The slug is lowercase words joined by hyphens, says what the source is, and is not used by any other file in the vault.
   - Frontmatter: `type: source`, a one-line `summary:`, `sources: [<raw file name>]`, `updated:` today.
   - Body: the points, each traceable to the source; a normal markdown link to the raw file; `[[links]]` to the existing pages it relates to.
5. **Check at most three existing pages** whose index line says they make a claim on the same subject. Open each, and edit it only if the source contradicts, corrects or dates what it says; add a `[[link]]` to the summary page where you edit. Everything else you noticed goes to the follow-up line in step 7. If the source introduces a concept or entity that several of its points depend on and no page covers, create that page; one or two per source at most.
6. **Add the page to `index.md`**: `- [[slug]]: summary`, under its type.
7. **Append to `docs/log.md`**, in the layout the log's last entries use (`tail -5 docs/log.md`):

   ```
   ## [YYYY-MM-DD] ingest | <source title>
   Added [[slug]]. Updated [[page-a]]. Follow-up: [[page-b]] may need the new figures; no page yet for "<concept>".
   ```

   The `Follow-up` part is where everything you noticed but did not do goes. sw:lint reads it.
8. **Run** `node docs/.sw/sw.mjs lint` and fix errors in the pages you wrote or edited.

## Several sources at once

Do steps 1 to 8 per source, in order. Skip step 3's wait after the first source if the user said to continue. Do not read all sources before writing: each one is read, filed and left.

## Common mistakes

- Reading wiki pages "for context" before writing. The index line is the context; step 5 is the only reading of existing pages.
- Rewriting many pages because the source mentions them. Mention is not change; log a follow-up.
- Copying the source into the wiki. The summary page holds what matters and links to the rest.
