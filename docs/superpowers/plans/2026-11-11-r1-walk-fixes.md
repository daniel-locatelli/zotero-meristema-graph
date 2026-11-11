# R1 walk fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the user's first R1 walk (2026-11-11) found in Meristema
Reading and in Meristema's Reading plan view, and add the features it asked
for.

**Architecture:** Two repos. Meristema (`meristema-zotero`) learns to ignore
Meristema Reading's mirror-tag writes, gets theme-tuned read-state colours and
a custom choice menu in the gear. Meristema Reading
(`zotero-meristema-reading`) mirrors `_unread` too, then gets the section,
drag, keyboard, sort, tab and settings fixes and a Clear Reading List entry.
The format change (`_unread`) is re-vendored into Meristema.

**Tech Stack:** TypeScript, zotero-plugin-scaffold, node unit tests
(`npm run check`), Zotero mocha suite (`npm test`), Gecko chrome HTML/CSS.

## Global Constraints

- Repos: `C:\repos\github\daniel-locatelli\meristema-zotero` (Meristema) and
  `C:\repos\github\daniel-locatelli\zotero-meristema-reading` (Meristema
  Reading). Each task names its repo.
- One feature branch per task, fast-forwarded into `main`. Never push.
- Commit subjects are sentence case, describe the change, no `feat:` prefix.
  Stage by path. Every message ends with exactly:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_011u94ZUBSZPgEppAcs8Tck8`.
- Don't work around git hooks. Never commit `.only`.
- Gate on exit codes, never through a pipe.
- `npm run check` must pass in the repo touched (prettier also checks docs;
  never split an inline code span across lines).
- `npm test` launches a dev Zotero; it may run, but in full only every 4 or 5
  commits. Isolate a case with a temporary `describe.only`, never committed.
  Wait for one `npm test` to exit before starting another.
- Never stop or kill the user's Zotero (`zotero.exe`). Tests never write to the
  user's live Zotero (ports 23119 and 23124).
- State names everywhere: Unread, Reading, Read. Mirror tags: `_unread`,
  `_reading`, `_read`.
- User decisions (2026-11-11), binding:
  - `_unread` goes only on My Library papers in a My Library folder that holds
    a reading list; a paper in no list gets no mirror tag.
  - Read-state colours: Read green, Reading yellow, Unread red, each with a
    light-theme and a dark-theme shade, red darkest, yellow lightest.
  - Clear Reading List empties the steps; the folder, the note and the papers
    stay. A warning dialog comes first.
  - Paper label setting in Meristema Reading's settings pane: "Author, year",
    "Title", "Author, year, title".
  - List tabs come back after a restart.
  - Gear selects mark their choice the way the View dropdown marks its active
    row (highlighted row, no bullet).

---

### Task 1: Meristema skips Meristema Reading's mirror writes

Repo: Meristema.

**Files:**

- Modify: `src/services/automaticUpdateCoordinator.ts`
- Test: `test/unit/automaticUpdateMarks.test.ts` (create)

**Interfaces:**

- Produces: `READING_MIRROR_MARK = "meristemaReadingMirror"` and
  `isPluginWrite(extra: Record<string, unknown> | undefined): boolean`.
  Task 4 saves mirror tags with `notifierData: { meristemaReadingMirror: true }`.

Today every mark rewrites mirror tags; the `modify` starts an automatic
citation update (a provider request) and remounts the open graph. With `_unread`
(Task 4) a first start would tag every listed paper at once.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPluginWrite,
  READING_MIRROR_MARK,
  SELF_WRITE_MARK,
} from "../../src/services/automaticUpdateCoordinator";

describe("automatic update marks", () => {
  it("skips Meristema's own writes and Meristema Reading's mirror", () => {
    assert.equal(isPluginWrite({ [SELF_WRITE_MARK]: true }), true);
    assert.equal(isPluginWrite({ [READING_MIRROR_MARK]: true }), true);
  });
  it("updates for any other modify", () => {
    assert.equal(isPluginWrite(undefined), false);
    assert.equal(isPluginWrite({}), false);
    assert.equal(isPluginWrite({ [READING_MIRROR_MARK]: false }), false);
  });
});
```

Match the import style of the other files in `test/unit/` (check one first;
if the module cannot load under node because of Zotero globals, move
`isPluginWrite` and both marks into a new pure `src/domain/pluginWrites.ts`
and re-export the marks from the coordinator).

