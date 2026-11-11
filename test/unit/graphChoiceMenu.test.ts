import { describe, it } from "node:test";
import { expect } from "chai";
import {
  choiceMenuOpenWithin,
  createChoiceMenu,
  type ChoiceMenu,
  type ChoiceOption,
} from "../../src/services/graphChoiceMenu";
import { FakeDocument, FakeElement, FakeEvent } from "./controlDoubles";

const OPTIONS: ChoiceOption[] = [
  { value: "title", label: "Title", title: "Label nodes by title." },
  { value: "author-year", label: "Author (year)" },
  { value: "none", label: "No labels", disabled: true },
  { value: "doi", label: "DOI" },
];

/** A menu in a host, as the gear holds one; `changes` counts its events. */
function build(value = "title"): {
  doc: FakeDocument;
  host: FakeElement;
  menu: ChoiceMenu;
  button: FakeElement;
  changes: () => number;
} {
  const doc = new FakeDocument();
  const host = doc.createElementNS("", "div");
  host.dataset.choiceHost = "";
  const menu = createChoiceMenu(
    doc as unknown as Document,
    OPTIONS,
    value,
  ) as ChoiceMenu;
  const button = menu as unknown as FakeElement;
  host.append(button);
  let changes = 0;
  host.addEventListener("change", () => (changes += 1));
  return { doc, host, menu, button, changes: () => changes };
}

function popupOf(host: FakeElement): FakeElement {
  const popup = host.all("cm-choice-popup")[0];
  expect(popup, "the popup").to.exist;
  return popup!;
}

function rowFor(host: FakeElement, value: string): FakeElement {
  const row = popupOf(host)
    .all("cm-choice-row")
    .find((r) => r.dataset.value === value);
  expect(row, `a row for ${value}`).to.exist;
  return row!;
}

function label(button: FakeElement): string {
  return button.all("cm-choice-label")[0]?.textContent ?? "";
}

describe("the gear's choice menu", function () {
  it("is a select-classed button that holds its value and label", function () {
    const { menu, button } = build("author-year");
    expect(button.tagName).to.equal("button");
    expect(button.classList.contains("cm-select")).to.equal(true);
    expect(button.classList.contains("cm-choice")).to.equal(true);
    expect("choiceMenu" in button.dataset).to.equal(true);
    expect(menu.value).to.equal("author-year");
    expect(label(button)).to.equal("Author (year)");
    expect(menu.options.map((o) => o.value)).to.deep.equal([
      "title",
      "author-year",
      "none",
      "doi",
    ]);
  });

  it("takes a value without firing change, and titles itself by the choice", function () {
    const { menu, button, changes } = build("author-year");
    menu.value = "title";
    expect(menu.value).to.equal("title");
    expect(label(button)).to.equal("Title");
    expect(button.title).to.equal("Label nodes by title.");
    expect(button.dataset.value).to.equal("title");
    expect(changes()).to.equal(0);
  });

  it("marks the chosen row selected, and no other", function () {
    const { host, button } = build("author-year");
    button.click();
    const popup = popupOf(host);
    expect(popup.hidden).to.equal(false);
    expect(popup.getAttribute("role")).to.equal("listbox");
    expect(button.getAttribute("aria-expanded")).to.equal("true");
    expect(
      popup.all("cm-choice-row").map((r) => r.getAttribute("aria-selected")),
    ).to.deep.equal(["false", "true", "false", "false"]);
    expect(rowFor(host, "title").getAttribute("role")).to.equal("option");
  });

  it("fires one change on picking a different row, and updates value and label", function () {
    const { host, menu, button, changes } = build("title");
    button.click();
    rowFor(host, "doi").click();
    expect(changes()).to.equal(1);
    expect(menu.value).to.equal("doi");
    expect(label(button)).to.equal("DOI");
    expect(popupOf(host).hidden, "a pick closes the popup").to.equal(true);
    expect(button.getAttribute("aria-expanded")).to.equal("false");
  });

  it("fires nothing on picking the current row", function () {
    const { host, menu, button, changes } = build("title");
    button.click();
    rowFor(host, "title").click();
    expect(changes()).to.equal(0);
    expect(menu.value).to.equal("title");
  });

  it("will not pick a disabled row", function () {
    const { host, menu, button, changes } = build("title");
    button.click();
    const row = rowFor(host, "none");
    expect(row.disabled).to.equal(true);
    row.dispatchEvent(new FakeEvent("click", { bubbles: true }));
    expect(changes()).to.equal(0);
    expect(menu.value).to.equal("title");
  });

  it("disables an option on request, and enables it again", function () {
    const { host, menu, button } = build("title");
    menu.setOptionDisabled("doi", true);
    expect(menu.options.find((o) => o.value === "doi")?.disabled).to.equal(
      true,
    );
    button.click();
    expect(rowFor(host, "doi").disabled).to.equal(true);
    menu.setOptionDisabled("doi", false);
    expect(rowFor(host, "doi").disabled).to.equal(false);
  });

  it("closes on a pointer outside it, and not on one inside", function () {
    const { doc, host, button } = build("title");
    button.click();
    doc.pointerDown(rowFor(host, "doi"));
    expect(popupOf(host).hidden).to.equal(false);
    doc.pointerDown(null);
    expect(popupOf(host).hidden).to.equal(true);
    expect(doc.listenerCount("pointerdown"), "listeners left").to.equal(0);
  });

  it("moves with Up and Down past disabled rows, picks with Enter, and closes on Escape", function () {
    const { host, menu, button, changes } = build("author-year");
    const key = (name: string): FakeEvent => {
      const event = new FakeEvent("keydown", { bubbles: true, key: name });
      button.dispatchEvent(event);
      return event;
    };
    key("ArrowDown");
    expect(popupOf(host).hidden, "Down opens").to.equal(false);
    key("ArrowDown");
    const enter = key("Enter");
    expect(enter.defaultPrevented).to.equal(true);
    expect(menu.value, "Down skipped the disabled row").to.equal("doi");
    expect(changes()).to.equal(1);
    key("ArrowDown");
    key("ArrowUp");
    key("ArrowUp");
    expect(choiceMenuOpenWithin(host as unknown as Element)).to.equal(true);
    const escape = key("Escape");
    expect(escape.defaultPrevented).to.equal(true);
    expect(popupOf(host).hidden).to.equal(true);
    expect(menu.value, "Escape picks nothing").to.equal("doi");
    expect(choiceMenuOpenWithin(host as unknown as Element)).to.equal(false);
  });

  it("closes when focus leaves it", function () {
    const { doc, host, button } = build("title");
    button.click();
    const elsewhere = doc.createElementNS("", "input");
    const blur = new FakeEvent("focusout");
    blur.relatedTarget = elsewhere;
    button.dispatchEvent(blur);
    expect(popupOf(host).hidden).to.equal(true);
  });

  it("does not open while disabled", function () {
    const { host, menu, button } = build("title");
    menu.disabled = true;
    button.dispatchEvent(new FakeEvent("click", { bubbles: true }));
    expect(host.all("cm-choice-popup").every((p) => p.hidden)).to.equal(true);
  });
});
