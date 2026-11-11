/*
 * Just enough DOM for the graph's controls to build themselves: elements that
 * hold classes, attributes, text and children, listeners that events reach
 * (bubbling to the parent), and a document that takes capture-phase
 * listeners. Nothing is laid out; every box measures zero.
 */

export class FakeEvent {
  readonly type: string;
  readonly bubbles: boolean;
  key = "";
  target: FakeElement | null = null;
  relatedTarget: FakeElement | null = null;
  defaultPrevented = false;
  propagationStopped = false;
  constructor(type: string, init: { bubbles?: boolean; key?: string } = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.key = init.key ?? "";
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

type Listener = (event: FakeEvent) => void;

class Listeners {
  private map = new Map<string, Listener[]>();
  add(type: string, listener: Listener): void {
    this.map.set(type, [...(this.map.get(type) ?? []), listener]);
  }
  remove(type: string, listener: Listener): void {
    this.map.set(
      type,
      (this.map.get(type) ?? []).filter((entry) => entry !== listener),
    );
  }
  count(type: string): number {
    return this.map.get(type)?.length ?? 0;
  }
  run(type: string, event: FakeEvent): void {
    for (const listener of [...(this.map.get(type) ?? [])]) listener(event);
  }
}

export class FakeElement {
  className = "";
  hidden = false;
  disabled = false;
  type = "";
  title = "";
  id = "";
  tabIndex = 0;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  private ownText = "";
  private ownValue = "";
  private attributes = new Map<string, string>();
  private listeners = new Listeners();
  readonly tagName: string;
  readonly ownerDocument: FakeDocument;
  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
  }
  get value(): string {
    return this.ownValue;
  }
  set value(value: string) {
    this.ownValue = value;
  }
  get parentNode(): FakeElement | null {
    return this.parentElement;
  }
  get classList() {
    const names = (): string[] => this.className.split(" ").filter(Boolean);
    return {
      add: (...added: string[]) => {
        this.className = [...names(), ...added].join(" ");
      },
      remove: (...removed: string[]) => {
        this.className = names()
          .filter((name) => !removed.includes(name))
          .join(" ");
      },
      contains: (name: string) => names().includes(name),
      toggle: (name: string, force?: boolean) => {
        const on = force ?? !names().includes(name);
        this.className = [...names().filter((n) => n !== name)]
          .concat(on ? [name] : [])
          .join(" ");
        return on;
      },
    };
  }
  get textContent(): string {
    return this.ownText + this.children.map((c) => c.textContent).join("");
  }
  set textContent(value: string) {
    this.ownText = value;
    this.setChildren([]);
  }
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  private setChildren(nodes: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }
  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }
  appendChild(node: FakeElement): FakeElement {
    this.append(node);
    return node;
  }
  prepend(node: FakeElement): void {
    node.remove();
    node.parentElement = this;
    this.children.unshift(node);
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.setChildren(nodes);
  }
  remove(): void {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  contains(node: FakeElement | null): boolean {
    for (let current = node; current; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }
  /**
   * Attribute selectors only, chained: `[data-x]`, `[aria-y="z"]`. A `data-`
   * attribute is read from `dataset`, the others from the attributes.
   */
  matches(selector: string): boolean {
    const parts = [...selector.matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)];
    if (!parts.length || parts.map((p) => p[0]).join("") !== selector) {
      throw new Error(`unsupported selector ${selector}`);
    }
    return parts.every(([, name, wanted]) => {
      const actual = name!.startsWith("data-")
        ? this.dataset[
            name!
              .slice(5)
              .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
          ]
        : this.attributes.get(name!);
      return wanted === undefined ? actual !== undefined : actual === wanted;
    });
  }
  /** This element and its ancestors, nearest first. */
  private lineage(): FakeElement[] {
    const line: FakeElement[] = [];
    for (let up = this.parentElement; up; up = up.parentElement) line.push(up);
    return [this, ...line];
  }
  closest(selector: string): FakeElement | null {
    return this.lineage().find((el) => el.matches(selector)) ?? null;
  }
  querySelector(selector: string): FakeElement | null {
    return this.descendants().find((el) => el.matches(selector)) ?? null;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.add(type, listener);
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.remove(type, listener);
  }
  dispatchEvent(event: FakeEvent): boolean {
    event.target ??= this;
    const path = event.bubbles ? this.lineage() : [this];
    for (const current of path) {
      if (event.propagationStopped) break;
      current.listeners.run(event.type, event);
    }
    return !event.defaultPrevented;
  }
  /** A click as a pointer makes it: nothing reaches a disabled button. */
  click(): void {
    if (this.disabled) return;
    this.ownerDocument.pointerDown(this);
    this.dispatchEvent(new FakeEvent("click", { bubbles: true }));
  }
  /** Fire `type` on this element alone, as an old-style test hook. */
  fire(type: string): void {
    this.dispatchEvent(new FakeEvent(type));
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  /** Every element under this one, depth first. */
  descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  all(className: string): FakeElement[] {
    return this.descendants().filter((el) => el.classList.contains(className));
  }
}

export class FakeDocument {
  activeElement: FakeElement | null = null;
  private listeners = new Listeners();
  readonly defaultView = {
    Event: FakeEvent,
    innerWidth: 1000,
    innerHeight: 800,
  };
  createElementNS(_namespace: string, tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  addEventListener(type: string, listener: Listener): void {
    this.listeners.add(type, listener);
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.remove(type, listener);
  }
  listenerCount(type: string): number {
    return this.listeners.count(type);
  }
  /** A pointer landing on `target`, as the document's capture listeners see it. */
  pointerDown(target: FakeElement | null): void {
    const event = new FakeEvent("pointerdown", { bubbles: true });
    event.target = target;
    this.listeners.run("pointerdown", event);
  }
  keyDown(key: string): void {
    const event = new FakeEvent("keydown", { bubbles: true, key });
    event.target = this.activeElement;
    this.listeners.run("keydown", event);
  }
}

export function fakeDocument(): Document {
  return new FakeDocument() as unknown as Document;
}
