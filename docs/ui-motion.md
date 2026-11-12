# Motion in the UI

*November 2026.* The rule: **nothing jumps**. When something appears, leaves, moves or changes number, it
eases to its new state, so the eye can follow what happened. Everything respects the phone's **Reduce
motion** setting (CSS animations and transitions are switched off, and the JavaScript helpers skip their work).

## Where it applies

| Where | What used to happen | Now |
|---|---|---|
| **Today list** | A completed row vanished (with "hide completed" on) and everything below snapped up | The row fades and slides out (and can't be tapped meanwhile); the rows under it glide up; the panel shrinks smoothly, so the stat cards and charts below it **move up with it** |
| Today: row comes back (Undo, filter, new habit) | Popped in | Eases in |
| Today: time-of-day sections, stacked habits, category filter | Rows jumped to the new order | Rows glide to their new place |
| **Numbers** (Today %, month %, best streak, "N to go", goal %, recap %) | Snapped | Count to the new value (the first value on a page load shows at once) |
| **Charts**: bars, rings, progress bars | Drawn at full size | Bars grow from the baseline and move to new heights; rings and progress bars fill; lines draw themselves once |
| **Stats panels** (recap, goals, patterns, insights) | Content swaps changed the height instantly | Height eases; the panels below follow |
| **Habit grid** | A reorder (drag) or filter change reshuffled instantly | Rows glide |
| **Stats "Customize"** | Moving a section swapped it | The section slides to its place |
| **Tabs** (phone) | The new page slid in; the old one vanished | Old page fades out while the new one slides in (browsers with View Transitions); the tab bar stays put |
| **Theme change** | Colours flipped | The whole page crossfades |
| **Popups** (editor, Take a break, Journal, Archived, Welcome, palette, habit window) | Appeared and disappeared instantly | Backdrop fades, panel rises in; on close they fade away and ignore clicks while they do |
| Undo snackbar | Appeared and vanished | Springs up, slides away |
| Buttons, chips, inputs | Hover and press flipped state | Short colour/press transitions |

Left as they were on purpose: the habit editor's height when a field set changes (it is a sticky-footer
form in a scrolling popup, where animating its height fights the footer), and the Groups popup's exit.

## The toolkit

`frontend/src/lib/motion.ts` and `frontend/src/components/Motion.tsx`:

| | |
|---|---|
| `useFlip(containerRef)` | After every render, children marked `data-flip="key"` that ended up elsewhere glide from where they were (the FLIP technique, with the Web Animations API). Positions are measured relative to the container, so scrolling or resizing is not mistaken for a move |
| `useExitList(items, key, ms)` | Keeps a removed item around as a *leaving* ghost for `ms`, in its old position, so it can play an exit animation |
| `<AutoHeight>` | Wraps a block whose content height changes; animates the wrapper's height (clipping only while it runs) so everything below glides |
| `<Num value suffix>` / `useTween` | A number that eases to its new value |
| `usePresence(open, ms, snapshot?)` | Keeps a popup mounted for `ms` after it closes (with the last content, if the state was cleared) |
| `useMountedFlag()` | False on first paint, true just after: lets a CSS transition run from "before" on mount (bars, rings) |
| `withViewTransition(change, dir)` | Runs a state change inside a View Transition where supported (tab change, theme) |

The CSS half is at the end of `index.css`: keyframes (`row-in`, `row-out`, `modal-in`, `toast-in`, …), the
`--ease` curves, the chart transitions and the View Transition rules. New popups need no code: anything inside
`.backdrop` gets the entrance for free; add `data-closing` (via `usePresence`) for the exit.

## Tests

`frontend/src/lib/motion.test.ts` covers the pure parts (where a leaving row keeps its place, the easing).
`e2e/tests/motion.spec.ts` checks the behaviour in a real browser: after completing a habit the content below
moves up through intermediate positions (never in one jump, never backwards), the leaving row is inert and then
removed, numbers pass through intermediate values, bars scale in, popups are marked closing and ignore clicks
before they are removed, and with Reduce motion on rows leave at once with no ghost.
