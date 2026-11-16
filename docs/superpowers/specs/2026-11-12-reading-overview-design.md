# Reading overview and queue (R2)

One queue of papers drawn from every reading list, read one at a time, and an
Overview tab that shows the queue and every list's progress. The user does not
order the queue alone: they and Claude Code write and rewrite it together, so
the queue is data Claude writes through the skill, not a rule the plugin
computes. Builds on R1 (`2026-11-06-reading-lists-design.md`); its format,
read state, paper ids and next-up rule are unchanged.

## 1. The queue (format)

- The **queue** is an ordinary reading list (R1 §1) whose note carries a second
  tag, `meristema-reading-queue`, beside `meristema-reading-list`. The JSON
  stays `version: 1`; readers that do not know the tag read a normal list, so
  the Reading plan view, Zotero for iOS and the fixtures keep working. Adding
  the tag by hand in Zotero makes a list the queue.
- The queue lives in My Library only. A tagged note in a group library is read
  as an ordinary list.
- One queue: of the tagged notes in My Library, the oldest by date added, then
  key. A second tagged note is read as an ordinary list.
- Any paper may be a step, in a topic list or not. Its folder is the queue's
  folder, so a queued paper also sits there (a paper may be in several
  folders).
- A step's **source lists** are the other lists whose folder holds its paper
  (R1's one note per folder), named by topic, computed on read and never
  stored. A paper in no other list has none.
- Read state is R1's per-paper state note, so rewriting or reordering the queue
  never changes what is read. Read steps stay in the queue. Next up is R1's
  rule: the first Reading step, else the first Unread step.
- New fixtures: a queue note (both tags); My Library with two tagged notes; a
  group library with a tagged note. Every reader picks the same queue.

## 2. The Overview tab (Meristema Reading)

- Opens from **Open Reading Overview** on My Library's context menu, and from a
  link in every list tab's header. One Overview tab per window; a second open
  selects it. It is saved with the list tabs (R1's `openTabs` pref, as a kind
  of its own with no data) and reopens after a restart like them.
- **Queue, on top:** the next-up paper large, with its reason and its source
  lists; then up to five more steps: the steps that are not Read, in list
  order, without next up (so Unread #1, Reading #2, Unread #3 shows #2 large,
  then #1 and #3). Each shows its state, clicked through Unread, Reading, Read
  as in the list tab; a title selects the paper; a source list opens that
  list's tab. "Open queue" opens the queue's list tab, where steps are dragged
  and edited as today.
- Queue states: none (says so and shows the command that makes one, §3); no
  steps ("The queue is empty"); every step Read ("All read"). The last two
  keep "Open queue".
- A second tagged note: one line under the queue's heading names its topic and
  folder and says to remove its tag.
- **Lists, below:** every list in every library other than the queue, by topic
  (a group list shows its library's name): topic, folder, progress
  (`3 read · 1 reading · 4 left`), and its next step, or "All read". A row
  opens that list's tab.
- Redraws on the change events the list tabs already follow (notes, folder
  membership, state); labels papers by the `paperLabel` setting.

## 3. The skill (using-zotero, skills repo)

- `zot.py reading-list --queue --steps steps.json` writes the queue in My
  Library, with `--replace`, `--topic` and `--collection` as for any list. A
  new queue's
  topic and folder default to "Reading queue" (the folder is made if absent);
  with `--replace`, the existing queue's topic and folder are kept unless given.
  Papers are added and filed as for any list, and the note gets both tags. A
  library that has a queue is refused without `--replace`.
- `--replace` on the queue writes the steps given and takes the papers no
  longer in them out of the queue's folder (never out of the library or other
  folders), so a dropped step leaves the queue. It writes the oldest tagged
  note and never touches a second one. Rewriting with `--replace` is how the
  queue is reordered.
- `zot.py reading-overview` prints one JSON object:

  ```json
  {
    "version": 1,
    "queue": "<note key> | null",
    "duplicateQueues": ["<note key>"],
    "lists": [
      {
        "note": "<note key>",
        "library": "user | group-<id>",
        "topic": "…",
        "folder": { "key": "<collection key>", "name": "…" },
        "isQueue": false,
        "nextUp": "<item key> | null",
        "steps": [
          {
            "key": "<item key>",
            "paper": "<R1 paper id>",
            "title": "…",
            "why": "…",
            "state": "unread | reading | read",
            "sourceLists": ["<note key>"]
          }
        ]
      }
    ]
  }
  ```

  `sourceLists` is filled for the queue's steps and empty elsewhere. Claude
  reads this before proposing what to read next.

- Both run `doctor` first; the write re-reads the note and checks its JSON,
  tags and the folder's papers.

## Not in scope

- An ordering rule (round-robin, weights): the order is what the user and
  Claude write.
- Taking read papers out of the queue: they stay until a `--replace` drops
  them.
- A queue in a group library.
- A Tools menu entry or shortcut for the Overview.

## Testing

- Format: unit tests for picking the queue (tag, My Library only, oldest wins)
  and for source lists, run against the new fixtures in both the plugin and the
  skill's port.
- Plugin, Zotero suite: open the Overview from the library menu, see the
  queue's next up, the steps after it and a list's progress; mark the next up
  Read and see the next step take its place; the no-queue, empty, all-read and
  second-queue lines; a source list opens its tab; the tab reopens after a
  restart.
- Skill: `--queue` writes both tags and refuses a second queue without
  `--replace`; `--replace` keeps topic and folder and unfiles dropped papers
  from the queue's folder only; `reading-overview` output matches the
  fixtures.

## Build order

1. Format: the tag rule and fixtures, vendored into Meristema as for R1.
2. The skill: `--queue` and `reading-overview`, so the user and Claude can
   start a queue before the tab exists (the queue's list tab already works).
3. The Overview tab.
