# Reading Overview and Queue (R2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One reading queue that Claude and the user write together, and an
Overview tab in Meristema Reading that shows the queue's next paper and every
list's progress.

**Architecture:** The queue is an ordinary R1 reading list whose note also
carries the tag `meristema-reading-queue`. Two pure format functions
(`pickQueue`, `sourceLists`) and their fixtures are the contract, ported to the
skill's Python. The skill gets `reading-list --queue` and a read verb
`reading-overview`; the plugin gets an Overview tab built from a pure model
(`buildOverview`) over the existing list and state stores.

**Tech Stack:** TypeScript (Zotero 9/10 plugin, zotero-plugin-scaffold, mocha
Zotero suite, node:test unit tests), Python 3.10 stdlib (pytest with an
in-process fake of Zotero's local API).

Spec: `meristema-zotero/docs/superpowers/specs/2026-11-12-reading-overview-design.md`.

## Repos

| Short     | Path                                                                               | Branching                                                   |
| --------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| reading   | `C:\repos\github\daniel-locatelli\zotero-meristema-reading`                        | branch `r2-overview`, fast-forwarded into `main` at the end |
| skills    | `C:\repos\github\daniel-locatelli\skills` (skill at `skills/zotero/using-zotero/`) | branch `r2-overview`, fast-forwarded into `main` at the end |
| meristema | `C:\repos\github\daniel-locatelli\meristema-zotero`                                | branch `r2-overview`, fast-forwarded into `main` at the end |

## Global Constraints

- The queue tag is exactly `meristema-reading-queue`; the list tag stays `meristema-reading-list`; the JSON stays `version: 1`.
- The queue lives in My Library only; a tagged note in a group library is read as an ordinary list.
- Queue candidates are My Library notes carrying both tags that are their folder's list note (R1: oldest by date added, then key); the queue is the oldest candidate by `dateAdded`, then key, compared by code unit; the rest are duplicates.
- Source lists of a queue step: the other lists (not the queue) whose folder holds the paper, ordered by topic lowercased, then note key, by code unit; computed, never stored. My Library lists only.
- Next up is R1's rule: first Reading step, else first Unread step.
- Overview "after" steps: the steps that are not Read, in list order, without next up, at most 5.
- Progress text is exactly `{read} read · {reading} reading · {unread} left` (middle dot U+00B7 with a space each side).
- Queue empty-state strings, exactly: no queue: `No reading queue yet.`; no steps: `The queue is empty.`; every step Read: `All read.`; a list row with every step Read: `All read`.
- Overview tab title: `Reading Overview`. Menu label: `Open Reading Overview`. List-tab header link: `Reading Overview`.
- `zot.py reading-list --queue`: topic and folder default to `Reading queue`; with an existing queue, `--replace` keeps its topic and folder unless given; `--collection` naming another folder than the queue's is refused (exit 2); every `--queue` write leaves the queue's folder holding exactly the steps (papers not in the steps are taken out of that folder only).
- `zot.py reading-overview` output shape is the spec's §3 JSON, field names verbatim: `version`, `queue`, `duplicateQueues`, `lists[].note`, `library`, `topic`, `folder.key`, `folder.name`, `isQueue`, `nextUp`, `steps[].key`, `paper`, `title`, `why`, `state`, `sourceLists`. `library` is always `user`.
- Tests never write to the live Zotero (ports 23119/23124). Never stop zotero.exe.
- Commits: sentence-case subject in reading and meristema; conventional-commit subject (`feat(using-zotero): …`) in skills. Stage by path. End every message with:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011u94ZUBSZPgEppAcs8Tck8
  ```
- Gate on exit codes, never through a pipe. Run prettier on docs; never split an inline code span across lines. Never commit `.only`.
- Run the full Zotero suite (`npm test` in reading) only where a task says so; it launches a test Zotero. Wait for one run's process to exit before the next.

---

### Task 1: Queue rule and source lists in the format (reading)

**Files:**

- Create: `src/format/readingQueue.ts`
- Create: `fixtures/queue.json`
- Modify: `fixtures/index.json` (add `"queue": "queue.json"`)
- Modify: `fixtures/README.md` (Layout line, a case-file bullet, a "Reading queue" section)
- Modify: `test/unit/fixtures.test.ts` (run the queue cases; count `index.queue` in the index checks)
- Create: `test/unit/readingQueue.test.ts`

**Interfaces:**

- Produces: `READING_QUEUE_TAG`, `pickQueue(notes: readonly QueueCandidate[]): QueuePick`, `sourceLists(queueNote: string, queueKeys: readonly string[], lists: readonly SourceList[]): Record<string, string[]>`, types `QueueCandidate { key; dateAdded; library: LibraryLink; tags: readonly string[] }`, `QueuePick { queue: string | null; duplicates: string[] }`, `SourceList { note; topic; papers: readonly string[] }`.

- [ ] **Step 1: Write the fixture file** `fixtures/queue.json`:

```json
{
  "pick": [
    {
      "name": "no queue",
      "notes": [
        {
          "key": "NLSTAAAA",
          "dateAdded": "2026-11-01T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-list"]
        }
      ],
      "expect": { "queue": null, "duplicates": [] }
    },
    {
      "name": "oldest wins",
      "notes": [
        {
          "key": "NQBBBBBB",
          "dateAdded": "2026-11-03T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-list", "meristema-reading-queue"]
        },
        {
          "key": "NQAAAAAA",
          "dateAdded": "2026-11-02T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-queue", "meristema-reading-list"]
        },
        {
          "key": "NLSTAAAA",
          "dateAdded": "2026-11-01T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-list"]
        }
      ],
      "expect": { "queue": "NQAAAAAA", "duplicates": ["NQBBBBBB"] }
    },
    {
      "name": "date tie goes to the smaller key",
      "notes": [
        {
          "key": "NQZZZZZZ",
          "dateAdded": "2026-11-02T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-list", "meristema-reading-queue"]
        },
        {
          "key": "NQ222222",
          "dateAdded": "2026-11-02T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-list", "meristema-reading-queue"]
        }
      ],
      "expect": { "queue": "NQ222222", "duplicates": ["NQZZZZZZ"] }
    },
    {
      "name": "a group's tagged note is an ordinary list",
      "notes": [
        {
          "key": "NGRPAAAA",
          "dateAdded": "2026-10-01T10:00:00Z",
          "library": { "kind": "group", "id": 42 },
          "tags": ["meristema-reading-list", "meristema-reading-queue"]
        },
        {
          "key": "NQAAAAAA",
          "dateAdded": "2026-11-02T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-list", "meristema-reading-queue"]
        }
      ],
      "expect": { "queue": "NQAAAAAA", "duplicates": [] }
    },
    {
      "name": "the queue tag alone makes no list",
      "notes": [
        {
          "key": "NQAAAAAA",
          "dateAdded": "2026-11-02T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-queue"]
        }
      ],
      "expect": { "queue": null, "duplicates": [] }
    },
    {
      "name": "a note named twice counts once",
      "notes": [
        {
          "key": "NQAAAAAA",
          "dateAdded": "2026-11-02T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-list", "meristema-reading-queue"]
        },
        {
          "key": "NQAAAAAA",
          "dateAdded": "2026-11-02T10:00:00Z",
          "library": { "kind": "user" },
          "tags": ["meristema-reading-list", "meristema-reading-queue"]
        }
      ],
      "expect": { "queue": "NQAAAAAA", "duplicates": [] }
    }
  ],
  "sourceLists": [
    {
      "name": "by topic, the queue left out",
      "queueNote": "NQAAAAAA",
      "queue": ["PAPRAAAA", "PAPRBBBB", "PAPRCCCC"],
      "lists": [
        {
          "note": "NQAAAAAA",
          "topic": "Reading queue",
          "papers": ["PAPRAAAA", "PAPRBBBB", "PAPRCCCC"]
        },
        { "note": "NLSTBBBB", "topic": "beta", "papers": ["PAPRAAAA"] },
        {
          "note": "NLSTAAAA",
          "topic": "Alpha",
          "papers": ["PAPRAAAA", "PAPRBBBB"]
        }
      ],
      "expect": {
        "PAPRAAAA": ["NLSTAAAA", "NLSTBBBB"],
        "PAPRBBBB": ["NLSTAAAA"],
        "PAPRCCCC": []
      }
    },
    {
      "name": "same topic goes by note key, a list named twice counts once",
      "queueNote": "NQAAAAAA",
      "queue": ["PAPRAAAA"],
      "lists": [
        { "note": "NLSTZZZZ", "topic": "Shells", "papers": ["PAPRAAAA"] },
        { "note": "NLST2222", "topic": "shells", "papers": ["PAPRAAAA"] },
        { "note": "NLST2222", "topic": "shells", "papers": ["PAPRAAAA"] }
      ],
      "expect": { "PAPRAAAA": ["NLST2222", "NLSTZZZZ"] }
    }
  ]
}
```

Add `"queue": "queue.json"` to `fixtures/index.json` after `"nextUp"`.

- [ ] **Step 2: Write the failing unit test** `test/unit/readingQueue.test.ts`, and the fixture runner block in `test/unit/fixtures.test.ts`.

`test/unit/readingQueue.test.ts`:

```ts
import { describe, it } from "node:test";
import { expect } from "chai";
import {
  READING_QUEUE_TAG,
  pickQueue,
  sourceLists,
} from "../../src/format/readingQueue";

