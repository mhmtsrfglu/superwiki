# Contributing

Requires Node 18 or newer. There are no dependencies to install.

```bash
npm test       # builds skills/sw-init/assets/sw.mjs and viewer.html, then runs the tests
```

## Where the code is

Edit the sources in `src/`:

| File | What it is |
| --- | --- |
| `src/core.js` | the vault model, derived task state, lint and search; shared by the CLI and the viewer |
| `src/board.js` | the task list in `index.md` |
| `src/sessions.js` | finds the record an agent keeps of a session |
| `src/stats.js` | reduces a session record to cost per agent |
| `src/doctor.js` | reduces a session record to what the session started with |
| `src/cli.js` | the commands |
| `src/viewer.html` | the viewer |

`scripts/build.mjs` bundles them into `skills/sw-init/assets/sw.mjs` and `skills/sw-init/assets/viewer.html`. Those two files are generated: do not edit them.

The rest:

| Path | What it is |
| --- | --- |
| `skills/sw-*/` | the skills: a `SKILL.md` each, some with `scripts/` and `assets/` |
| `bin/superwiki.mjs` | the installer behind `npx superwiki`; `install.sh` wraps it for a clone |
| `test/` | the tests, run with `node --test` |
| `evals/` | checks of the skill texts; see `evals/README.md` |
| `examples/demo/docs` | the example vault the demo shows |

Why things are built the way they are is in [DESIGN.md](DESIGN.md).

## The demo

`node scripts/build-demo.mjs` builds the public demo into `site/`: the viewer with the example vault baked in. The Pages workflow deploys it on every push to `main`.

## Releases

Releases are cut by the `Release` workflow (Actions → Release → Run workflow). It tests, bumps the version in `package.json` and the plugin manifests, publishes to npm, tags, and creates a GitHub release. It publishes with the repository secret `NPM_TOKEN`, an npm access token allowed to publish `superwiki`.