- [ ] **Step 2: Run it and see it fail** — `npm run test:unit` (or the repo's
      unit script), expect "isPluginWrite is not a function" / import error.

- [ ] **Step 3: Implement**

```ts
export const SELF_WRITE_MARK = "meristemaSelfWrite";
/**
 * Meristema Reading saves its `_unread`, `_reading` and `_read` mirror tags
 * with this mark: a tag a citation update never reads.
 */
export const READING_MIRROR_MARK = "meristemaReadingMirror";

/** A modify written by a plugin, which no citation update needs. */
export function isPluginWrite(
  extra: Record<string, unknown> | undefined,
): boolean {
  return Boolean(extra?.[SELF_WRITE_MARK] || extra?.[READING_MIRROR_MARK]);
}
```

and in the observer replace the `SELF_WRITE_MARK` test with
`if (event === "modify" && isPluginWrite(extraData?.[String(id)])) continue;`
keeping its comment, extended by "or Meristema Reading's mirror tags".

- [ ] **Step 4:** `npm run check` exits 0.
- [ ] **Step 5:** Commit "Skip automatic citation updates for Meristema Reading's mirror tags".

---

### Task 2: Read-state colours tuned per theme

Repo: Meristema.

**Files:**

- Modify: `src/services/graphTheme.ts` (new `readState` tokens, both themes)
- Modify: `src/services/graphCategoryAssignment.ts` (`assignReadStates`)
- Test: `test/unit/graphPalette.test.ts` (validation), the existing
  read-state assignment tests (grep `read-state` under `test/unit`)

**Interfaces:**

- Produces: `GraphTheme.readState: { unread: string; reading: string; read: string }`.

- [ ] **Step 1: Tests first.** In `graphPalette.test.ts`, for both themes,
      using its existing contrast/lightness helpers (add a CIE L\* helper if
      none exists):
  - each read-state colour has contrast ≥ 3:1 against `surfaces.paper`;
  - L\*(unread) < L\*(read) < L\*(reading), each gap ≥ 8;
  - hue: unread within 0–30° (red), reading 40–65° (yellow), read 100–160°
    (green), in HSL.
    Update the read-state assignment test to expect `theme.readState.<state>`
    instead of ramp stops 0/2/4. Run, see them fail.
- [ ] **Step 2: Implement.** Starting values (adjust only if a test fails, and
      say so in the report):

```ts
// LIGHT_THEME
readState: { unread: "#b3261e", reading: "#a87f00", read: "#2f8a4a" },
// DARK_THEME
readState: { unread: "#e5534b", reading: "#e8c547", read: "#57b36c" },
```

