# Reading overview and queue (R2)

One queue of papers drawn from every reading list, read one at a time, and an
Overview tab that shows the queue and every list's progress. The user does not
order the queue alone: they and Claude Code write and rewrite it together, so
the queue is data Claude writes through the skill, not a rule the plugin
computes. Builds on R1 (`2026-11-06-reading-lists-design.md`); its format,
read state and next-up rule are unchanged.

## 1. The queue (format)

- The **queue** is an ordinary reading list (R1 §1) whose note carries a second
  tag, `meristema-reading-queue`, beside `meristema-reading-list`. The JSON
  stays `version: 1`; readers that do not know the tag read a normal list, so
  the Reading plan view, Zotero for iOS and the fixtures keep working.
- One queue per library: of the notes carrying the tag, the oldest by date
  added, then key. A second tagged note is read as an ordinary list, and the
  Overview names it.
- Any paper may be a step, in a topic list or not. Its folder is the queue's
  folder, so a queued paper also sits there (a paper may be in several
  folders).
- A step's **source lists** are the other list folders holding its paper,
  computed on read and never stored.
- Read steps stay in the queue. Next up is R1's rule: the first Reading step,
  else the first Unread step.
- New fixtures: a queue note (both tags), and a library with two tagged notes,
  so every reader picks the same queue.

## 2. The Overview tab (Meristema Reading)

- Opens from **Open Reading Overview** on My Library's context menu, and from a
  link in every list tab's header. One Overview tab per window; a second open
  selects it.
- **Queue, on top:** the next-up paper large, with its reason and source
  lists; then the next steps (up to five) with their states. A state is clicked
  through Unread, Reading, Read as in the list tab; a title selects the paper.
  "Open queue" opens the queue's list tab, where steps are dragged and edited as
  today.
- **Lists, below:** one row per list other than the queue, by topic: topic,
  folder, progress (`3 read · 1 reading · 4 left`), and its next step. A row
  opens that list's tab. A list with every step read says so in place of a
  next step.
- No queue: the top says there is none and shows the command that makes one
  (§3). The lists still show.
- Redraws on the change events the list tabs already follow (notes, folder
  membership, state); reopens after a restart like list tabs; labels papers by
  the `paperLabel` setting.

## 3. The skill (using-zotero, skills repo)

- `zot.py reading-list --queue --steps steps.json [--replace]` writes the
  queue. Topic and folder both default to "Reading queue" (the folder is made
  if absent); papers are added and filed as for any list, and the
  note gets both tags. A library that has a queue is refused without
  `--replace`. Rewriting with `--replace` is how the queue is reordered.
- `zot.py reading-overview` prints JSON: for every list, its topic, folder key
  and name, whether it is the queue, and its steps in order, each with key,
  paper id, title, why, state and source lists; and each list's next-up key.
  Claude reads it before proposing what to read next.
- Both run `doctor` first; the write re-reads the note and checks its JSON and
  tags.

## Not in scope

- An ordering rule (round-robin, weights): the order is what the user and
  Claude write.
- Taking read papers out of the queue folder or its steps.
- A queue in a group library: the queue is personal, in My Library.

## Testing

- Format: unit tests for picking the queue (tag, oldest wins) and for source
  lists, run against the new fixtures in both the plugin and the skill's port.
- Plugin, Zotero suite: open the Overview from the library menu, see the
  queue's next up and a list's progress; mark the next up Read and see the next
  step take its place; no queue shows the empty state.
- Skill: `--queue` writes both tags and refuses a second queue without
  `--replace`; `reading-overview` output matches the fixtures.

## Build order

1. Format: the tag rule and fixtures, vendored into Meristema as for R1.
2. The skill: `--queue` and `reading-overview`, so the user and Claude can
   start a queue before the tab exists (the queue's list tab already works).
3. The Overview tab.
