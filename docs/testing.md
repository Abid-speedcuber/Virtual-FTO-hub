# Testing and maintaining the simulator

Use Node 24 or newer and `npm ci`. For browser tests, either install Google Chrome,
set `CHROME_PATH` to a browser executable, or run `npx playwright install chromium`.
The test runner detects local Chrome and otherwise uses Playwright's browser.
CI uses the browser version pinned by the Playwright lockfile, unless explicitly overridden.

## Choose the check that matches the change

| Command                                               | Coverage                                                                                  | Requirements                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm test`                                            | Pure logic, geometry, keyboard, timing, recording and network-state tests                 | This repo only                                                      |
| `npm run test:browser -- tests/browser/solve.spec.js` | One browser feature                                                                       | This repo and a browser                                             |
| `npm run test:browser:smoke`                          | Representative input, persistence, compact controls, timer and recording-link regressions | This repo and a browser                                             |
| `npm run test:browser`                                | All browser regressions                                                                   | This repo and a browser                                             |
| `npm run test:integration`                            | Production build at root and `/virtual/`, plus recording averages and account flows       | This repo and a browser                                             |
| `npm run check`                                       | Formatting, lint, all unit tests and production build                                     | This repo only                                                      |
| `npm run format`                                      | Format authored source, tests and documentation                                           | This repo only                                                      |
| `npm run test:network`                                | Homepage/account/shared-backend integration across the network                            | Set `FTOERS_PUBLIC_ROOT` to the parent website's `public` directory |
| `npm run test:live`                                   | Explicit smoke test against a real backend; creates and deletes a disposable user         | Explicit service key and target URL; never part of normal checks    |

`npm run test:built` runs the standalone, recording-average and account-flow tests against an existing
`dist/` build; CI uses it after `npm run check` to avoid rebuilding twice.
Normal checks never run the live smoke test. Never put a service key in source,
public config or CI for this workflow.

Unit test concurrency is limited to two processes. Browser tests use one worker
locally and two in CI, to avoid overloading a small laptop. Override with
`--workers=2` when useful. Tests do not retry automatically to conceal failures.
The exhaustive geometry tests take longer than narrow feature tests; they remain
part of the full unit check.

Browser tests start their own Vite server on strict port 5183. They do not reuse
an existing development server. Contexts and local storage are isolated per test. Use the `createContext` fixture
for additional isolated sessions; it applies the same network guard and cleans
them up even when a test fails.
Unrelated browser tests use a small deterministic scramble worker; the dedicated
random-state suite opts into the real csTimer worker. This avoids rebuilding the
solver tables in every test while keeping real-worker integration coverage.
Account-flow checks use a minimal home-surface fixture and the real bundled account
component; the separate network checks exercise the actual parent homepage.
External requests are blocked by default; an RPC test must install explicit mocks.
Failures retain a screenshot and trace under `test-results/`; use
`npx playwright show-report` to inspect the report. CI uploads failure artifacts.

## Test contracts

- Test engine behavior with explicit bindings and an appropriate puzzle size.
  Keep assertions about actual shipped presets in dedicated preset tests.
- Use `selectSize`, `openSettings` and `openAbout` from the browser helpers. Settings
  live in the avatar menu; puzzle selection lives in the topbar dialog.
- Helpers assert that controls are visible before invoking them. Some tests freeze
  the animation clock, so navigation helpers use DOM clicks to avoid waiting on
  frozen animation frames. Pointer/keyboard interaction tests use real input.
- Assert responsive relationships and overflow rather than old, exact coordinates.
- Await observable state instead of adding arbitrary sleeps or widening timeouts.
- Do not delete or weaken a test merely because it fails. Identify whether its
  contract is stale, its setup is wrong, or it exposes a current product bug.
- Run the relevant checks once. Broaden checks for shared infrastructure changes,
  new failures or a release; do not rerun the full browser suite for wording edits.

## Source ownership

`src/` contains simulator modules; `main.js` wires them together. History rendering
lives in `time-history-ui.js`, separate from timer, statistics and recording logic.
Use Prettier and ESLint before committing. The formatting-only commit is listed
in `.git-blame-ignore-revs` so it does not obscure functional history; local Git
can use it with `git config blame.ignoreRevsFile .git-blame-ignore-revs`. Intentionally swallowed errors have
comments; wrapped errors retain their original cause.

`public/shared/` is a synchronized copy owned by the FTOers network. Do not format
or independently rewrite those files here. Update the canonical files through the
network's synchronization workflow. Vendored code and generated assets are also
excluded from formatting/linting.

CI validates changes; it does not deploy. Abid's hand testing and explicit release
approval are still required for deployment.
