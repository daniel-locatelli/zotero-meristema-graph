import { expect } from "chai";

/*
 * The gear's choices are buttons with a listbox popup (graphChoiceMenu.ts),
 * not selects, so a case picks the way the reader does: open the choice,
 * click its row. A choice is named by its `data-role`: x-metric, x-scale,
 * y-metric, y-scale, size, colour, labels. What a case reads goes through
 * the DOM (`data-value`, the rows' `disabled`), never the control's own
 * properties: this bundle is a second copy of the plugin.
 */

export function gearChoice(root: Element, role: string): HTMLButtonElement {
  const choice = root.querySelector(
    `[data-choice-menu][data-role="${role}"]`,
  ) as HTMLButtonElement | null;
  expect(choice, `the gear's ${role} choice`).to.not.equal(null);
  return choice!;
}

/** The chosen value, as the control publishes it. */
export function gearChoiceValue(root: Element, role: string): string {
  return gearChoice(root, role).dataset.value ?? "";
}

/** Open the choice if it is shut, and answer its rows. */
export function openGearChoice(
  root: Element,
  role: string,
): HTMLButtonElement[] {
  const choice = gearChoice(root, role);
  if (choice.getAttribute("aria-expanded") !== "true") choice.click();
  expect(
    choice.getAttribute("aria-expanded"),
    `the ${role} choice opened`,
  ).to.equal("true");
  return Array.from(
    root.querySelectorAll(".cm-choice-popup:not([hidden]) .cm-choice-row"),
  ) as HTMLButtonElement[];
}

/** Open the choice and click `value`'s row. */
export function pickGearChoice(
  root: Element,
  role: string,
  value: string,
): void {
  const rows = openGearChoice(root, role);
  const row = rows.find((candidate) => candidate.dataset.value === value);
  expect(
    row,
    `the ${role} choice's ${value} row; it offers ${rows
      .map((r) => `${r.dataset.value}${r.disabled ? " (disabled)" : ""}`)
      .join(", ")}`,
  ).to.not.equal(undefined);
  row!.click();
  expect(
    gearChoiceValue(root, role),
    `the ${role} choice took ${value}`,
  ).to.equal(value);
}
