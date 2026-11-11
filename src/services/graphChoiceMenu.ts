import { element, text } from "./graphViewControls";

/*
 * The gear's choice control. A native `<select>` opens Gecko's select popup,
 * which hangs off the window and is shared by every select in it, and that
 * popup draws a bullet beside the chosen entry. This is a button holding the
 * chosen label and a caret, and a listbox of rows whose chosen one wears the
 * View dropdown's active-row paint: no bullet, no check (2026-11-11 walk).
 */

export interface ChoiceOption {
  value: string;
  label: string;
  /** The button's tooltip while this option is chosen. */
  title?: string;
  disabled?: boolean;
}

export interface ChoiceMenu extends HTMLButtonElement {
  /** The chosen value. Setting it fires no `change`, as a select's does not. */
  value: string;
  readonly options: ChoiceOption[];
  disabled: boolean;
  /** Offer or withhold one option; a withheld one stays chosen if it was. */
  setOptionDisabled(value: string, disabled: boolean): void;
  /** Close the popup, if it is open. */
  close(): void;
}

/** Marks the element a menu's popup is appended to; else the button's parent. */
export const CHOICE_HOST_ATTRIBUTE = "data-choice-host";

/** Whether a choice menu under `root` has its popup open. */
export function choiceMenuOpenWithin(root: Element): boolean {
  return !!root.querySelector('[data-choice-menu][aria-expanded="true"]');
}

const POPUP_GAP = 2;

export function createChoiceMenu(
  document: Document,
  options: ChoiceOption[],
  value: string,
): ChoiceMenu {
  const button = element(document, "button", "cm-select cm-choice");
  button.type = "button";
  button.dataset.choiceMenu = "";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  const label = text(document, "span", "", "cm-choice-label");
  const caret = text(document, "span", "▾", "cm-choice-caret");
  caret.setAttribute("aria-hidden", "true");
  button.append(label, caret);

  const popup = element(document, "div", "cm-choice-popup");
  popup.setAttribute("role", "listbox");
  popup.hidden = true;

  const entries: ChoiceOption[] = options.map((option) => ({ ...option }));
  const known = (wanted: string): boolean =>
    entries.some((option) => option.value === wanted);
  let current = known(value) ? value : "";
  let rows: HTMLButtonElement[] = [];
  /** The row the keyboard is on while the popup is open; -1 for none. */
  let active = -1;

  const chosen = (): ChoiceOption | undefined =>
    entries.find((option) => option.value === current);

  const paintRows = (): void => {
    rows.forEach((row, index) => {
      const option = entries[index]!;
      row.setAttribute("aria-selected", String(option.value === current));
      row.disabled = Boolean(option.disabled);
      if (option.disabled) row.setAttribute("aria-disabled", "true");
      else row.removeAttribute("aria-disabled");
      row.classList.toggle("cm-choice-row--active", index === active);
    });
  };

  const render = (): void => {
    const option = chosen();
    label.textContent = option?.label ?? "";
    button.title = option?.title ?? "";
    button.dataset.value = current;
    paintRows();
  };

  const isOpen = (): boolean => !popup.hidden;

  const onOutsidePointer = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && (button.contains(target) || popup.contains(target))) return;
    close();
  };

  function close(): void {
    if (!isOpen()) return;
    popup.hidden = true;
    active = -1;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    paintRows();
  }

  const pick = (wanted: string): void => {
    const option = entries.find((entry) => entry.value === wanted);
    if (!option || option.disabled) return;
    close();
    button.focus();
    if (wanted === current) return;
    current = wanted;
    render();
    const EventCtor = (
      document.defaultView as unknown as { Event: typeof Event }
    ).Event;
    button.dispatchEvent(new EventCtor("change", { bubbles: true }));
  };

  const drawRows = (): void => {
    rows = entries.map((option) => {
      const row = element(document, "button", "cm-choice-row");
      row.type = "button";
      row.tabIndex = -1;
      row.setAttribute("role", "option");
      row.dataset.value = option.value;
      row.textContent = option.label;
      if (option.title) row.title = option.title;
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        pick(option.value);
      });
      return row;
    });
    popup.replaceChildren(...rows);
  };

  /*
   * Below the button, or above it when the window has no room below. The
   * popup's containing block is whatever its host's ancestry makes it (the
   * gear's panel blurs its backdrop, which makes it one), so the offsets are
   * found by measuring where 0,0 lands rather than assumed.
   */
  const place = (): void => {
    const view = document.defaultView;
    const anchor = button.getBoundingClientRect();
    popup.style.minWidth = `${anchor.width}px`;
    popup.style.left = "0px";
    popup.style.top = "0px";
    const origin = popup.getBoundingClientRect();
    const height = origin.height;
    const below = anchor.bottom + POPUP_GAP;
    const fitsBelow = !view || below + height <= view.innerHeight;
    const above = anchor.top - POPUP_GAP - height;
    const top = fitsBelow || above < 0 ? below : above;
    popup.style.left = `${anchor.left - origin.left}px`;
    popup.style.top = `${top - origin.top}px`;
  };

  const open = (): void => {
    if (isOpen() || button.disabled || !entries.length) return;
    const host =
      (button.closest?.(`[${CHOICE_HOST_ATTRIBUTE}]`) as HTMLElement | null) ??
      button.parentElement;
    if (!host) return;
    if (popup.parentElement !== host) host.append(popup);
    drawRows();
    active = entries.findIndex((option) => option.value === current);
    paintRows();
    popup.hidden = false;
    button.setAttribute("aria-expanded", "true");
    place();
    document.addEventListener("pointerdown", onOutsidePointer, true);
    button.focus();
  };

  /** The next enabled row from `from` in `step`'s direction, else `from`. */
  const step = (from: number, by: 1 | -1): number => {
    for (
      let index = from + by;
      index >= 0 && index < entries.length;
      index += by
    ) {
      if (!entries[index]!.disabled) return index;
    }
    return from;
  };

  button.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });
  button.addEventListener("keydown", (event: KeyboardEvent) => {
    const { key } = event;
    if (!isOpen()) {
      if (key === "ArrowDown" || key === "ArrowUp") {
        event.preventDefault();
        open();
      }
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      active = step(active, key === "ArrowDown" ? 1 : -1);
      paintRows();
      rows[active]?.scrollIntoView?.({ block: "nearest" });
    } else if (key === "Enter") {
      event.preventDefault();
      const option = entries[active];
      if (option) pick(option.value);
      else close();
    } else if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  // Rows take no focus from a pointer, so the button keeps it while the
  // popup is up, and losing it means the reader has moved on.
  popup.addEventListener("mousedown", (event) => event.preventDefault());
  const onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (next && (button.contains(next) || popup.contains(next))) return;
    close();
  };
  button.addEventListener("focusout", onFocusOut);
  popup.addEventListener("focusout", onFocusOut);

  Object.defineProperty(button, "value", {
    configurable: true,
    get: () => current,
    set: (next: string) => {
      current = known(String(next)) ? String(next) : "";
      render();
    },
  });
  Object.defineProperty(button, "options", {
    configurable: true,
    get: () => entries.map((option) => ({ ...option })),
  });
  const menu = button as unknown as ChoiceMenu;
  menu.setOptionDisabled = (wanted, disabled) => {
    const option = entries.find((entry) => entry.value === wanted);
    if (!option) return;
    option.disabled = disabled;
    paintRows();
  };
  menu.close = close;
  render();
  return menu;
}