describe("reading queue", () => {
  it("names the tag", () => {
    expect(READING_QUEUE_TAG).to.equal("meristema-reading-queue");
  });
  it("picks nothing from nothing", () => {
    expect(pickQueue([])).to.deep.equal({ queue: null, duplicates: [] });
  });
  it("gives every queue key an entry, even with no lists", () => {
    expect(sourceLists("NQAAAAAA", ["PAPRAAAA"], [])).to.deep.equal({
      PAPRAAAA: [],
    });
  });
});
```

In `test/unit/fixtures.test.ts`: add `queue: string` to `Index`; add `index.queue` to the `listed` array in the `after` hook and to the list of top-level files in the "fixture index" test (beside `index.paperIds`, `index.nextUp`); import `pickQueue`, `sourceLists`, `QueueCandidate`, `SourceList` from `../../src/format/readingQueue`; and add:

```ts
describe("queue fixtures", () => {
  const all = json<{
    pick: {
      name: string;
      notes: QueueCandidate[];
      expect: { queue: string | null; duplicates: string[] };
    }[];
    sourceLists: {
      name: string;
      queueNote: string;
      queue: string[];
      lists: SourceList[];
      expect: Record<string, string[]>;
    }[];
  }>(index.queue);
  for (const c of all.pick) {
    it(`pick: ${c.name}`, () => {
      ran.add(index.queue);
      expect(pickQueue(c.notes)).to.deep.equal(c.expect);
    });
  }
  for (const c of all.sourceLists) {
    it(`source lists: ${c.name}`, () => {
      ran.add(index.queue);
      expect(sourceLists(c.queueNote, c.queue, c.lists)).to.deep.equal(
        c.expect,
      );
    });
  }
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npm run test:unit`
Expected: FAIL, cannot resolve `../../src/format/readingQueue`.

- [ ] **Step 4: Implement** `src/format/readingQueue.ts`:

```ts
import type { LibraryLink } from "./common";
import { READING_LIST_TAG } from "./readingList";

export const READING_QUEUE_TAG = "meristema-reading-queue";

/** A folder's list note (R1's oldest-note rule), as the queue rule sees it. */
export interface QueueCandidate {
  key: string;
  dateAdded: string;
  library: LibraryLink;
  tags: readonly string[];
}

export interface QueuePick {
  /** The queue's note key, or null when My Library has none. */
  queue: string | null;
  /** Further tagged notes, oldest first: read as ordinary lists. */
  duplicates: string[];
}

/** A list, as source lists see it: its note, topic and folder's papers. */
export interface SourceList {
  note: string;
  topic: string;
  papers: readonly string[];
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The queue: of the My Library list notes carrying both tags, the oldest by
 * date added, then key. A note named twice (in two folders) counts once.
 */
export function pickQueue(notes: readonly QueueCandidate[]): QueuePick {
  const seen = new Set<string>();
  const tagged = notes
    .filter(
      (note) =>
        note.library.kind === "user" &&
        note.tags.includes(READING_LIST_TAG) &&
        note.tags.includes(READING_QUEUE_TAG),
    )
    .filter((note) => !seen.has(note.key) && Boolean(seen.add(note.key)))
    .sort(
      (a, b) =>
        byCodeUnit(a.dateAdded, b.dateAdded) || byCodeUnit(a.key, b.key),
    );
  return {
    queue: tagged[0]?.key ?? null,
    duplicates: tagged.slice(1).map((note) => note.key),
  };
}

/**
 * For each queue step, the other lists whose folder holds its paper, by topic
 * lowercased, then note key. Computed on read, never stored.
 */
export function sourceLists(
  queueNote: string,
  queueKeys: readonly string[],
  lists: readonly SourceList[],
): Record<string, string[]> {
  const others = lists
    .filter((list) => list.note !== queueNote)
    .sort(
      (a, b) =>
        byCodeUnit(a.topic.toLowerCase(), b.topic.toLowerCase()) ||
        byCodeUnit(a.note, b.note),
    );
  const out: Record<string, string[]> = {};
  for (const key of queueKeys) {
    out[key] = [
      ...new Set(
        others.filter((list) => list.papers.includes(key)).map((l) => l.note),
      ),
    ];
  }
  return out;
}
```

- [ ] **Step 5: Document the contract** in `fixtures/README.md`:
  - Layout: the index line becomes `{ "lists": [file], "states": [file], "writes": [file], "paperIds": file, "nextUp": file, "queue": file }`.
  - Case files, a new bullet after `next-up.json`: `queue.json`: `{ "pick": [{ "name", "notes": [{ "key", "dateAdded", "library", "tags" }], "expect": { "queue", "duplicates" } }], "sourceLists": [{ "name", "queueNote", "queue": [key], "lists": [{ "note", "topic", "papers": [key] }], "expect": { key: [note] } }] }`.
  - A new section `## Reading queue` before `## Ids`, holding exactly the rules in this plan's Global Constraints for candidates, the pick and source lists, plus: "The notes given to the pick are folder list notes: a caller drops a tagged note that is not its folder's list note before the pick. A note named twice counts once. Lowercase as for unordered papers (Unicode, no locale); compare by UTF-16 code unit. `duplicates` are oldest first. Every queue key has an entry in the source lists, empty when no other list holds it."

- [ ] **Step 6: Run**

Run: `npm run check`
Expected: exit 0; the queue fixture cases and `readingQueue.test.ts` pass, the index checks pass.

- [ ] **Step 7: Commit**

```bash
git add src/format/readingQueue.ts fixtures/queue.json fixtures/index.json fixtures/README.md test/unit/fixtures.test.ts test/unit/readingQueue.test.ts
git commit -m "Add the reading queue's pick and source lists to the format"
```

---

### Task 2: Vendor the format into Meristema (meristema)

**Files:**

- Modify: `src/readingFormat/` (add `readingQueue.ts`; byte-identical copies of `zotero-meristema-reading/src/format/*.ts`)
- Modify: `test/fixtures/reading-format/` (byte-identical copy of `zotero-meristema-reading/fixtures/`)
- Modify: `test/unit/readingFormatFixtures.test.ts` (the same queue block and index changes as Task 1 Step 2, importing from `../../src/readingFormat/readingQueue`)
- Modify: `src/readingFormat/SOURCE.md` (commit hash: Task 1's short hash)

**Interfaces:**

- Consumes: Task 1's files.
- Produces: nothing new for later tasks. Meristema's Reading plan view keeps reading the queue as an ordinary list.

- [ ] **Step 1:** Copy `src/format/*.ts` to `src/readingFormat/` and `fixtures/` to `test/fixtures/reading-format/` (all files, byte for byte). See R1's vendoring commit `b3a91f5` for the shape.
- [ ] **Step 2:** Port the Task 1 runner changes into `test/unit/readingFormatFixtures.test.ts`. Keep the two differences this file already has from the sibling: the fixtures root, and `mirror: Record<string, string | null>`.
- [ ] **Step 3:** Set the hash in `SOURCE.md` to Task 1's commit, short form (`git -C ../zotero-meristema-reading log -1 --format=%h`).
- [ ] **Step 4: Run** `npm run check`. Expected: exit 0, and `readingFormatDrift.test.ts` passes, meaning the copy matches the sibling.
- [ ] **Step 5: Commit**

```bash
git add src/readingFormat test/fixtures/reading-format test/unit/readingFormatFixtures.test.ts
git commit -m "Vendor the reading format with the queue rule"
```

---

### Task 3: Port read state, the queue rule and source lists to Python (skills)

**Files:**

- Modify: `skills/zotero/using-zotero/scripts/reading_list.py`
- Modify: `skills/zotero/using-zotero/tests/test_reading_list_fixtures.py`
- Modify: `skills/zotero/using-zotero/tests/test_reading_list.py` (unit cases the fixtures miss)

**Interfaces:**

- Consumes: Task 1's fixtures. The runner finds them at `../zotero-meristema-reading/fixtures` already.
- Produces: `READ_STATE_TAG`, `READ_STATE_ATTRIBUTE`, `READING_QUEUE_TAG`, `paper_id(ref: dict) -> str`, `is_paper_id(value) -> bool`, `parse_read_state(html) -> dict`, `merge_read_states(a: dict, b: dict) -> dict`, `state_of(doc, id) -> str`, `next_up(keys: list[str], state_of_key) -> str | None`, `pick_queue(notes: list[dict]) -> {"queue", "duplicates"}`, `source_lists(queue_note, queue_keys, lists) -> dict`. Docs (`doc`) are `{"version": 1, "states": {id: {"state", "at"}}}`; `ref` is `{"doi", "library": {"kind": "user"} | {"kind": "group", "id"}, "key"}`; `pick_queue`/`source_lists` take the fixture shapes.

- [ ] **Step 1: Extend the fixture runner** so it runs the state cases, paper ids, next-up and queue cases. It must also require that exactly the indexed cases ran. Add to `test_reading_list_fixtures.py`:

```python
STATE_CASES = INDEX["states"]


def merge_all(notes):
    doc = {"version": 1, "states": {}}
    for note in notes:
        parsed = rl.parse_read_state((FIXTURES / "states" / note).read_text(encoding="utf-8"))
        assert parsed["ok"], f"{note}: {parsed}"
        doc = rl.merge_read_states(doc, parsed["value"])
    return doc


@pytest.mark.parametrize("case", STATE_CASES)
def test_state_case(case):
    c = json.loads((FIXTURES / "states" / case).read_text(encoding="utf-8"))
    want = c["expect"]
    if not want["ok"]:
        assert len(c["notes"]) == 1
        html = (FIXTURES / "states" / c["notes"][0]).read_text(encoding="utf-8")
        assert rl.parse_read_state(html) == {"ok": False, "reason": want["reason"]}
    else:
        orders = [c["notes"], list(reversed(c["notes"]))] if len(c["notes"]) > 1 else [c["notes"]]
        for notes in orders:
            doc = merge_all(notes)
            assert doc["states"] == want["states"], notes
            for pid in want["absent"]:
                assert pid not in doc["states"] and rl.state_of(doc, pid) == "unread"
            for pid, tag in want["mirror"].items():
                assert rl.MIRROR_TAGS[rl.state_of(doc, pid)] == tag
    RAN.add(f"states/{case}")


def test_paper_ids():
    for c in json.loads((FIXTURES / INDEX["paperIds"]).read_text(encoding="utf-8")):
        assert rl.paper_id(c["ref"]) == c["id"], c
        assert rl.is_paper_id(c["id"]), c
    RAN.add(INDEX["paperIds"])


def test_next_up():
    for c in json.loads((FIXTURES / INDEX["nextUp"]).read_text(encoding="utf-8")):
        assert rl.next_up(c["steps"], lambda k: c["states"].get(k, "unread")) == c["expect"], c
    RAN.add(INDEX["nextUp"])


def test_queue():
    q = json.loads((FIXTURES / INDEX["queue"]).read_text(encoding="utf-8"))
    for c in q["pick"]:
        assert rl.pick_queue(c["notes"]) == c["expect"], c["name"]
    for c in q["sourceLists"]:
        assert rl.source_lists(c["queueNote"], c["queue"], c["lists"]) == c["expect"], c["name"]
    RAN.add(INDEX["queue"])
```

Update `test_ran_exactly_the_indexed_list_cases`, the file's last test, to also want `{f"states/{c}" for c in STATE_CASES} | {INDEX["paperIds"], INDEX["nextUp"], INDEX["queue"]}`. It then skips unless every one of those tests was selected. Rename it `test_ran_exactly_the_indexed_cases`. Use `RAN` as the file already does; read the file first for its exact names.

- [ ] **Step 2: Run it to see it fail**

Run: `python -m pytest skills/zotero/using-zotero/tests/test_reading_list_fixtures.py -q`
Expected: FAIL with `AttributeError: module 'reading_list' has no attribute 'parse_read_state'` (and the like).

- [ ] **Step 3: Implement** in `reading_list.py`. Add the following after the reading-list section, and update the module docstring to say the port now covers both notes and the queue rule:

```python
# --- read state ---------------------------------------------------------------------

READ_STATE_TAG = "meristema-reading-state"
READ_STATE_ATTRIBUTE = "meristema-reading-state"
READING_QUEUE_TAG = "meristema-reading-queue"
READ_STATES = ("unread", "reading", "read")
MIRROR_TAGS = {"unread": "_unread", "reading": "_reading", "read": "_read"}
_RANK = {"unread": 0, "reading": 1, "read": 2}
_KEY_ID = re.compile(f"(?:user|group-[0-9]+):[{ITEM_KEY_CHARS}]{{8}}", re.ASCII)
_AT = re.compile(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))",
                 re.ASCII)


def paper_id(ref: dict) -> str:
    doi = normalize_doi(ref.get("doi"))
    if doi:
        return f"doi:{doi}"
    lib = ref["library"]
    return f"user:{ref['key']}" if lib["kind"] == "user" else f"group-{lib['id']}:{ref['key']}"


def is_paper_id(value) -> bool:
    if not isinstance(value, str):
        return False
    if value.startswith("doi:"):
        return normalize_doi(value[4:]) == value[4:]
    return _KEY_ID.fullmatch(value) is not None


def _days_from_civil(y: int, m: int, d: int) -> int:
    """Days since 1970-01-01 in the proleptic Gregorian calendar, year 0 included (H. Hinnant)."""
    y -= m <= 2
    era = y // 400
    yoe = y - era * 400
    doy = (153 * ((m + 9) % 12) + 2) // 5 + d - 1
    return era * 146097 + yoe * 365 + yoe // 4 - yoe // 100 + doy - 719468


def _days_in_month(y: int, m: int) -> int:
    if m == 2:
        return 29 if (y % 4 == 0 and y % 100 != 0) or y % 400 == 0 else 28
    return 30 if m in (4, 6, 9, 11) else 31


def instant_of(at) -> int | None:
    """Milliseconds since the epoch, or None off the grammar or the calendar. Never datetime."""
    if not isinstance(at, str):
        return None
    m = _AT.fullmatch(at)
    if not m:
        return None
    year, month, day, hour, minute, second = (int(g) for g in m.groups()[:6])
    oh = int(m.group(9)) if m.group(9) is not None else 0
    om = int(m.group(10)) if m.group(10) is not None else 0
    if not 1 <= month <= 12 or not 1 <= day <= _days_in_month(year, month):
        return None
    if hour > 23 or minute > 59 or second > 59 or oh > 23 or om > 59:
        return None
    millis = int((m.group(7) or "").ljust(3, "0")[:3])
    utc = ((_days_from_civil(year, month, day) * 24 + hour) * 60 + minute) * 60_000 + second * 1000 + millis
    offset = (oh * 60 + om) * 60_000
    return utc - (-offset if m.group(8) == "-" else offset)


def parse_read_state(html: str) -> dict:
    """{"ok": True, "value": {"version": 1, "states": {id: {"state", "at"}}}} or a failure; bad entries dropped."""
    block = read_versioned_block(html, READ_STATE_ATTRIBUTE)
    if not block["ok"]:
        return block
    raw = block["value"].get("states")
    if not isinstance(raw, dict):
        return dict(_BAD_SHAPE)
    states = {}
    for pid, entry in raw.items():
        if not is_paper_id(pid) or not isinstance(entry, dict):
            continue
        state, at = entry.get("state"), entry.get("at")
        if not isinstance(state, str) or state not in READ_STATES or instant_of(at) is None:
            continue
        states[pid] = {"state": state, "at": at}
    return {"ok": True, "value": {"version": 1, "states": states}}


def state_of(doc: dict, pid: str) -> str:
    entry = doc["states"].get(pid)
    return entry["state"] if entry else "unread"


def _later(a: dict, b: dict) -> dict:
    ta, tb = instant_of(a["at"]), instant_of(b["at"])
    if (ta is None) != (tb is None):
        return a if ta is not None else b
    if ta is not None and tb is not None and ta != tb:
        return a if ta > tb else b
    if _RANK[a["state"]] != _RANK[b["state"]]:
        return a if _RANK[a["state"]] > _RANK[b["state"]] else b
    return a if _code_units(a["at"]) >= _code_units(b["at"]) else b


def merge_read_states(a: dict, b: dict) -> dict:
    states = dict(a["states"])
    for pid, entry in b["states"].items():
        states[pid] = _later(states[pid], entry) if pid in states else entry
    return {"version": 1, "states": states}


def next_up(keys: list[str], state_of_key) -> str | None:
    for wanted in ("reading", "unread"):
        for key in keys:
            if state_of_key(key) == wanted:
                return key
    return None


# --- reading queue ------------------------------------------------------------------

def pick_queue(notes: list[dict]) -> dict:
    """The queue among folder list notes: My Library, both tags, oldest by dateAdded then key."""
    seen, tagged = set(), []
    for n in notes:
        if (n["library"]["kind"] == "user" and READING_LIST_TAG in n["tags"]
                and READING_QUEUE_TAG in n["tags"] and n["key"] not in seen):
            seen.add(n["key"])
            tagged.append(n)
    tagged.sort(key=lambda n: (_code_units(n["dateAdded"]), _code_units(n["key"])))
    return {"queue": tagged[0]["key"] if tagged else None, "duplicates": [n["key"] for n in tagged[1:]]}


def source_lists(queue_note: str, queue_keys: list[str], lists: list[dict]) -> dict:
    """Per queue key, the other lists holding it, by topic lowercased then note key."""
    others = sorted((l for l in lists if l["note"] != queue_note),
                    key=lambda l: (_code_units(l["topic"].lower()), _code_units(l["note"])))
    out = {}
    for key in queue_keys:
        notes = []
        for l in others:
            if key in l["papers"] and l["note"] not in notes:
                notes.append(l["note"])
        out[key] = notes
    return out
```

- [ ] **Step 4: Add unit cases** to `test_reading_list.py` for the parts the fixtures leave thin:

```python
def test_instant_handles_year_zero_and_offsets_past_the_year():
    assert rl.instant_of("0000-02-29T00:00:00Z") is not None
    assert rl.instant_of("0001-01-01T00:00:00+01:00") == rl.instant_of("0000-12-31T23:00:00Z")
    assert rl.instant_of("9999-12-31T23:59:59-01:00") == rl.instant_of("9999-12-31T23:59:59Z") + 3_600_000


def test_instant_cuts_the_fraction_and_rejects_off_calendar_times():
    assert rl.instant_of("2026-01-01T00:00:00.9999Z") == rl.instant_of("2026-01-01T00:00:00.999Z")
    for bad in ("2026-02-30T00:00:00Z", "2026-01-01T24:00:00Z", "2026-01-01T00:00:00+24:00",
                "2026-01-01T00:00:00Z\n", "2026-01-01", 1, None):
        assert rl.instant_of(bad) is None, bad


def test_unhashable_state_is_dropped_not_raised():
    html = '<pre data-meristema-reading-state="1">{"version":1,"states":{"user:ABCD2345":{"state":[],"at":"2026-01-01T00:00:00Z"}}}</pre>'
    assert rl.parse_read_state(html) == {"ok": True, "value": {"version": 1, "states": {}}}
```

- [ ] **Step 5: Run**

Run: `python -m pytest skills/zotero/using-zotero/tests -q`
Expected: every test passes, the "ran exactly the indexed cases" test included.

- [ ] **Step 6: Commit**

```bash
git add skills/zotero/using-zotero/scripts/reading_list.py skills/zotero/using-zotero/tests/test_reading_list_fixtures.py skills/zotero/using-zotero/tests/test_reading_list.py
git commit -m "feat(using-zotero): port read state and the reading queue rule to reading_list.py"
```

---

### Task 4: `zot.py reading-list --queue` (skills)

**Files:**

- Modify: `skills/zotero/using-zotero/scripts/zot.py`
- Modify: `skills/zotero/using-zotero/tests/fake_zotero.py` (a `tag` filter on `GET /api/users/0/items` and `/items/top`)
- Modify: `skills/zotero/using-zotero/tests/test_zot.py`

**Interfaces:**

- Consumes: `rl.pick_queue`, `rl.READING_QUEUE_TAG` (Task 3).
- Produces: `find_queue(cfg) -> dict` with keys `"queue"`: `{"entry", "collection"} | None` and `"duplicates"`: `[note key]`, and `folder_list_notes(cfg) -> list[{"entry", "collection"}]`. Task 5 reuses both. The reading-list result gains `"queue": bool` and `"unfiled": [key]`.

- [ ] **Step 1: Fake filter.** In `fake_zotero.py` `do_GET`, in the `/api/users/0/items` and `/items/top` branch, after the `itemType` filter:

```python
            if "tag" in q:
                rows = [d for d in rows if any(t.get("tag") == q["tag"][0] for t in d.get("tags", []))]
```

- [ ] **Step 2: Write the failing tests** in `test_zot.py`, next to the reading-list tests. Use the file's `seed`, `steps_file`, `authorize`, `run`, `writes` and the list-note helper near line 536; read them first.

```python
def queue_tags(note):
    return sorted(t["tag"] for t in note.get("tags", []))


def test_queue_makes_a_reading_queue_folder_with_both_tags(z, tmp_path, capsys, stub_doi):
    authorize(capsys, z)
    s = z.state
    code, res = run(capsys, "reading-list", "--queue", "--steps", steps_file(tmp_path, [{"key": s.paper, "why": "first"}]))
    assert code == 0, res
    assert res["queue"] is True and res["collectionCreated"] is True
    assert s.collections[res["collection"]]["name"] == "Reading queue"
    note = s.items[res["note"]]
    assert queue_tags(note) == ["meristema-reading-list", "meristema-reading-queue"]
    assert rl.parse_reading_list(note["note"])["value"]["topic"] == "Reading queue"


def test_a_second_queue_is_refused_without_replace(z, tmp_path, capsys, stub_doi):
    authorize(capsys, z)
    s = z.state
    steps = steps_file(tmp_path, [{"key": s.paper}])
    assert run(capsys, "reading-list", "--queue", "--steps", steps)[0] == 0
    code, res = run(capsys, "reading-list", "--queue", "--steps", steps)
    assert code == 2 and "--replace" in res["error"]


def test_replace_keeps_topic_and_folder_and_unfiles_dropped_papers_from_the_queue_only(z, tmp_path, capsys, stub_doi):
    authorize(capsys, z)
    s = z.state
    code, first = run(capsys, "reading-list", "--queue", "--topic", "Next up", "--steps",
                      steps_file(tmp_path, [{"key": s.paper}, {"key": s.decoy}]))
    assert code == 0, first
    col = first["collection"]
    code, res = run(capsys, "reading-list", "--queue", "--replace", "--steps",
                    steps_file(tmp_path, [{"key": s.decoy, "why": "now"}], "s2.json"))
    assert code == 0, res
    assert res["collection"] == col and res["note"] == first["note"]
    assert rl.parse_reading_list(s.items[first["note"]]["note"])["value"]["topic"] == "Next up"
    assert res["unfiled"] == [s.paper]
    assert col not in s.items[s.paper]["collections"] and s.phd in s.items[s.paper]["collections"]
    assert col in s.items[s.decoy]["collections"]


def test_replace_refuses_a_collection_other_than_the_queues(z, tmp_path, capsys, stub_doi):
    authorize(capsys, z)
    s = z.state
    steps = steps_file(tmp_path, [{"key": s.paper}])
    assert run(capsys, "reading-list", "--queue", "--steps", steps)[0] == 0
    code, res = run(capsys, "reading-list", "--queue", "--replace", "--collection", s.tmpl, "--steps", steps)
    assert code == 2 and "queue" in res["error"]


def test_queue_replace_on_a_folder_list_adds_the_queue_tag(z, tmp_path, capsys, stub_doi):
    authorize(capsys, z)
    s = z.state
    code, made = run(capsys, "reading-list", "--topic", "PhD", "--collection", s.phd, "--steps",
                     steps_file(tmp_path, [{"key": s.paper}]))
    assert code == 0, made
    code, res = run(capsys, "reading-list", "--queue", "--replace", "--collection", s.phd, "--steps",
                    steps_file(tmp_path, [{"key": s.paper}], "s2.json"))
    assert code == 0, res
    assert res["note"] == made["note"]
    assert queue_tags(s.items[made["note"]]) == ["meristema-reading-list", "meristema-reading-queue"]


def test_without_queue_topic_and_collection_are_still_required(z, tmp_path, capsys):
    authorize(capsys, z)
    code, res = run(capsys, "reading-list", "--steps", steps_file(tmp_path, [{"key": z.state.paper}]))
    assert code == 1 and "--topic" in res["error"]
```

- [ ] **Step 3: Run to see it fail**

Run: `python -m pytest skills/zotero/using-zotero/tests/test_zot.py -q -k "queue"`
Expected: FAIL: argparse rejects `--queue`.

- [ ] **Step 4: Implement** in `zot.py`.

Helpers, placed after `list_notes_in`:

```python
def folder_list_notes(cfg) -> list[dict]:
    """Every My Library list note that is its folder's list note (the oldest there), with that folder."""
    notes = get_json(cfg, "/api/users/0/items", {"tag": rl.READING_LIST_TAG, "itemType": "note"}, "list notes")
    out = []
    for e in notes:
        d = e["data"]
        if d.get("deleted") or d.get("parentItem"):
            continue
        for col in sorted(d.get("collections", [])):
            chosen = list_notes_in(cfg, col)
            if chosen and chosen[0]["key"] == e["key"]:
                out.append({"entry": chosen[0], "collection": col})
    return out


def find_queue(cfg, listed: list[dict] | None = None) -> dict:
    """{"queue": {"entry", "collection"} | None, "duplicates": [note key]}, by the format's queue rule."""
    listed = folder_list_notes(cfg) if listed is None else listed
    pick = rl.pick_queue([{"key": n["entry"]["key"], "dateAdded": n["entry"]["data"].get("dateAdded", ""),
                           "library": {"kind": "user"},
                           "tags": [t.get("tag") for t in n["entry"]["data"].get("tags", [])]} for n in listed])
    queue = next((n for n in listed if n["entry"]["key"] == pick["queue"]), None)
    return {"queue": queue, "duplicates": pick["duplicates"]}


def unfile(cfg, headers: dict, entry: dict, col: str, what: str) -> None:
    d = entry["data"]
    after = patch_item(cfg, headers, d["key"], entry["version"],
                       {"collections": [c for c in d.get("collections", []) if c != col]}, what)
    if col in after.get("collections", []):
        raise ZotError(1, f"{what}: re-read of {d['key']} still shows the collection")
```

Changes to `cmd_reading_list`:

1. At the top, replace the blank checks:

```python
    queue_mode = bool(args.queue)
    if not queue_mode and not (args.topic and args.collection):
        raise ZotError(1, "--topic and --collection are required (or pass --queue)")
    if args.topic is not None and not args.topic.strip():
        raise ZotError(1, "--topic must not be blank")
    if args.collection is not None and not args.collection.strip():
        raise ZotError(1, "--collection must not be blank")
    queue = find_queue(cfg)["queue"] if queue_mode else None
    if queue and not args.replace:
        raise ZotError(2, f"My Library already has a reading queue: note {queue['entry']['key']} in collection "
                          f"{queue['collection']}; pass --replace to rewrite it")
    topic = args.topic
```

2. Replace `col = find_folder(...)` with:

```python
    if queue:
        col = queue["collection"]
        if args.collection and find_folder(cfg, args.collection.strip()) != col:
            raise ZotError(2, f"the reading queue is in collection {col}; leave --collection out or name that one")
    else:
        col = find_folder(cfg, (args.collection or "Reading queue").strip())
```

3. After `old_notes` is read and checked, when `topic is None`, take the old topic: `topic = existing["value"]["topic"] if old_notes else "Reading queue"`. Hoist `existing` so it is defined when `old_notes` is not empty.
4. Folder creation uses `(args.collection or "Reading queue").strip()`.
5. Note write: the new-note POST tags are `[{"tag": rl.READING_LIST_TAG}] + ([{"tag": rl.READING_QUEUE_TAG}] if queue_mode else [])`. When rewriting in queue mode, the PATCH body also carries `"tags"`: the note's current tags plus `{"tag": rl.READING_QUEUE_TAG}` when it is missing.
6. After `verify_list_note`, in queue mode only, unfile and verify:

```python
    unfiled: list[str] = []
    if queue_mode:
        wanted = set(keys)
        for e in get_json(cfg, f"/api/users/0/collections/{col}/items/top", what="queue folder"):
            if is_paper(e["data"]) and e["key"] not in wanted:
                unfile(cfg, headers, e, col, "reading-list: unfile from the queue")
                unfiled.append(e["key"])
        d = get_json(cfg, f"/api/users/0/items/{note}", what=f"re-read note {note}")["data"]
        if not any(t.get("tag") == rl.READING_QUEUE_TAG for t in d.get("tags", [])):
            raise ZotError(1, f"reading-list: note {note} was written without tag {rl.READING_QUEUE_TAG}")
        held = {e["key"] for e in get_json(cfg, f"/api/users/0/collections/{col}/items/top", what="queue folder")
                if is_paper(e["data"])}
        if held != wanted:
            raise ZotError(1, f"reading-list: the queue folder holds {sorted(held)}, not the steps {sorted(wanted)}")
```

7. The result adds `"queue": queue_mode, "unfiled": unfiled`.
8. Argparse: `--topic` and `--collection` lose `required=True`. Their help says they default to "Reading queue" with `--queue`. Add `rd.add_argument("--queue", action="store_true", help="write My Library's reading queue (tag meristema-reading-queue); its folder then holds exactly the steps")`. Extend `READING_LIST_HELP` with a paragraph:

```
--queue writes My Library's reading queue: the list whose note also carries the tag
meristema-reading-queue (the oldest such list note is the queue). Topic and folder
default to "Reading queue"; with an existing queue, --replace is required, keeps its
topic and folder unless given, and refuses a --collection other than the queue's.
Every --queue write takes the papers not in the steps out of the queue's folder (and
only that folder), so the folder holds exactly the steps.
```

- [ ] **Step 5: Run**

Run: `python -m pytest skills/zotero/using-zotero/tests -q`
Expected: every test passes; the existing reading-list tests are unchanged.

- [ ] **Step 6: Commit**

```bash
git add skills/zotero/using-zotero/scripts/zot.py skills/zotero/using-zotero/tests/fake_zotero.py skills/zotero/using-zotero/tests/test_zot.py
git commit -m "feat(using-zotero): reading-list --queue writes My Library's reading queue"
```

---

### Task 5: `zot.py reading-overview`, docs and version (skills)

**Files:**

- Modify: `skills/zotero/using-zotero/scripts/zot.py`
- Modify: `skills/zotero/using-zotero/tests/test_zot.py`
- Modify: `skills/zotero/using-zotero/SKILL.md` (verbs table and a short "Reading queue" note)
- Modify: `CHANGELOG.md` (a `## 1.13.0 — <today>` entry), and the skills repo's version wherever 1.12.0 was set (find it with `git show 1cf0180 --stat` and the R1 commits)

**Interfaces:**

- Consumes: `folder_list_notes`, `find_queue` (Task 4); `rl.parse_read_state`, `rl.merge_read_states`, `rl.state_of`, `rl.paper_id`, `rl.next_up`, `rl.source_lists`, `rl.resolve_reading_list`, `rl.READ_STATE_TAG` (Task 3).
- Produces: the verb `reading-overview`, output as in the Global Constraints.

- [ ] **Step 1: Write the failing test** in `test_zot.py`:

```python
def state_note(states):
    body = json.dumps({"version": 1, "states": states}, separators=(",", ":"))
    return {"itemType": "note", "note": f'<pre data-meristema-reading-state="1">{rl.escape_html(body)}</pre>',
            "tags": [{"tag": rl.READ_STATE_TAG}], "collections": []}


def test_reading_overview_lists_every_list_with_states_next_up_and_source_lists(z, tmp_path, capsys, stub_doi):
    authorize(capsys, z)
    s = z.state
    code, phd = run(capsys, "reading-list", "--topic", "PhD", "--collection", s.phd, "--steps",
                    steps_file(tmp_path, [{"key": s.paper, "why": "core"}]))
    assert code == 0, phd
    code, q = run(capsys, "reading-list", "--queue", "--steps",
                  steps_file(tmp_path, [{"key": s.paper, "why": "start here"}, {"key": s.decoy}], "q.json"))
    assert code == 0, q
    s.add_item(state_note({"doi:10.1000/xyz123": {"state": "read", "at": "2026-11-10T09:00:00Z"}}))
    code, res = run(capsys, "reading-overview")
    assert code == 0, res
    assert res["version"] == 1 and res["queue"] == q["note"] and res["duplicateQueues"] == []
    by_note = {l["note"]: l for l in res["lists"]}
    queue, plain = by_note[q["note"]], by_note[phd["note"]]
    assert queue["isQueue"] is True and plain["isQueue"] is False
    assert queue["library"] == "user" and queue["folder"] == {"key": q["collection"], "name": "Reading queue"}
    assert [st["key"] for st in queue["steps"]] == [s.paper, s.decoy]
    first = queue["steps"][0]
    assert first == {"key": s.paper, "paper": "doi:10.1000/xyz123",
                     "title": "Planar hexagonal meshing for architecture", "why": "start here",
                     "state": "read", "sourceLists": [phd["note"]]}
    assert queue["nextUp"] == s.decoy
    assert plain["steps"][0]["sourceLists"] == [] and plain["nextUp"] is None


def test_reading_overview_with_no_lists(z, capsys):
    code, res = run(capsys, "reading-overview")
    assert code == 0 and res == {"version": 1, "queue": None, "duplicateQueues": [], "lists": []}
```

- [ ] **Step 2: Run to see it fail**

Run: `python -m pytest skills/zotero/using-zotero/tests/test_zot.py -q -k overview`
Expected: FAIL: argparse does not know `reading-overview`.

- [ ] **Step 3: Implement** in `zot.py`, after `cmd_reading_list`:

```python
def read_states(cfg) -> dict:
    """My Library's read state: every readable state note merged; unreadable ones are skipped."""
    doc = {"version": 1, "states": {}}
    notes = get_json(cfg, "/api/users/0/items", {"tag": rl.READ_STATE_TAG, "itemType": "note"}, "state notes")
    for e in notes:
        if e["data"].get("deleted") or e["data"].get("parentItem"):
            continue
        parsed = rl.parse_read_state(e["data"].get("note") or "")
        if parsed["ok"]:
            doc = rl.merge_read_states(doc, parsed["value"])
    return doc


def cmd_reading_overview(cfg, args) -> dict:
    listed = folder_list_notes(cfg)
    queue = find_queue(cfg, listed)
    queue_note = queue["queue"]["entry"]["key"] if queue["queue"] else None
    states = read_states(cfg)
    names = {c["key"]: c["data"]["name"] for c in get_json(cfg, "/api/users/0/collections", what="collections")}
    lists = []
    for n in listed:
        entry, col = n["entry"], n["collection"]
        parsed = rl.parse_reading_list(entry["data"].get("note") or "")
        if not parsed["ok"]:
            continue
        papers = [e for e in get_json(cfg, f"/api/users/0/collections/{col}/items/top", what="folder items")
                  if is_paper(e["data"])]
        by_key = {e["key"]: e["data"] for e in papers}
        resolved = rl.resolve_reading_list(parsed["value"], [{"key": k, "title": d.get("title") or ""}
                                                             for k, d in by_key.items()])
        lists.append({"entry": entry, "col": col, "topic": parsed["value"]["topic"], "by_key": by_key,
                      "steps": resolved["steps"], "papers": list(by_key)})
    sources = {}
    if queue_note:
        q = next(l for l in lists if l["entry"]["key"] == queue_note) if any(
            l["entry"]["key"] == queue_note for l in lists) else None
        if q:
            sources = rl.source_lists(queue_note, [st["key"] for st in q["steps"]],
                                      [{"note": l["entry"]["key"], "topic": l["topic"], "papers": l["papers"]}
                                       for l in lists])
    out = []
    for l in lists:
        is_queue = l["entry"]["key"] == queue_note

        def pid(key, l=l):
            d = l["by_key"][key]
            return rl.paper_id({"doi": d.get("DOI") or None, "library": {"kind": "user"}, "key": key})

        steps = [{"key": st["key"], "paper": pid(st["key"]), "title": l["by_key"][st["key"]].get("title") or "",
                  "why": st["why"], "state": rl.state_of(states, pid(st["key"])),
                  "sourceLists": sources.get(st["key"], []) if is_queue else []} for st in l["steps"]]
        by_step = {st["key"]: st["state"] for st in steps}
        out.append({"note": l["entry"]["key"], "library": "user", "topic": l["topic"],
                    "folder": {"key": l["col"], "name": names.get(l["col"], "")}, "isQueue": is_queue,
                    "nextUp": rl.next_up([st["key"] for st in steps], by_step.__getitem__), "steps": steps})
    return {"version": 1, "queue": queue_note, "duplicateQueues": queue["duplicates"], "lists": out}
```

Simplify the `q = next(...)` line to `q = next((l for l in lists if l["entry"]["key"] == queue_note), None)` when you write it. The DOI lives in `DOI` for most item types. For types that keep it in `extra: DOI:`, use the file's `item_doi(d)` helper when it takes the data dict: read it first, then use `rl.paper_id({"doi": item_doi(d), …})`.

Argparse:

```python
    ov = sub.add_parser("reading-overview", help="every Meristema Reading list with read states, next up and the queue",
                        formatter_class=argparse.RawDescriptionHelpFormatter, description=READING_OVERVIEW_HELP)
    ov.set_defaults(func=cmd_reading_overview)
```

with `READING_OVERVIEW_HELP` saying that it is read only and lists My Library's lists (groups out of scope). It gives each list's steps in order with paper id, title, why and read state, and its next up. It marks the queue, gives the queue's steps their source lists, and lists duplicate queue notes. Read it before proposing what to read next.

- [ ] **Step 4: Docs.**
  - `SKILL.md`, Read table: add `| reading-overview | every reading list: steps, read states, next up, the queue |`.
  - Write table: change the `reading-list` row (or add one) to show `reading-list --topic T --collection C --steps steps.json [--replace]` and `reading-list --queue --steps steps.json [--replace]`.
  - Add one paragraph under the tables: "**Reading queue.** One list in My Library, tagged `meristema-reading-queue`, is the user's queue across all lists. Read `reading-overview` first; propose an order with reasons; write it with `reading-list --queue --replace`. The queue's folder then holds exactly its steps. Read state is never written by the skill."
  - `CHANGELOG.md`: `## 1.13.0 — 2026-11-16` with one paragraph naming the port (read state, queue rule, every shared fixture), `--queue` and `reading-overview`.
  - Bump the version wherever 1.12.0 was set.

- [ ] **Step 5: Run**

Run: `python -m pytest skills/zotero/using-zotero/tests -q`
Expected: every test passes.

- [ ] **Step 6: Commit**

```bash
git add skills/zotero/using-zotero/scripts/zot.py skills/zotero/using-zotero/tests/test_zot.py skills/zotero/using-zotero/SKILL.md CHANGELOG.md
git commit -m "feat(using-zotero): reading-overview reads every list, its states and the queue"
```

(Also stage the version file(s) you bumped, by path.)

---

### Task 6: Open-tab record kinds and the queue flag on a folder's list (reading)

**Files:**

- Modify: `src/domain/openTabs.ts`
- Modify: `test/unit/openTabs.test.ts`
- Modify: `src/zotero/listStore.ts` (`FolderList.queueTagged`, in the signature)
- Modify: `src/zotero/listTab.ts` (records are `{ kind: "list", … }`)

**Interfaces:**

- Produces: `type OpenTab = { kind: "list"; libraryID: number; collectionKey: string } | { kind: "overview" }`; `parseOpenTabs`, `withTab`, `withoutTab` keep their signatures. `FolderList.queueTagged: boolean`: the folder's list note carries `READING_QUEUE_TAG`. It is part of `signature`, so tagging a list by hand redraws the views.

- [ ] **Step 1: Write the failing tests** (add to `test/unit/openTabs.test.ts`; update existing expectations to carry `kind: "list"`):

```ts
it("reads an entry without a kind as a list tab", () => {
  expect(
    parseOpenTabs('[{"libraryID":1,"collectionKey":"ABCD2345"}]'),
  ).to.deep.equal([{ kind: "list", libraryID: 1, collectionKey: "ABCD2345" }]);
});
it("reads the overview tab once", () => {
  expect(
    parseOpenTabs('[{"kind":"overview"},{"kind":"overview"}]'),
  ).to.deep.equal([{ kind: "overview" }]);
});
it("drops an unknown kind", () => {
  expect(parseOpenTabs('[{"kind":"graph"}]')).to.deep.equal([]);
});
it("adds and removes the overview tab", () => {
  const list = withTab([], { kind: "overview" });
  expect(list).to.deep.equal([{ kind: "overview" }]);
  expect(withoutTab(list, { kind: "overview" })).to.deep.equal([]);
});
```

- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/domain/openTabs.ts`:

```ts
/** A tab the plugin reopens after a restart: a folder's list, or the Overview. */
export type OpenTab =
  | { kind: "list"; libraryID: number; collectionKey: string }
  | { kind: "overview" };

function same(a: OpenTab, b: OpenTab): boolean {
  if (a.kind === "overview" || b.kind === "overview") return a.kind === b.kind;
  return a.libraryID === b.libraryID && a.collectionKey === b.collectionKey;
}

function copy(tab: OpenTab): OpenTab {
  return tab.kind === "overview"
    ? { kind: "overview" }
    : {
        kind: "list",
        libraryID: tab.libraryID,
        collectionKey: tab.collectionKey,
      };
}

/**
 * Reads the record of open tabs. Bad JSON reads as no tabs. An entry without
 * a kind is a list tab, from before the Overview. A list entry without a whole
 * library ID and a folder key is dropped, and so are an unknown kind and a
 * repeat.
 */
export function parseOpenTabs(json: string): OpenTab[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  let tabs: OpenTab[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { kind, libraryID, collectionKey } = entry as Record<string, unknown>;
    if (kind === "overview") {
      tabs = withTab(tabs, { kind: "overview" });
      continue;
    }
    if (kind !== undefined && kind !== "list") continue;
    if (!Number.isInteger(libraryID)) continue;
    if (typeof collectionKey !== "string" || !collectionKey) continue;
    tabs = withTab(tabs, {
      kind: "list",
      libraryID: libraryID as number,
      collectionKey,
    });
  }
  return tabs;
}

/** The record with `tab` appended, unless it is there already. */
export function withTab(list: OpenTab[], tab: OpenTab): OpenTab[] {
  if (list.some((open) => same(open, tab))) return list.map(copy);
  return [...list.map(copy), copy(tab)];
}

/** The record without `tab`. */
export function withoutTab(list: OpenTab[], tab: OpenTab): OpenTab[] {
  return list.filter((open) => !same(open, tab));
}
```

In `listTab.ts`, the record built in `openListTab` becomes `{ kind: "list", libraryID: …, collectionKey: … }`. `reopenListTabs` skips entries whose `kind` is not `"list"` but keeps them in `kept`, so Task 9 can reopen them.

In `listStore.ts`: import `READING_QUEUE_TAG` from `../format/readingQueue`. Add `queueTagged: boolean` to `FolderList` with doc comment "The list note also carries the queue tag (it may still lose the pick to an older one)". In `readList`, compute `const queueTagged = (Zotero.Items.get(pick.id) as Zotero.Item).hasTag(READING_QUEUE_TAG);`. Set it on both returned shapes, and append it to both `signature` arrays.

- [ ] **Step 4: Run** `npm run check`. Expected: exit 0.
- [ ] **Step 5: Commit**

```bash
git add src/domain/openTabs.ts test/unit/openTabs.test.ts src/zotero/listStore.ts src/zotero/listTab.ts
git commit -m "Record the kind of each open tab, and whether a list is tagged as the queue"
```

---

### Task 7: The Overview model (reading)

**Files:**

- Create: `src/domain/overview.ts`
- Create: `test/unit/overview.test.ts`

**Interfaces:**

- Consumes: `nextUp`, `ReadState` from `src/format/readState`.
- Produces (Task 9 uses these exactly):

```ts
export interface OverviewList {
  noteID: number;
  noteKey: string;
  collectionID: number;
  /** Null for My Library; a group's name otherwise. */
  libraryName: string | null;
  folderName: string;
  topic: string;
  /** Item keys in step order; empty for a list that cannot be read. */
  steps: string[];
  readable: boolean;
}
export interface Progress {
  read: number;
  reading: number;
  unread: number;
}
export interface OverviewRow {
  list: OverviewList;
  progress: Progress;
  nextUp: string | null;
}
export type QueueView =
  | { status: "none" }
  | { status: "unreadable"; list: OverviewList }
  | { status: "empty"; list: OverviewList }
  | { status: "all-read"; list: OverviewList }
  | { status: "ok"; list: OverviewList; nextUp: string; after: string[] };
export interface Overview {
  queue: QueueView;
  /** Lists also tagged as the queue that lost the pick. */
  duplicates: OverviewList[];
  /** Every list but the queue, by topic lowercased, then note key. */
  rows: OverviewRow[];
}
export const AFTER_LIMIT = 5;
export function progressText(progress: Progress): string;
export function buildOverview(input: {
  lists: OverviewList[];
  /** The queue's note ID, or null. */
  queue: number | null;
  duplicates: number[];
  stateOf: (list: OverviewList, key: string) => ReadState;
}): Overview;
```

- [ ] **Step 1: Write the failing test** `test/unit/overview.test.ts`:

```ts
import { describe, it } from "node:test";
import { expect } from "chai";
import {
  buildOverview,
  progressText,
  type OverviewList,
} from "../../src/domain/overview";
import type { ReadState } from "../../src/format/readState";

const list = (
  noteID: number,
  topic: string,
  steps: string[],
  extra: Partial<OverviewList> = {},
): OverviewList => ({
  noteID,
  noteKey: `NOTE${noteID}AAA`.slice(0, 8),
  collectionID: noteID * 10,
  libraryName: null,
  folderName: topic,
  topic,
  steps,
  readable: true,
  ...extra,
});

const states =
  (map: Record<string, ReadState>) =>
  (_list: OverviewList, key: string): ReadState =>
    map[key] ?? "unread";

describe("overview", () => {
  it("says there is no queue", () => {
    const o = buildOverview({
      lists: [list(1, "A", ["K1"])],
      queue: null,
      duplicates: [],
      stateOf: states({}),
    });
    expect(o.queue).to.deep.equal({ status: "none" });
    expect(o.rows.map((r) => r.list.noteID)).to.deep.equal([1]);
  });

  it("puts next up large and the other open steps after it, in order", () => {
    const q = list(9, "Reading queue", ["K1", "K2", "K3", "K4"]);
    const o = buildOverview({
      lists: [q],
      queue: 9,
      duplicates: [],
      stateOf: states({ K2: "reading", K4: "read" }),
    });
    expect(o.queue).to.deep.equal({
      status: "ok",
      list: q,
      nextUp: "K2",
      after: ["K1", "K3"],
    });
    expect(o.rows, "the queue is not a row").to.deep.equal([]);
  });

  it("shows at most five after next up", () => {
    const keys = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"];
    const o = buildOverview({
      lists: [list(9, "Q", keys)],
      queue: 9,
      duplicates: [],
      stateOf: states({}),
    });
    expect(o.queue.status === "ok" && o.queue.after).to.deep.equal([
      "K2",
      "K3",
      "K4",
      "K5",
      "K6",
    ]);
  });

  it("tells an empty queue from an all-read one and an unreadable one", () => {
    const empty = buildOverview({
      lists: [list(9, "Q", [])],
      queue: 9,
      duplicates: [],
      stateOf: states({}),
    });
    expect(empty.queue.status).to.equal("empty");
    const done = buildOverview({
      lists: [list(9, "Q", ["K1"])],
      queue: 9,
      duplicates: [],
      stateOf: states({ K1: "read" }),
    });
    expect(done.queue.status).to.equal("all-read");
    const broken = buildOverview({
      lists: [list(9, "Q", [], { readable: false })],
      queue: 9,
      duplicates: [],
      stateOf: states({}),
    });
    expect(broken.queue.status).to.equal("unreadable");
  });

  it("orders rows by topic, counts progress, and keeps duplicates as rows", () => {
    const o = buildOverview({
      lists: [
        list(2, "beta", ["K1", "K2", "K3"]),
        list(3, "Alpha", ["K4"]),
        list(9, "Q", ["K1"]),
        list(4, "Q2", ["K5"]),
      ],
      queue: 9,
      duplicates: [4],
      stateOf: states({ K1: "read", K2: "reading", K4: "read" }),
    });
    expect(o.rows.map((r) => r.list.noteID)).to.deep.equal([3, 2, 4]);
    expect(o.rows[1].progress).to.deep.equal({
      read: 1,
      reading: 1,
      unread: 1,
    });
    expect(o.rows[1].nextUp).to.equal("K2");
    expect(o.rows[0].nextUp, "every step read").to.equal(null);
    expect(o.duplicates.map((l) => l.noteID)).to.deep.equal([4]);
  });

  it("writes progress with middle dots", () => {
    expect(progressText({ read: 3, reading: 1, unread: 4 })).to.equal(
      "3 read · 1 reading · 4 left",
    );
  });
});
```

- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL, the module is missing.
- [ ] **Step 3: Implement** `src/domain/overview.ts`, with the interfaces above and:

```ts
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function progressText(progress: Progress): string {
  return `${progress.read} read · ${progress.reading} reading · ${progress.unread} left`;
}

export function buildOverview(input: {
  lists: OverviewList[];
  queue: number | null;
  duplicates: number[];
  stateOf: (list: OverviewList, key: string) => ReadState;
}): Overview {
  const queueList =
    input.queue === null
      ? undefined
      : input.lists.find((l) => l.noteID === input.queue);
  const rows = input.lists
    .filter((l) => l !== queueList)
    .sort(
      (a, b) =>
        byCodeUnit(a.topic.toLowerCase(), b.topic.toLowerCase()) ||
        byCodeUnit(a.noteKey, b.noteKey),
    )
    .map((l) => {
      const state = (key: string) => input.stateOf(l, key);
      const progress: Progress = { read: 0, reading: 0, unread: 0 };
      for (const key of l.steps) progress[state(key)]++;
      return {
        list: l,
        progress,
        nextUp: nextUp(
          l.steps.map((key) => ({ key })),
          state,
        ),
      };
    });
  const duplicates = input.duplicates
    .map((id) => input.lists.find((l) => l.noteID === id))
    .filter((l): l is OverviewList => Boolean(l));
  return { queue: queueView(queueList, input.stateOf), duplicates, rows };
}

function queueView(
  list: OverviewList | undefined,
  stateOf: (list: OverviewList, key: string) => ReadState,
): QueueView {
  if (!list) return { status: "none" };
  if (!list.readable) return { status: "unreadable", list };
  if (!list.steps.length) return { status: "empty", list };
  const state = (key: string) => stateOf(list, key);
  const next = nextUp(
    list.steps.map((key) => ({ key })),
    state,
  );
  if (next === null) return { status: "all-read", list };
  const after = list.steps
    .filter((key) => key !== next && state(key) !== "read")
    .slice(0, AFTER_LIMIT);
  return { status: "ok", list, nextUp: next, after };
}
```

- [ ] **Step 4: Run** `npm run check`. Expected: exit 0.
- [ ] **Step 5: Commit**

```bash
git add src/domain/overview.ts test/unit/overview.test.ts
git commit -m "Model the reading overview: the queue's next up and every list's progress"
```

---

### Task 8: Share the tab shell between list tabs and the Overview (reading)

A refactor: list tabs behave exactly as before.

**Files:**

- Create: `src/zotero/pluginTab.ts`
- Modify: `src/zotero/listTab.ts`

**Interfaces:**

- Produces:

```ts
/** Opens a plugin tab with the shell every plugin tab shares; returns the body to draw into. */
export function openPluginTab(
  win: _ZoteroTypes.MainWindow,
  spec: {
    id: string;
    type: string;
    title: string;
    icon: string;
    data?: Record<string, unknown>;
    select: boolean;
    onClose: () => void;
  },
): HTMLElement;
export function readRecord(): OpenTab[];
export function writeRecord(list: OpenTab[]): void;
export function freezeOpenTabs(): void;
/** Runs `reopen` with the record frozen, then writes back what it kept. */
export function reopenRecorded(reopen: (tabs: OpenTab[]) => OpenTab[]): void;
/** Keeps every plugin tab type in `types` out of Zotero's saved session. */
export function installTabHooks(
  win: _ZoteroTypes.MainWindow,
  types: readonly string[],
): void;
```

- [ ] **Step 1:** Move `OPEN_TABS_PREF`, `recordFrozen`, `readRecord`, `writeRecord`, `freezeOpenTabs`, `SPLITTER_IDS`, `hideContextPane`, `installTabHooks` (now with a `types` list: it filters every tab whose type, without `-unloaded`, is in `types`) and the body of `openListTab` into `pluginTab.ts`. That body covers `manager.add`, the `mr-tab-content` class, the selection listener, the splitter `MutationObserver`, and the `mr-tab-scroll` wrapper with its body. `openPluginTab` disconnects the splitter watch before it calls `spec.onClose`. `reopenRecorded(reopen)` sets the freeze, calls `reopen(readRecord())` in a try/finally that clears it, then calls `writeRecord` with the result.
- [ ] **Step 2:** `listTab.ts` keeps its own logic: `TAB_TYPE`, `views`, `titleOf`, `render`, `startListTabs`, `closeListTabs` and the list half of reopening. `openListTab` calls `openPluginTab(win, { id, type: TAB_TYPE, title, icon: TAB_ICON, data: { collectionID }, select, onClose })` and stores the returned body in `views`. `reopenListTabs` becomes `reopenListTab(tab: OpenTab & { kind: "list" }, win): boolean`, which opens one list tab and says whether it is kept. `listTab.ts` re-exports `freezeOpenTabs`. It exports `LIST_TAB_TYPE`, and `installTabHooks` is no longer exported from it.
- [ ] **Step 3:** In `hooks.ts`, `onMainWindowLoad` calls `installTabHooks(win, [LIST_TAB_TYPE])`, which Task 9 extends. Startup reopens through `reopenRecorded((tabs) => tabs.filter((tab) => tab.kind !== "list" || reopenListTab(tab, Zotero.getMainWindow())))`, wrapped in its existing try/catch with `report`. It reopens each list tab inside its own try/catch: a tab that throws is reported and dropped.
- [ ] **Step 4: Run** `npm run check`, then the list-tab suite alone: put `describe.only` on `test/zotero/listTab.test.ts`'s top `describe`, run `npm test`, then **remove the `.only`**. Expected: every list-tab case passes. Then run `npm run check` again (exit 0) and `git diff --stat`, which must show no `.only`.
- [ ] **Step 5: Commit**

```bash
git add src/zotero/pluginTab.ts src/zotero/listTab.ts src/hooks.ts
git commit -m "Share the tab shell and the open-tab record between plugin tabs"
```

---

### Task 9: The Overview tab (reading)

**Files:**

- Create: `src/zotero/overviewStore.ts` (gathers lists; builds the model)
- Create: `src/zotero/overviewView.ts` (draws the model)
- Create: `src/zotero/overviewTab.ts` (opens, redraws, reopens, closes)
- Modify: `src/zotero/listView.ts` (export `showInLibrary`, `element`, `STATE_LABEL`)
- Modify: `src/hooks.ts` (start, reopen, close; tab hooks for both types)
- Modify: `src/addon.ts` (`api.openOverview(win)`, for the suite)
- Modify: `addon/content/reading.css` (Overview styles, reusing the state colour properties)
- Create: `test/zotero/overview.test.ts`

**Interfaces:**

- Consumes: `buildOverview`, `progressText`, `OverviewList`, `Overview` (Task 7); `pickQueue` (Task 1); `listFor`, `FolderList.queueTagged` (Task 6); `openPluginTab`, `writeRecord`, `readRecord`, `withTab`, `withoutTab` (Tasks 6, 8); `openListTab` (listTab); `markItems`, `stateOfItem` (stateStore); `nextState` (listEdits); `paperLabel`, `currentStyle`, `partsOf`; `taggedNotes` (items); `onChange` (changes).
- Produces: `openOverviewTab(win, { select = true } = {}): void`, `reopenOverviewTab(win): boolean`, `startOverviewTabs(): void`, `closeOverviewTabs(): void`, `OVERVIEW_TAB_TYPE`. DOM contract for tests and Task 10: root `.mr-overview`; queue section `.mr-queue`, containing `.mr-queue-next[data-key]` (with `.mr-state`, `.mr-title`, `.mr-why`, `.mr-sources` holding one `button.mr-source[data-collection-id]` per source list), `.mr-queue-after > li.mr-queue-step[data-key]` (each with `.mr-state`, `.mr-title`), `button.mr-open-queue`, and exactly one of `.mr-queue-none`, `.mr-queue-empty`, `.mr-queue-done` or `.mr-failure` when there is no next up; `p.mr-queue-duplicate` per duplicate; lists section `.mr-overview-lists > li.mr-overview-row[data-collection-id]` with `.mr-row-topic`, `.mr-row-folder`, `.mr-row-progress`, `.mr-row-next`.

- [ ] **Step 1: Write the failing Zotero suite case** `test/zotero/overview.test.ts`. Use `makePaper`, `makeListNote`, `waitFor`, `idle` and `plugin()` from `./helpers`; `writeReadingList` from `../../src/format/readingList`; and `READING_QUEUE_TAG` from `../../src/format/readingQueue`. Set up state through a state note, as `test/zotero/paperLabel.test.ts` and the colour case in `fea27a6` do, or by marking through `plugin()`'s menu path (`markThroughMenu`). Cases:

```ts
describe("The Overview tab", function () {
  this.timeout(60_000);
  // before: two folders. "Shells" lists papers A, B; a queue folder lists
  // B, A, C; its note also carries READING_QUEUE_TAG. A is Read.
  // after: close every overview and list tab; erase the notes, papers and
  // folders made (select the library first, as readingListClear.test.ts does).

  it("shows the queue's next up, the steps after it, and each list's progress", async () => {
    // plugin().api.openOverview(win); wait for .mr-overview .mr-queue-next
    // expect .mr-queue-next[data-key] === B.key (A is Read, so B is first)
    // expect .mr-queue-after keys === [C.key]
    // expect the Shells row's .mr-row-progress text === "1 read · 0 reading · 1 left"
    // expect .mr-queue-next .mr-source text === "Shells"
  });

  it("marks next up Read and moves on to the next step", async () => {
    // click .mr-queue-next .mr-state twice (Unread → Reading → Read), idle
    // between; wait until .mr-queue-next[data-key] === C.key
  });

  it("opens a source list's tab and the queue's tab", async () => {
    // click .mr-source: a list tab for Shells is selected
    // back to the overview tab; click .mr-open-queue: the queue's list tab is selected
  });

  it("says when there is no queue, and names a second queue note", async () => {
    // remove the queue tag from the queue note, save, idle: .mr-queue-none text === "No reading queue yet."
    // tag it back, and tag the Shells note too: .mr-queue-duplicate names "Shells"
    // restore: untag Shells
  });

  it("says All read when every queue step is read", async () => {
    // mark B and C Read: .mr-queue-done text === "All read."
  });

  it("comes back after a restart", async () => {
    // same steps as listTab.test.ts's restart case: disable and enable the
    // addon; the overview tab returns in the background (the library tab
    // stays selected), and the record holds {"kind":"overview"} once
  });
});
```

Write every case in full, following `listTab.test.ts`: real expectations, and `waitFor` with an evidence string in each assertion message. Each case leaves the state as the next case expects, or resets it.

- [ ] **Step 2: Run to see it fail:** put `describe.only` on it, run `npm test`. Expected: FAIL, because `api.openOverview` is not a function. Keep the `.only` only until Step 6.

- [ ] **Step 3: Implement `overviewStore.ts`:**

```ts
import {
  buildOverview,
  type Overview,
  type OverviewList,
} from "../domain/overview";
import { READING_LIST_TAG } from "../format/readingList";
import { pickQueue, sourceLists } from "../format/readingQueue";
import { libraryLinkOf, taggedNotes } from "./items";
import { listFor } from "./listStore";
import { stateOfItem } from "./stateStore";

export interface OverviewData {
  overview: Overview;
  /** Per queue step key, the lists whose folder holds the paper. */
  sources: Map<string, OverviewList[]>;
}

/** Every folder list in every library, read through the list store. */
async function gatherLists(): Promise<OverviewList[]> {
  const out: OverviewList[] = [];
  for (const library of Zotero.Libraries.getAll() as any[]) {
    if (library.libraryType !== "user" && library.libraryType !== "group")
      continue;
    for (const note of await taggedNotes(library.libraryID, READING_LIST_TAG)) {
      for (const collectionID of note.getCollections()) {
        const collection = Zotero.Collections.get(collectionID);
        const list = listFor(collectionID);
        if (
          !collection ||
          collection.deleted ||
          !list ||
          list.noteID !== note.id
        )
          continue;
        out.push({
          noteID: note.id,
          noteKey: note.key,
          collectionID,
          libraryName:
            library.libraryType === "user" ? null : String(library.name),
          folderName: collection.name,
          topic: list.doc?.topic || collection.name,
          steps: list.resolved?.steps.map((step) => step.key) ?? [],
          readable: Boolean(list.resolved),
        });
      }
    }
  }
  return out;
}

export async function readOverview(): Promise<OverviewData> {
  const lists = await gatherLists();
  const mine = lists.filter((l) => l.libraryName === null);
  const pick = pickQueue(
    mine.map((l) => {
      const note = Zotero.Items.get(l.noteID) as Zotero.Item;
      return {
        key: l.noteKey,
        dateAdded: note.dateAdded,
        library: libraryLinkOf(note.libraryID),
        tags: note.getTags().map((tag: { tag: string }) => tag.tag),
      };
    }),
  );
  const byKey = (key: string | null) => mine.find((l) => l.noteKey === key);
  const queue = byKey(pick.queue) ?? null;
  const stateOf = (list: OverviewList, key: string) => {
    const collection = Zotero.Collections.get(list.collectionID);
    const item =
      collection && Zotero.Items.getByLibraryAndKey(collection.libraryID, key);
    return item ? stateOfItem(item) : "unread";
  };
  const overview = buildOverview({
    // A list in two folders is one list here: its first folder.
    lists: lists.filter(
      (l, i) => lists.findIndex((o) => o.noteID === l.noteID) === i,
    ),
    queue: queue?.noteID ?? null,
    duplicates: pick.duplicates.map((key) => byKey(key)!.noteID),
    stateOf,
  });
  const sources = new Map<string, OverviewList[]>();
  if (queue) {
    const papers = (l: OverviewList): string[] => {
      const r = listFor(l.collectionID)?.resolved;
      return r ? [...r.steps.map((s) => s.key), ...r.unordered] : [];
    };
    const found = sourceLists(
      queue.noteKey,
      queue.steps,
      mine.map((l) => ({ note: l.noteKey, topic: l.topic, papers: papers(l) })),
    );
    for (const [key, notes] of Object.entries(found)) {
      sources.set(
        key,
        notes.map((note) => byKey(note)!),
      );
    }
  }
  return { overview, sources };
}
```

- [ ] **Step 4: Implement `overviewView.ts`.** It exports `renderOverview(container: HTMLElement, data: OverviewData, actions: { openList(collectionID: number): void })`. Use `element` and `STATE_LABEL`, exported from `listView.ts`. Structure:
  - `container.replaceChildren()`; add the classes `mr-list mr-tab mr-overview`.
  - `<h2 class="mr-overview-heading">Reading queue</h2>`, then one `p.mr-queue-duplicate` per duplicate: `Also tagged as the queue: “{topic}” ({folderName}). Remove its meristema-reading-queue tag to keep one queue.`
  - By `queue.status`:
    - `none`: `p.mr-queue-none` reading `No reading queue yet.`, then `p.mr-queue-hint` reading `Ask Claude to write one with zot.py reading-list --queue.`
    - `unreadable`: `p.mr-failure` reading `The reading queue cannot be read. Meristema Reading leaves it as it is.`
    - `empty`: `p.mr-queue-empty` reading `The queue is empty.`
    - `all-read`: `p.mr-queue-done` reading `All read.`
    - `ok`: `div.mr-queue-next[data-key]` holds a state toggle (a `button.mr-state` showing `STATE_LABEL[state]`, with `data-state` and title `Mark {next}`; a click calls `markItems([item], nextState(state)).catch(failedWith(…))`), a `span.mr-title` with the paper's label in `currentStyle()` (a click calls `showInLibrary(doc, list.collectionID, item.id)`), `p.mr-why` holding the step's reason when there is one (from `listFor(list.collectionID)?.resolved`), and `div.mr-sources` with `From` and one `button.mr-source[data-collection-id]` per source list (topic text; a click calls `actions.openList(id)`). Then `ol.mr-queue-after`, holding one `li.mr-queue-step[data-key]` per `after` key with a toggle and a title as above.
  - Every status but `none` ends with `button.mr-open-queue` reading `Open queue`, whose click calls `actions.openList(queue.list.collectionID)`.
  - `<h2 class="mr-overview-heading">Lists</h2>`, then `ol.mr-overview-lists` with one `li.mr-overview-row[data-collection-id]` per row (a click calls `actions.openList`). Each row holds `span.mr-row-topic` (topic), `span.mr-row-folder` (folder name, prefixed `{libraryName} › ` for a group), `span.mr-row-progress` (`progressText`, or `Cannot be read` for an unreadable list) and `span.mr-row-next` (the next-up paper's label, or `All read` when `nextUp` is null and the list is readable).
  - No lists at all: `p.mr-empty` reading `No reading lists yet. Right-click a folder and choose Make Reading List.`

- [ ] **Step 5: Implement `overviewTab.ts`:**

```ts
import { config } from "../../package.json";
import { withTab, withoutTab } from "../domain/openTabs";
import { onChange } from "./changes";
import { openListTab } from "./listTab";
import { readOverview } from "./overviewStore";
import { renderOverview } from "./overviewView";
import { openPluginTab, readRecord, writeRecord } from "./pluginTab";
import { report } from "./report";

export const OVERVIEW_TAB_TYPE = `${config.addonRef}-overview`;
const TAB_ID = OVERVIEW_TAB_TYPE;
const TAB_ICON = "meristema-reading-list";
const views = new Map<
  _ZoteroTypes.MainWindow,
  { body: HTMLElement; drawn: number }
>();
let unsubscribe: (() => void) | null = null;
let generation = 0;

async function redraw(win: _ZoteroTypes.MainWindow): Promise<void> {
  const view = views.get(win);
  if (!view) return;
  const mine = ++generation;
  const data = await readOverview();
  // A later redraw started while this one read: it draws instead.
  if (mine !== generation || views.get(win) !== view) return;
  renderOverview(view.body, data, {
    openList: (collectionID) => openListTab(collectionID, win),
  });
  view.drawn++;
}

export function openOverviewTab(
  win: _ZoteroTypes.MainWindow = Zotero.getMainWindow(),
  { select = true }: { select?: boolean } = {},
): void {
  const manager = win.Zotero_Tabs;
  if ((manager._tabs as any[]).some((tab) => tab.id === TAB_ID)) {
    if (select) manager.select(TAB_ID);
    return;
  }
  const body = openPluginTab(win, {
    id: TAB_ID,
    type: OVERVIEW_TAB_TYPE,
    title: "Reading Overview",
    icon: TAB_ICON,
    select,
    onClose: () => {
      views.delete(win);
      writeRecord(withoutTab(readRecord(), { kind: "overview" }));
    },
  });
  writeRecord(withTab(readRecord(), { kind: "overview" }));
  views.set(win, { body, drawn: 0 });
  void redraw(win).catch(report);
}

export function reopenOverviewTab(win: _ZoteroTypes.MainWindow): boolean {
  openOverviewTab(win, { select: false });
  return true;
}

export function startOverviewTabs(): void {
  if (unsubscribe) return;
  unsubscribe = onChange(() => {
    for (const win of views.keys()) void redraw(win).catch(report);
  });
}

export function closeOverviewTabs(): void {
  unsubscribe?.();
  unsubscribe = null;
  for (const win of [...views.keys()]) {
    try {
      win.Zotero_Tabs.close(TAB_ID);
    } catch (error) {
      report(error);
    }
  }
  views.clear();
}
```

The `generation` counter is global, so a redraw in one window can drop another window's. Make it per view (`view.generation`) when you write it. The test in Step 1 must not depend on this.

Wiring:

- In `hooks.ts`: `installTabHooks(win, [LIST_TAB_TYPE, OVERVIEW_TAB_TYPE])`. Call `startOverviewTabs()` beside `startListTabs()`. The reopen filter keeps an overview entry when `reopenOverviewTab(win)` returns true, each in its own try/catch. `closeOverviewTabs()` runs right after `closeListTabs()` in `onShutdown`; `closeListTabs` freezes the record first.
- In `addon.ts`: add `openOverview(win)` to `ReadingAPI`, with a doc comment, calling `openOverviewTab(win)`.
- Redraw triggers: the notifier's `emitChange` covers list, state and membership changes. With Task 6's `queueTagged` in the signature, it also covers tagging. A new list note in a folder no view had read is in `touched`, so it reaches `reconcileLists` and emits.
- CSS in `reading.css`, using the existing state custom properties: `.mr-overview` gets the tab's padding. `.mr-queue-next` has a larger title (`font-size: 1.3em`), a border in `var(--fill-quinary)`, and padding. `.mr-overview-row` is a grid of four columns (topic, folder, progress, next), wraps to two rows under 600px, and has `cursor: pointer` and a hover background. `.mr-source` is a link-styled button. No colours inline.

- [ ] **Step 6: Run** the overview suite (still `.only`): `npm test`. Expected: every case passes. Then **remove the `.only`**, run `npm run check` (exit 0) and confirm `git diff` has no `.only`.
- [ ] **Step 7: Commit**

```bash
git add src/zotero/overviewStore.ts src/zotero/overviewView.ts src/zotero/overviewTab.ts src/zotero/listView.ts src/hooks.ts src/addon.ts addon/content/reading.css test/zotero/overview.test.ts
git commit -m "Add the Reading Overview tab: the queue's next up and every list's progress"
```

---

### Task 10: Open the Overview from My Library and from list tabs (reading)

**Files:**

- Modify: `src/zotero/menus.ts` (an entry on My Library's row)
- Modify: `addon/locale/en-US/mainWindow.ftl` (`open-reading-overview`)
- Modify: `src/zotero/listView.ts` (`ListViewOptions.onOpenOverview`, a header button in tab mode)
- Modify: `src/zotero/listTab.ts` (`startListTabs({ openOverview })` stores the callback; `render` passes it)
- Modify: `src/hooks.ts` (passes `openOverviewTab`)
- Modify: `test/zotero/helpers.ts` (`libraryMenuEntry`)
- Modify: `test/zotero/overview.test.ts` (two cases)

**Interfaces:**

- Consumes: `openOverviewTab` (Task 9).
- Produces: the menu entry `${addonRef}-open-reading-overview`; `button.mr-open-overview` in list tabs.

- [ ] **Step 1: Write the failing cases** in `overview.test.ts`, plus this helper in `helpers.ts`:

```ts
/** Opens My Library's context menu and finds a plugin entry in it. */
export async function libraryMenuEntry(
  win: any,
  l10nID: string,
): Promise<{ popup: any; entry: any }> {
  await win.ZoteroPane.collectionsView.selectLibrary(
    Zotero.Libraries.userLibraryID,
  );
  const popup = win.document.getElementById("zotero-collectionmenu");
  await win.ZoteroPane.buildCollectionContextMenu();
  const showing = shown(popup);
  popup.openPopup(null, "after_start", 0, 0, false, false);
  await showing;
  return { popup, entry: popup.querySelector(`[data-l10n-id="${l10nID}"]`) };
}
```

Cases:

- "opens from My Library's menu": the entry is visible, and `command(entry)` selects a tab of type `${config.addonRef}-overview`. The entry is hidden on a folder's menu (use `collectionMenuEntry`). Close the popup in a `finally`.
- "opens from a list tab's header": open the queue's list tab; click `.mr-list.mr-tab .mr-open-overview`; the overview tab is selected.

- [ ] **Step 2: Run** with `.only` on the overview suite. Expected: the two new cases FAIL.
- [ ] **Step 3: Implement.**
  - `mainWindow.ftl`, after `open-reading-list`:

```
open-reading-overview =
    .label = Open Reading Overview
```

- `menus.ts`:

```ts
/** Whether the menu was opened on My Library's own row. */
function onMyLibrary(context: any): boolean {
  const rows = contextValue(context, "collectionTreeRows");
  const selected = Array.isArray(rows)
    ? rows
    : [contextValue(context, "collectionTreeRow")];
  if (selected.length !== 1 || selected[0]?.isLibrary?.(false) !== true) {
    return false;
  }
  return (
    contextValue(selected[0], "ref")?.libraryID ===
    Zotero.Libraries.userLibraryID
  );
}
```

and, first in `collectionMenus()`:

```ts
    {
      menuType: "menuitem",
      l10nID: `${config.addonRef}-open-reading-overview`,
      icon: ICON,
      onShowing: (_event: Event, context: any) => {
        const available = onMyLibrary(context);
        context.setVisible(available);
        context.setEnabled(available);
      },
      onCommand: (_event: Event, context: any) => {
        if (onMyLibrary(context)) openOverviewTab(contextWindow(context));
      },
    },
```

- `listView.ts`: add `onOpenOverview?: () => void` to `ListViewOptions` (doc comment: "In a list tab, opens the Reading Overview."). Right after the `onOpenTab` button, add:

```ts
if (options.onOpenOverview) {
  const overview = element(
    doc,
    "button",
    "mr-open-overview",
    "Reading Overview",
  );
  overview.addEventListener("click", () => options.onOpenOverview?.());
  container.append(overview);
}
```

- `listTab.ts`: `startListTabs(hooks: { openOverview?: (win: _ZoteroTypes.MainWindow) => void } = {})` stores `hooks.openOverview`. `render` passes `onOpenOverview: openOverview ? () => openOverview(view.win) : undefined`.
- `hooks.ts`: `startListTabs({ openOverview: (win) => openOverviewTab(win) })`.
- CSS: `.mr-open-overview` matches `.mr-open-tab`.
- [ ] **Step 4: Run** the overview suite (`.only`); expected PASS. Remove the `.only`. Then run the **full suite once**: `npm test` (wait for it to exit), expected all cases pass. Then `npm run check` (exit 0), and confirm `git diff` has no `.only`.
- [ ] **Step 5: Commit**

```bash
git add src/zotero/menus.ts addon/locale/en-US/mainWindow.ftl src/zotero/listView.ts src/zotero/listTab.ts src/hooks.ts addon/content/reading.css test/zotero/helpers.ts test/zotero/overview.test.ts
git commit -m "Open the Reading Overview from My Library's menu and from list tabs"
```

---

### Task 11: Docs, roadmap and the walk (reading, meristema)

**Files:**

- Modify: `zotero-meristema-reading/README.md`
- Modify: `meristema-zotero/docs/superpowers/handoffs/roadmap.md`
- Delete: `meristema-zotero/docs/superpowers/plans/2026-11-16-reading-overview.md`

- [ ] **Step 1:** In `README.md`, add two bullets under "The plugin", after **Clear Reading List**:
  - `**Reading queue**: the list whose note also carries the tag meristema-reading-queue (in My Library; the oldest such note when there are two). Any paper can be a step, and it then also sits in the queue's folder. Claude writes it with zot.py reading-list --queue.` Put the tag and the command in code spans, each on one line.
  - `**Open Reading Overview** (My Library's menu, or Reading Overview in a list tab): the queue's next paper with its reason and the lists it comes from, the steps after it, and every list's progress and next step. Click a state to mark it, a list to open it.`
- [ ] **Step 2:** In `roadmap.md`, find the R2 entry by its content. Make it "built and unwalked", with the three repos' state, as a terse line or two. Add R2 lines under Manual verification, after the R1 fixes lines:
  - `R2, first: rebuild and reinstall Meristema Reading; update the skill (skills repo main).`
  - `R2, queue: ask Claude for a queue from two lists (zot.py reading-overview, then reading-list --queue): a "Reading queue" folder and list appear; its tab works as any list's.`
  - `R2, Overview: right-click My Library, Open Reading Overview: the queue's next paper large with its reason and "From" lists, up to five steps after it, then every list with "N read · N reading · N left" and its next step, in both themes.`
  - `R2, marking: click the next paper's state to Read: the next step takes its place; the list it came from shows it Read too.`
  - `R2, links: a "From" list and a list row open their tabs; Open queue opens the queue's tab; Reading Overview in a list tab comes back to the Overview.`
  - `R2, edge lines: untag the queue note: "No reading queue yet."; tag a second list: the duplicate line names it; mark every queue step Read: "All read."`
  - `R2, restart: with the Overview open, quit and start Zotero: it comes back behind the library tab.`
- [ ] **Step 3:** Delete the plan file, per the docs-lean rule.
- [ ] **Step 4:** Run `npx prettier --write` on the changed docs in both repos, then `npm run check` in both repos (exit 0 each). Check that no inline code span is split across lines.
- [ ] **Step 5: Commit** in each repo:

```bash
# zotero-meristema-reading
git add README.md
git commit -m "Describe the reading queue and the Overview"
# meristema-zotero
git add docs/superpowers/handoffs/roadmap.md docs/superpowers/plans/2026-11-16-reading-overview.md
git commit -m "Record R2 as built and what to walk"
```

- [ ] **Step 6:** Build the XPI in reading, after the last test run: `npm run build` (exit 0); `.scaffold/build/meristema-reading.xpi` exists.