Add `readState` to `GraphTheme` with a doc comment ("Unread red, Reading
yellow, Read green (R1, the user's call): fixed per state, apart from the
ramp; red darkest and yellow lightest, so they part without hue too."). In
`assignReadStates` use `theme.readState[state]`; delete `READ_STATE_RAMP` if
nothing else uses it, and fix the function's comment.

- [ ] **Step 3:** `npm run check` exits 0.
- [ ] **Step 4:** Commit "Colour read states red, yellow and green, tuned per theme".

---

### Task 3: The gear's selects mark their choice like View

Repo: Meristema.

**Files:**

- Create: `src/services/graphChoiceMenu.ts`
- Modify: `src/services/graphViewControls.ts` (the four `cm-select`
  builders: lines near 237, 301, 424, 495)
- Modify: `addon/content/graph.css` (`.cm-appearance-row .cm-select`, new
  `.cm-choice-*` rules reusing the View rows' `aria-checked` paint)
- Test: unit test `test/unit/graphChoiceMenu.test.ts`; update the Zotero
  cases that drive gear selects: `test/zotero/graphCitationHops.test.ts`
  (≈3407, 4424, 4517, 4594), `test/zotero/graphReadingPlan.test.ts` (≈204),
  `test/zotero/graphViews.test.ts` (≈200, 1246).

The gear's native `<select>` opens Gecko's shared select popup, which draws a
bullet on the chosen entry, and that popup is shared by every select in the
window, so it cannot be restyled for the gear alone. Replace the gear's
selects with a small custom control.

**Interfaces:**

- Produces `createChoiceMenu(document, options: ChoiceOption[], value): ChoiceMenu`
  where `ChoiceOption = { value: string; label: string; title?: string; disabled?: boolean }`
  and `ChoiceMenu` is an `HTMLElement` (a `button.cm-choice` holding the
  chosen label and a chevron) with:
  - `value: string` getter/setter (setting it does not fire `change`);
  - `options: ChoiceOption[]` (read-only), `disabled: boolean`;
  - fires a bubbling `change` `Event` when the reader picks a different value;
  - `title` of the button is the chosen option's `title`
    (the gear's tooltips describe the metric).
- Popup: a `div.cm-choice-popup` `role="listbox"` of `button.cm-choice-row`
  `role="option"` with `aria-selected` on the chosen one, painted like
  `.cm-view-row[aria-checked="true"]` (copy that rule's colours, no
  bullet, no check). It opens below the button, closes on pick, Escape, a
  click outside or blur; Up/Down move, Enter picks; disabled rows can't be
  picked.
- Keep the class `cm-select` on the button so CSS and test selectors that
  look for it keep matching; give the control `data-choice-menu`.

- [ ] **Step 1:** Read `graphViewsMenu.ts` (row painting, popup open/close
      and dismissal) and reuse its helpers where they are exported; do not
      copy logic blocks verbatim — export a shared helper instead.
- [ ] **Step 2: Failing unit test** (`graphChoiceMenu.test.ts`, use the DOM
      double the other control tests use): value set/get; picking a row fires
      one `change` and updates `value` and the label; picking the current row
      fires none; a disabled row cannot be picked; the chosen row has
      `aria-selected="true"`, others `"false"`.
- [ ] **Step 3:** Implement `graphChoiceMenu.ts`; switch the four builders
      to it. Callers that read `select.options`, `selectedOptions[0]` or
      `.value` move to the `ChoiceMenu` API.
- [ ] **Step 4:** Update the Zotero cases to pick through the control (open
      it, click the row) instead of setting `.value` and dispatching
      `change`. Run each touched file alone with a temporary `describe.only`.
- [ ] **Step 5:** `npm run check` exits 0. Commit "Mark the gear's choice
      like the View dropdown, without a bullet".

---

### Task 4: Mirror `_unread` on listed papers

Repo: Meristema Reading (format, plugin); docs in both repos.

**Files:**

- Modify: `src/format/readState.ts`
- Modify: `fixtures/states/*.json` (every `"mirror"` value `null` →
  `"_unread"`), `fixtures/README.md`
- Modify: `src/domain/mirrorPlan.ts`, `src/zotero/stateStore.ts`,
  `src/zotero/notifier.ts`
- Modify: `README.md`; Meristema's
  `docs/superpowers/specs/2026-11-06-reading-lists-design.md` §1 (mirror
  bullet) — commit that one in Meristema in Task 5.
- Test: `test/unit/mirrorPlan.test.ts`, `test/unit/readState.test.ts`,
  `test/unit/fixtures.test.ts`, `test/zotero/readState.test.ts`

**Interfaces:**

- Produces (format): `MIRROR_TAGS = { unread: "_unread", reading: "_reading", read: "_read" }`;
  `mirrorTag(state: ReadState): string` (never null).
- Produces (domain): `MirrorItem` gains `listed: boolean`; `planMirror` wants
  `mirrorTag(state)` when `state !== "unread" || item.listed`, else none.
- Consumes: Task 1's mark `meristemaReadingMirror`.

- [ ] **Step 1: Failing unit tests.**
  - `mirrorPlan.test.ts`: an Unread listed paper gains `_unread`; an Unread
    unlisted paper loses `_unread` and gets nothing; a Read paper swaps
    `_unread` for `_read`, listed or not; rewrite "takes the tags off an
    Unread paper" so it covers both cases.
  - `readState.test.ts`: `mirrorTag("unread") === "_unread"`.
  - Fixtures now expect `"_unread"` where they said `null`.
- [ ] **Step 2: Format.**

```ts
/** Tags mirrored onto papers for Zotero apps without plugins. */
export const MIRROR_TAGS = {
  unread: "_unread",
  reading: "_reading",
  read: "_read",
} as const;

export function mirrorTag(state: ReadState): string {
  return MIRROR_TAGS[state];
}
```

`fixtures/README.md`: `mirror` is `{ id: tag }`; say a store tags an Unread
paper only while it is in a reading list, and that this is the store's call,
like the group rule (near line 185).

- [ ] **Step 3: Domain.**

```ts
export interface MirrorItem {
  id: number;
  paperId: string;
  tags: readonly string[];
  /** In a reading list: only then does an Unread paper get `_unread`. */
  listed: boolean;
}
// in planMirror:
const state = stateOf(doc, item.paperId);
const wanted = state !== "unread" || item.listed ? mirrorTag(state) : null;
```

- [ ] **Step 4: Store.** In `stateStore.ts`:
  - `listedItemIDs(): Set<number>` — the regular items of every My Library
    folder that holds a list note (use `taggedNotes`/`isTaggedNote` from
    `items.ts` with `READING_LIST_TAG`, each note's `getCollections()`, then
    `Zotero.Collections.get(id).getChildItems(false, false)`); compute it once
    per `mirror()` call.
  - `mirror()` passes `listed: listed.has(item.id)`.
  - Save with
    `item.saveTx({ skipDateModifiedUpdate: true, notifierData: { meristemaReadingMirror: true } })`.
  - New `listsChanged(): Promise<void>` = `enqueue(() => mirrorAllUnlessSyncing())`.
- [ ] **Step 5: Notifier.** When a flush saw a `collection-item` event or a
      list note change (the `touchedFolders` paths), call `listsChanged()`
      once per flush. Keep the 50 ms batching.
- [ ] **Step 6: Zotero case** (in `test/zotero/readState.test.ts`, using its
      helpers): make a folder with two papers and a list; both get `_unread`;
      mark one Read: `_read` replaces `_unread`; a third paper outside any
      list stays untagged after marking it Unread; remove a paper from the
      folder: its `_unread` goes. Assert the mirror's modify events carry
      `meristemaReadingMirror` (register a test notifier observer and read
      `extraData`).
- [ ] **Step 7:** README: the mirror now covers `_unread`, on listed papers
      only. `npm run check` exits 0. Commit "Mirror Unread as \_unread on
      papers in a reading list".

---

### Task 5: Re-vendor the format into Meristema

Repo: Meristema. Depends on Task 4.

**Files:**

- Copy byte for byte: `zotero-meristema-reading/src/format/*.ts` →
  `src/readingFormat/`, `zotero-meristema-reading/fixtures/` →
  `test/fixtures/reading-format/`
- Modify: `src/readingFormat/SOURCE.md` (new commit hash)
- Modify: the spec's §1 mirror bullet: tags `_unread`, `_reading`, `_read`;
  `_unread` only on papers in a reading list.
- Fix any Meristema code that relied on `mirrorTag` returning null (grep
  `mirrorTag` and `MIRROR_TAGS` under `src/`).

- [ ] **Step 1:** Copy, then `npm run check`: the drift test and the fixture
      runner pass.
- [ ] **Step 2:** Commit "Vendor the reading format with \_unread".

---

### Task 6: Section selection and scroll

Repo: Meristema Reading.

**Files:**

- Modify: `addon/content/reading.css` (`.mr-current`)
- Modify: `src/zotero/listSection.ts` (scroll, after investigation)
- Test: `test/zotero/listSection.test.ts`

- [ ] **Step 1: Selection.** `.mr-current` uses Zotero's item-list selection:
      `background: var(--color-accent); color: var(--accent-white, #fff);`,
      with `.mr-current .mr-number, .mr-current .mr-handle, .mr-current .mr-state`
      readable on it (inherit the white). Check both themes in the dev
      Zotero the suite opens: the colour comes from Zotero's own variables.
- [ ] **Step 2: Scroll — find the cause first** (superpowers:systematic-debugging).
      The walk: with the item pane scrolled to the Reading list section,
      selecting another paper in the same folder scrolls the pane to the top.
      Write a Zotero case that scrolls the pane so the section's header is at
      the top, selects another paper of the list folder, waits for the
      section to render, and records the pane's `scrollTop` and the section's
      offset. Check, in order:
  1. does Zotero keep it when the section is pinned (click the section's
     sidenav icon first)? If pinned works and unpinned does not, that is
     Zotero's own rule for every section;
  2. does the section's `onRender` (`body.replaceChildren()`, empty first
     then full) or a `setEnabled(false)`/`setEnabled(true)` pair during the
     change unpin it or shrink the pane?
     Fix the cause in the plugin: render into the body without emptying it
     first (build the new content, then `replaceChildren(...new)`), and never
     disable a section that stays enabled. If the cause is Zotero's
     unpinned rule, keep the section in view: before the item changes
     (`onItemChange`), if the section's header was within the pane's view,
     remember its offset from the pane's top; after `onRender`, restore it.
     Record the cause in the commit message.
- [ ] **Step 3:** `npm run check`; the section's Zotero cases pass
      (`describe.only` on the file). Commit "Select in Zotero's blue, and keep
      the Reading list section in view across papers".

---

### Task 7: Drag feedback and the Not in the steps drop zone

Repo: Meristema Reading.

**Files:**

- Modify: `src/zotero/listView.ts`, `addon/content/reading.css`
- Test: `test/zotero/listSection.test.ts`, `test/zotero/listTab.test.ts`

- [ ] **Step 1: Ghost.** On `dragstart` from a handle or an unordered row,
      `event.dataTransfer.setDragImage(row, x, y)` with the pointer's offset
      inside the row, so the whole row follows the pointer; add
      `.mr-dragging` to the source row (CSS: `opacity: 0.4`).
- [ ] **Step 2: Push and pull.** While dragging over the steps list, work out
      the insertion index from the pointer's `clientY` against each row's
      midpoint and show a placeholder `li.mr-drop-slot` there, its height the
      dragged row's (`getBoundingClientRect().height`); rows move by normal
      flow, with `transition: transform 120ms` via FLIP (record each row's
      top before moving the slot, set `transform: translateY(old - new)`,
      then clear it next frame). Remove the slot on `dragleave` of the list
      (when `relatedTarget` is outside it), `drop` and `dragend`.
      The drop places the step at the slot's index: add
      `placeStepAt(steps, key, index)` to `src/domain/listEdits.ts`
      (unit-tested in `test/unit/listEdits.test.ts`: move up, move down, from
      unordered, index past the end) and use it instead of the row-target
      `placeStep` for drops.
- [ ] **Step 3: Drop zone.** Wrap the "Not in the steps" heading and its
      `ul` in one `section.mr-unordered-zone` that carries the
      `dragover`/`drop` listeners, so a drop on the heading takes the step out
      (`unplaceStep`); highlight the zone while a step is over it
      (`.mr-drop-target`: dashed accent outline).
- [ ] **Step 4: Zotero cases** (drive with `DragEvent`s as the existing drag
      cases do): a drop at the slot gives the expected order; a drop on the
      heading unplaces the step; the slot is gone after `dragend`.
- [ ] **Step 5:** `npm run check`; commit "Show where a dragged step will land,
      and take drops on the Not in the steps heading".

---

### Task 8: Alt+Up and Alt+Down work

Repo: Meristema Reading.

**Files:** `src/zotero/listView.ts`; test `test/zotero/listSection.test.ts`.

The walk: Alt+Up/Down did nothing. The handler (`listView.ts` row `keydown`)
runs only when the row itself has focus, and skips the reason field.

- [ ] **Step 1: Reproduce with real keys** (superpowers:systematic-debugging).
      A Zotero case that clicks a row's blank area (or its handle) with
      `sendMouseEvent`-style real clicks, then sends Alt+ArrowUp through
      `windowUtils`/`EventUtils.synthesizeKey` (not a dispatched
      `KeyboardEvent`, which skips Zotero's own key handlers). Find out
      whether the row gets focus from the click, and whether Zotero's
      window handlers eat Alt+Arrow first.
- [ ] **Step 2: Fix the causes found, plus:**
  - a click anywhere on a step row except the title, state toggle and
    reason focuses the row;
  - Alt+Up/Down in the reason field saves the reason (as `change` does),
    moves the step, and puts the caret back in that step's reason;
  - the handle's tooltip stays "Drag to reorder, or Alt+Up and Alt+Down".
- [ ] **Step 3:** The case from Step 1 passes with real keys from the row and
      from the reason field. `npm run check`; commit "Move a step with
      Alt+Up and Alt+Down from its row or its reason".

---

### Task 9: Re-sort the item list by Step after a reorder

Repo: Meristema Reading.

**Files:** `src/zotero/stepColumn.ts`, `src/zotero/notifier.ts`; test
`test/zotero/readingList.test.ts` (or the Step column's case).

- [ ] **Step 1: Failing Zotero case:** a list folder sorted by the Step
      column; move step 3 to 1 through `editList`; after `whenIdle()` the
      item list's row order (`ZoteroPane.itemsView.getRow(i).ref.key`)
      follows the new steps.
- [ ] **Step 2: Implement** in `refreshStepColumn()`: after
      `refreshColumns()`, for each main window whose
      `ZoteroPane.itemsView.getSortField()` equals `stepColumnKey()`, call
      `await itemsView.sort()` (check the method names in Zotero's
      `chrome/content/zotero/itemTree.jsx` for the installed version; use
      whichever re-sorts while keeping the selection). Keep the refresh count
      for the suite.
- [ ] **Step 3:** The case passes; the existing "selection never jumps" case
      still passes. `npm run check`; commit "Re-sort the item list when its
      Step order changes".

---

### Task 10: List tabs have the logo and come back after a restart

Repo: Meristema Reading.

**Files:**

- Create: `addon/content/tabIcon.css`
- Create: `src/domain/openTabs.ts` (pure record helpers),
  `test/unit/openTabs.test.ts`
- Modify: `src/zotero/listTab.ts`, `src/hooks.ts`, `addon/prefs.js`
  (create if absent, with the scaffold's prefs convention — check
  `zotero-plugin.config.ts` and Meristema's `addon/prefs.js`)
- Test: `test/zotero/listTab.test.ts`

Pattern: Meristema's graph tabs (`meristema-zotero`
`src/services/windowService.ts` ≈1569–1600 and ≈1925; `addon/content/tabIcon.css`;
`src/hooks.ts` quit observer ≈319). Tabs stay out of Zotero's session; the
plugin keeps its own record and reopens them.

- [ ] **Step 1: Icon.** `Zotero_Tabs.add({... data: { collectionID, icon: "meristema-reading-list" } })`
      and `tabIcon.css`:

```css
.icon-item-type[data-item-type="meristema-reading-list"] {
  width: 16px;
  height: 16px;
  background: url("chrome://__addonRef__/content/icons/reading.svg") center /
    16px 16px no-repeat;
}
```

loaded per window like `reading.css` (own stylesheet id) and removed on
shutdown. Check `__addonRef__` is replaced in CSS by this repo's build as it is
in Meristema's; if not, use the literal `meristemareading`.

- [ ] **Step 2: Record (pure, TDD).** `openTabs.ts`:
      `type OpenTab = { libraryID: number; collectionKey: string }`;
      `parseOpenTabs(json: string): OpenTab[]` (bad JSON or bad entries → `[]`
      / dropped), `withTab(list, tab)` (appends, no duplicates),
      `withoutTab(list, tab)`. Unit tests for each.
- [ ] **Step 3: Store it** in pref `extensions.meristemareading.openTabs`
      (default `"[]"`): add on `openListTab`, remove in `onClose` — unless the
      record is frozen. Freeze it on `quit-application-granted` (observer
      registered in `onStartup`, removed in `onShutdown`) and in
      `closeListTabs()` before it closes the tabs, so neither quitting nor
      disabling the plugin erases it.
- [ ] **Step 4: Reopen** in `onStartup` after `startListTabs()`: for each
      record, find the folder (`Zotero.Collections.getByLibraryAndKey`); if it
      exists and `listFor` finds a list, `openListTab(id, win, { select: false })`
      (add the option; the library tab stays selected); drop records that
      no longer resolve. Unfreeze afterwards.
- [ ] **Step 5: Zotero case:** open a list tab; call the plugin's shutdown
      and startup hooks the way `listSectionLife.test.ts` disables and
      re-enables; the tab is back, with the icon element's
      `data-item-type="meristema-reading-list"`; closing it by hand removes
      the record. Replace the README/test line that says the tab does not
      come back.
- [ ] **Step 6:** `npm run check`; commit "Give list tabs the logo, and
      reopen them after a restart".

---

### Task 11: A setting for how papers are labelled

Repo: Meristema Reading.

**Files:**

- Create: `addon/content/preferences.xhtml`, `addon/locale/en-US/preferences.ftl`
- Modify/create: `addon/prefs.js` (`pref("paperLabel", "author-year-title");`
  or the full key, per the scaffold convention)
- Create: `src/zotero/preferences.ts` (register the pane, read the pref,
  observe it)
- Modify: `src/domain/listNotes.ts` (`paperLabel(parts, style)`),
  `src/zotero/listStore.ts`, `src/zotero/listView.ts`, `src/hooks.ts`
- Test: `test/unit/listNotes.test.ts`, a Zotero case

**Interfaces:**

- `type LabelStyle = "author-year" | "title" | "author-year-title"`;
  `paperLabel(parts: LabelParts, style: LabelStyle): string`:
  - `"author-year"`: creator and year, `", "`-joined; empty → the title;
  - `"title"`: the title, else "Untitled";
  - `"author-year-title"`: `stepLabel(parts)`.
- The note's readable part keeps `stepLabel` (the format fixes it); only the
  views (section, tab) use the setting.

- [ ] **Step 1: Unit tests** for the three styles (and the empty-creator,
      bad-year and empty-title cases), then implement.
- [ ] **Step 2: Pane.** Register with `Zotero.PreferencePanes.register`
      (label "Meristema Reading", image the reading icon), as Meristema's
      `src/services/preferencePaneService.ts` does. One radio group,
      "Show papers as": "Author, year" / "Title" / "Author, year, title",
      bound to the pref.
- [ ] **Step 3: Views.** `listView.ts` draws titles with
      `paperLabel(partsOf(item), currentStyle())`; `listStore` keeps
      `labelOf` for the note and adds `partsOf(item)`. The list signature
      includes the style; a `Zotero.Prefs.registerObserver` on the pref calls
      `emitChange()` so open views redraw; unregister on shutdown.
- [ ] **Step 4: Zotero case:** set the pref to `"title"`: the section shows
      the title only; back to the default: author, year, title.
- [ ] **Step 5:** `npm run check`; commit "Choose how list papers are
      labelled, in Meristema Reading's settings".

---

### Task 12: Clear Reading List

Repo: Meristema Reading.

**Files:** `src/zotero/menus.ts`, `addon/locale/en-US/mainWindow.ftl`;
test `test/zotero/readingList.test.ts`.

- [ ] **Step 1: Failing Zotero case** (through the plugin's own folder menu,
      `ZoteroPane.buildCollectionContextMenu()` first; stub
      `Services.prompt` by redefining the property, and keep the stub until
      the async command ends): on a list of three steps, choosing Clear
      Reading List and confirming leaves the note with `steps: []`, the three
      papers in the folder and listed under Not in the steps, read states
      unchanged; cancelling changes nothing. The entry is hidden for a folder
      with no list and for a read-only library.
- [ ] **Step 2: Implement** a third folder entry after Open Reading List,
      l10n `meristemareading-clear-reading-list` = "Clear Reading List…",
      shown when the folder has a readable list in an editable library. On
      command:

```ts
const ok =
  Services.prompt.confirmEx(
    win,
    "Clear Reading List",
    `Clear the steps of “${topic}”? Its ${count} papers stay in the folder, under Not in the steps, and keep their read states. This cannot be undone.`,
    Services.prompt.STD_OK_CANCEL_BUTTONS,
    null,
    null,
    null,
    null,
    {},
  ) === 0;
if (ok)
  void editList(id, () => []).catch(
    failedWith(
      "Meristema Reading could not clear the reading list. See the error console.",
      win,
    ),
  );
```

(`count` = the list's step count; skip the dialog and do nothing when it is 0.)

- [ ] **Step 3:** `npm run check`; commit "Clear a reading list's steps from
      the folder menu, after a warning".

---

### Task 13: Docs and the next walk

Repo: Meristema (roadmap), Meristema Reading (README).

- [ ] Meristema Reading README: the mirror (`_unread` on listed papers), the
      settings pane, Clear Reading List, tabs coming back.
- [ ] Roadmap: tick the R1 fix entries this plan closed; replace the R1
      manual checks with what is left plus one batch for these fixes (drag
      ghost and slot, heading drop, Alt keys from row and reason, Step
      re-sort, blue selection, scroll kept, tab logo, tab back after restart,
      label setting, Clear Reading List dialog, `_unread` tags and no
      citation update on a mark, gear choice menu, read-state colours in both
      themes). Delete the "Automatic citation updates should ignore …" entry
      (Task 1 closes it). Keep entries terse.
- [ ] Delete this plan file. `npm run check` in both repos. Commit "Record
      the R1 walk fixes and what to walk next".
