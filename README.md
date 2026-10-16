# Issue #1667: reproducible browser verification

This evidence-only branch accompanies product commit [`384c4fb95f98c736b8d3e6298279d6113098e1e3`](https://github.com/soarhill/TencentDB-Agent-Memory/commit/384c4fb95f98c736b8d3e6298279d6113098e1e3). It is deliberately outside the product PR: the fix changes only `TabBar/index.tsx` and two translation resources. No test framework, package dependency, or lockfile change is required in the product.

The scripts use a real Chrome browser through **Playwright CLI 0.1.22**. Input is sent with browser keyboard/mouse APIs; React event handlers are never called directly. Treat the results as a scenario matrix, not 30 distinct behaviors, coverage percentage, or a comparison with another contributor's test count.

## Reproduce

Requirements: Git, Node.js >=22.16, npm, an installed Google Chrome, and network access for `npm ci` and the pinned external CLI package. Recorded environment: Windows 10, Node 24.21.0, npm 11.19.0, Vite 6.4.3, Chrome 155.0.8059.80. Only Chrome was run. The Node harness is portable, but other operating systems/browsers have not been verified.

Use sibling directories (commands below contain no author-machine paths):

```sh
git clone --single-branch --branch codex/issue-1667-tab-keyboard https://github.com/soarhill/TencentDB-Agent-Memory.git agent-memory
git -C agent-memory checkout --detach 384c4fb95f98c736b8d3e6298279d6113098e1e3
git clone --single-branch --branch codex/issue-1667-evidence https://github.com/soarhill/TencentDB-Agent-Memory.git tab-keyboard-evidence
cd agent-memory/MemoryPanel/web
npm ci --no-audit --no-fund
cd ../../..
```

Terminal 1, from the directory containing both clones:

```sh
node tab-keyboard-evidence/serve.mjs ./agent-memory/MemoryPanel/web
```

Terminal 2:

```sh
cd tab-keyboard-evidence
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=tab-review open http://127.0.0.1:5174/__tab-keyboard --browser chrome --headed
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=tab-review run-code --filename check.js --raw > fixed-rerun.json
node -e "const r=JSON.parse(require('fs').readFileSync('fixed-rerun.json','utf8').replace(/^\uFEFF/,'')); if(r.passed!==30 || r.results.length!==30 || r.pageErrors.length || r.failedRequests.length || r.httpErrors.length) process.exit(1); console.log('PASS: 30 scenarios');"
```

The explicit JSON check matters: a CLI transport exit code alone must not be treated as a scenario pass. A failed assertion or invalid/error result must not be reported as green.

Port **5174** must be free. The server binds to loopback and uses strictPort; it never silently moves to a different port. For headless use, omit `--headed`.

### Baseline control

Stop Terminal 1 with Ctrl+C, then restart it with:

```sh
node tab-keyboard-evidence/serve.mjs ./agent-memory/MemoryPanel/web --baseline
```

`--baseline` loads the original TabBar from upstream commit `e9a82935b52741e0c798c75326e90b7144eb4d5f` with `git show`, through a Vite load hook. It does **not** edit the checkout or merely toggle the new condition in memory. All other harness/dependency code is unchanged. The original TabBar does not use the new translation entries. This is a targeted original-component control, not a full checkout of the old application.

The clone must contain that baseline commit (the non-shallow clone above does). From Terminal 2:

```sh
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=tab-review run-code --filename baseline.js --raw > baseline-rerun.json
node -e "const r=JSON.parse(require('fs').readFileSync('baseline-rerun.json','utf8').replace(/^\uFEFF/,'')); if(r.reproduced!==4 || !r.results.every(x=>x.defectReproduced)) process.exit(1); console.log('REPRODUCED: 4 original keyboard failures');"
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=tab-review close
```

These four controls expect the defect; they are not included in the 30 fixed scenarios. Each observes parent navigation once, cancelled keydown, no close callback/native click, and the target tab remaining. Restart without `--baseline` before rerunning `check.js`.

## What is asserted

| Suite | Matrix entries | Evidence |
| --- | ---: | --- |
| Component close | 12 = 2 languages × 2 active states × 3 inputs | Native Enter/Space/mouse; one `onClose('wiki')`, one native close click, zero parent `onNavigate`, intended tab removed; exact key captured and uncancelled for keyboard; no keydown for mouse. |
| Container activation | 4 = 2 languages × 2 keys | Container Enter/Space activates once, preserves preventDefault for the container, does not close. |
| Live language update | 1 | Exported application language API changes English→Chinese→English; visible label and accessible name update on the same mounted tab/document, with no navigation/closure. |
| ConsoleLayout integration | 12 = 2 languages × 2 active states × 3 inputs | Production `openPages`, `closePage`, and navigation callbacks. Active Wiki closes and falls back exactly once to `/code`; inactive Wiki closes with no route change. Exact memory-router history, selected tab and remaining tabs are asserted. |
| Focus and Space release | 1 | Each Tab step: Task Board → Wiki → Wiki close → Code → Code close; Shift+Tab returns to Wiki close. Space down does not activate; Space up produces one native click/close and no parent navigation. |
| **Total** | **30 unique scenario identifiers** | Assertions run before an entry is added. The script rejects duplicate identifiers or a missing/unexpected matrix size. |

The same action in component and integration suites intentionally verifies two different contracts: exact callback counts versus production layout state/routing. Language/active/input combinations are parameterized repetitions, not independent new behaviors.

## Boundaries and diagnostics

- Component mode imports the product TabBar unchanged and instruments its supplied callbacks. Integration mode imports the real ConsoleLayout; it does not duplicate `closePage`.
- Integration uses **React Router's memory router** and placeholder outlet controls. It validates actual layout fallback navigation, not address-bar/browser-history integration or complete App/backend end-to-end behavior.
- Empty teams are preloaded in the existing store, and `/api/v1/meta/instances` capability data is supplied locally. A running backend, user credentials, or a database is not needed.
- The language API is used programmatically. Header dropdown interaction is not exercised. The harness is rendered without React StrictMode.
- Placeholder outlet buttons are activated with Enter to prepare routes; the selected tab and rendered route are awaited before recording the close scenario. This avoids pointer/transition races in setup without forcing clicks or weakening the tested mouse-close action. Explicit waits have a 10-second timeout.
- Unhandled page exceptions, failed requests and HTTP errors fail the fixed matrix. The successful final run recorded zero of each. It still emitted existing Tea/React `forwardRef` and `findDOMNode` console warnings (reported through console.error); those are retained in the JSON and are **not** claimed to be a clean console.
- Console diagnostics preserve each message's first line and occurrence count; stack paths are omitted. Browser screenshots/traces are not asserted or presented as additional test cases.

## Recorded artifacts

- [Fixed matrix](logs/fixed.json): real event/callback/route observations for all 30 scenarios, source revision, browser version and diagnostics.
- [Original component controls](logs/baseline.json): four expected original failures; source SHA and event observations.
- [Build output](logs/build.txt): `npm run build` passed; existing chunk-size and mixed import warnings remain.
- [Lint output](logs/lint.txt): `npm run lint:check` passed, 0 errors and the same 32 pre-existing warnings.
- [Diff whitespace check](logs/diff-check.txt): passed.

Build/lint log checkout-root paths are normalized to `<repository>/`; diagnostics and results are otherwise preserved. Browser artifacts are from fresh final runs, not mixed exploratory sessions. `source.workingTree` records whether product source was dirty at server startup; the final fixed run is against the clean product commit linked above.

To repeat the product checks:

```sh
cd agent-memory/MemoryPanel/web
npm run build
npm run lint:check
git diff e9a82935b52741e0c798c75326e90b7144eb4d5f 384c4fb95f98c736b8d3e6298279d6113098e1e3 --check
```

No CI browser integration is added. These are local browser results; upstream CI and maintainer review are separate gates. Evidence is linked to an immutable evidence commit from the PR description so later branch movement cannot silently change the reviewed scripts/results.

## Verification audit

The first local 30-entry matrix was independently inspected before publication. Its arithmetic was correct, but several claims needed stronger assertions: an `every()` key check could pass with no key captured; the language scenario checked accessible names only; three Tab presses established reachability rather than the full focus sequence. The published script now asserts exact key counts/values, both visible and accessible labels on the same DOM/document, and every listed focus step. The total remains 30; extra assertions are not counted as extra scenarios.

A repeat on the clean product commit also exposed a setup timing race between React Router state and rendered tab attributes. Fixture state is now explicitly awaited, and route-opening setup uses keyboard activation of the placeholder buttons. The published final result is from the corrected script. Earlier exploratory/failed harness runs are not included in the final pass count or presented as clean diagnostics.
