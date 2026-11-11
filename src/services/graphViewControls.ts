/// <reference lib="dom" />

import { config } from "../../package.json";
import type { ExternalWork } from "../domain/externalWork";
import type {
  CitationGraphNode,
  GraphAxisMetric,
  GraphLayoutOptions,
  GraphNodeColorMetric,
  GraphNodeSizeMetric,
  GraphScaleType,
  MetricID,
} from "../domain/graphTypes";
import type { LibrarySnapshot, ZoteroPaper } from "../domain/types";
import { externalWorkDisplayTitle } from "./externalWorkMetadataService";
import { colourOptionHasData, metricHasData } from "./graphLayoutAvailability";
import {
  CHOICE_HOST_ATTRIBUTE,
  createChoiceMenu,
  type ChoiceMenu,
  type ChoiceOption,
} from "./graphChoiceMenu";
import { clamp } from "./graphMetricScale";
import {
  axisMetricDefinitions,
  getMetricDefinition,
  nodeColorMetricDefinitions,
  nodeSizeMetricDefinitions,
} from "./metricRegistry";
import {
  createIcon,
  RAIL_BUTTON_ICON_SIZE,
  type IconName,
} from "./uiIconService";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElementNS(
    HTML_NS,
    tag,
  ) as HTMLElementTagNameMap[K];
  if (className) node.className = className;
  return node;
}

export function text<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  content: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = element(document, tag, className);
  node.textContent = content;
  return node;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

export const PAPER_DETAIL_STYLESHEET_ID = `${config.addonRef}-paper-detail-stylesheet`;
export const PAPER_DETAIL_STYLESHEET_HREF = `chrome://${config.addonRef}/content/paperDetail.css`;

function ensureStylesheet(
  document: Document,
  id: string,
  href: string,
): HTMLLinkElement {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = element(document, "link");
    link.id = id;
    link.rel = "stylesheet";
    (document.head ?? document.documentElement).appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  return link;
}

/** The detail view's stylesheet, in whichever document is about to draw one. */
export function ensurePaperDetailStyles(document: Document): HTMLLinkElement {
  return ensureStylesheet(
    document,
    PAPER_DETAIL_STYLESHEET_ID,
    PAPER_DETAIL_STYLESHEET_HREF,
  );
}

export function ensureStyles(document: Document): void {
  const paperDetailLink = ensurePaperDetailStyles(document);
  const graphLink = ensureStylesheet(
    document,
    `${config.addonRef}-graph-stylesheet`,
    `chrome://${config.addonRef}/content/graph.css`,
  );
  /*
   * graph.css has to come after paperDetail.css: it overrides the shared
   * base rules at the same specificity, so the later sheet is the one that
   * wins. Neither link's position is ours to assume — in a main window
   * installStyles (src/hooks.ts) links paperDetail.css at startup, long
   * before any graph opens, and a standalone graph window links neither
   * until here — so put the graph link directly after the detail one
   * whichever order they arrived in. `after` moves it into the detail
   * link's parent, so this also holds when the two are in different parents.
   */
  // 4 is DOCUMENT_POSITION_FOLLOWING; the bare `Node` global is not a given
  // in the bootstrap sandbox this bundle is loaded into.
  const graphFollows =
    !!(paperDetailLink.compareDocumentPosition(graphLink) & 4) &&
    paperDetailLink.parentNode === graphLink.parentNode;
  if (!graphFollows) paperDetailLink.after(graphLink);
}

export function icon(document: Document, name: IconName): SVGSVGElement {
  return createIcon(document, name);
}

export function networkLogo(document: Document): HTMLSpanElement {
  const logo = element(document, "span", "cm-network-logo");
  logo.setAttribute("aria-hidden", "true");
  return logo;
}

export function iconButtonContent(
  document: Document,
  name: Parameters<typeof icon>[1],
  label: string,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(icon(document, name), text(document, "span", label));
  return fragment;
}

export function formatCount(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat(undefined, { useGrouping: false }).format(value);
}

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function graphNodeSearchText(node: CitationGraphNode): string {
  return normalizeSearch(
    [
      node.title,
      node.authors.join(" "),
      node.doi ?? "",
      node.sourceTitle ?? "",
      node.abstract ?? "",
      node.year ?? "",
      node.provider ?? "",
    ].join(" "),
  );
}

export interface LibraryPaperSearchEntry {
  paper: ZoteroPaper;
  titleText: string;
  authorText: string;
  mainPropertyText: string;
}

export function scoreLibraryPaperSearch(
  entry: LibraryPaperSearchEntry,
  rawQuery: string,
): number {
  const query = normalizeSearch(rawQuery).trim();
  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;
  if (entry.titleText === query) score += 2400;
  else if (entry.titleText.startsWith(query)) score += 1600;
  else if (entry.titleText.includes(query)) score += 900;
  if (entry.authorText.startsWith(query)) score += 650;
  else if (entry.authorText.includes(query)) score += 350;
  if (entry.mainPropertyText.startsWith(query)) score += 240;
  else if (entry.mainPropertyText.includes(query)) score += 120;
  for (const token of tokens) {
    const titleIndex = entry.titleText.indexOf(token);
    const authorIndex = entry.authorText.indexOf(token);
    const propertyIndex = entry.mainPropertyText.indexOf(token);
    if (titleIndex >= 0) score += Math.max(60, 260 - titleIndex);
    else if (authorIndex >= 0) score += Math.max(30, 140 - authorIndex);
    else if (propertyIndex >= 0) score += Math.max(10, 70 - propertyIndex);
  }
  return score;
}

export function externalWorkTitle(work: ExternalWork): string {
  return externalWorkDisplayTitle(work) ?? "Title unavailable";
}

/**
 * The folder names the graph shows for the Scope rail and the region legend.
 * "Collection" was retired as a node colouring on this branch — folder
 * membership is drawn as a shaded region now, selected from the rail's Scope
 * rows — but a region still needs a folder's display name to label its
 * legend entry, which is what this supplies.
 */
export function collectionLabelsByID(
  snapshot: LibrarySnapshot,
): Map<number, string> {
  return new Map(
    snapshot.collections.map((collection) => [
      collection.collectionID,
      collection.path,
    ]),
  );
}

function metricDescription(definition: {
  description: string;
  interpretation?: string;
}): string {
  return [definition.description, definition.interpretation]
    .filter(Boolean)
    .join(" ");
}

interface SelectableMetricDefinition {
  id: MetricID;
  label: string;
  description: string;
  interpretation?: string;
}

const FREE_AXIS_OPTION: ChoiceOption = {
  value: "free",
  label: "Free",
  title:
    "Position nodes freely along this axis. Drag a node to move it along every free axis.",
};

/** The metrics the papers carry, as choices, after any leading ones. */
function metricOptions(
  definitions: ReadonlyArray<SelectableMetricDefinition>,
  nodes: CitationGraphNode[],
  leading: ChoiceOption[] = [],
): ChoiceOption[] {
  return [
    ...leading,
    ...definitions
      .filter((definition) => metricHasData(nodes, definition.id))
      .map((definition) => ({
        value: definition.id,
        label: definition.label,
        title: metricDescription(definition),
      })),
  ];
}

/** `requested` if it is offered, else the first option that is. */
function selectAvailableValue(menu: ChoiceMenu, requested: string): void {
  const options = menu.options;
  const requestedOption = options.find(
    (option) => option.value === requested && !option.disabled,
  );
  const fallback = options.find((option) => !option.disabled);
  menu.value = requestedOption?.value ?? fallback?.value ?? "";
}

function createScaleSelect(
  document: Document,
  selected: GraphScaleType,
): ChoiceMenu {
  return createChoiceMenu(
    document,
    [
      { value: "linear", label: "Lin" },
      { value: "log", label: "Log" },
    ],
    selected,
  );
}

/**
 * The default a new graph opens with, for the kind of graph the gear is on
 * (a library graph and a seeded one keep separate defaults). The gear's own
 * edits stay with its graph (D17); only these write the stored default.
 */
export interface AppearanceDefaults {
  /** What a new graph opens with: the made default, else the built-in one. */
  current: () => GraphLayoutOptions;
  /** Whether the reader has made a default of their own. */
  stored: () => boolean;
  /** Makes `layout` the default. */
  make: (layout: GraphLayoutOptions) => void;
  /** Forgets the made default and answers the built-in one. */
  forget: () => GraphLayoutOptions;
}

export function createAxesAppearance(
  document: Document,
  initial: GraphLayoutOptions,
  nodes: CitationGraphNode[],
  onChange: (layout: GraphLayoutOptions) => void,
  defaults: AppearanceDefaults,
): {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  panel: HTMLDivElement;
  setLayout: (layout: GraphLayoutOptions) => void;
  getLayout: () => GraphLayoutOptions;
  close: () => void;
  /** Open the panel, as its button does; View's Graph display settings (D35). */
  open: () => void;
  /** Reset, and what View's menu offers for new blank graphs (D35). */
  reset: () => void;
  useForNewBlank: () => void;
  restoreBuiltIn: () => void;
  hasStoredDefault: () => boolean;
  /**
   * Enable or disable one colouring's option. Citation hop means nothing
   * without a seed, so the view flips it with seededness; a disabled
   * option that is selected falls back to Uniform.
   */
  setColourOptionAvailable(
    metric: GraphNodeColorMetric,
    available: boolean,
  ): void;
} {
  const root = element(document, "div", "cm-appearance-control");
  const button = element(
    document,
    "button",
    "cm-rail-button cm-appearance-button",
  );
  button.type = "button";
  // Drawn, not typed: "⚙" is a glyph no two interface fonts place alike.
  button.append(createIcon(document, "settings", RAIL_BUTTON_ICON_SIZE));
  button.title = "Graph display settings";
  button.setAttribute("aria-label", "Graph display settings");
  button.setAttribute("aria-expanded", "false");

  const panel = element(document, "div", "cm-appearance-panel");
  panel.hidden = true;
  panel.style.display = "none";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Graph display settings");
  panel.style.width = "min(390px, calc(100vw - 38px))";

  const xMetric = createChoiceMenu(
    document,
    metricOptions(axisMetricDefinitions(), nodes, [FREE_AXIS_OPTION]),
    "",
  );
  selectAvailableValue(xMetric, initial.xMetric);
  const xScale = createScaleSelect(document, initial.xScale);
  const yMetric = createChoiceMenu(
    document,
    metricOptions(axisMetricDefinitions(), nodes, [FREE_AXIS_OPTION]),
    "",
  );
  selectAvailableValue(yMetric, initial.yMetric);
  const yScale = createScaleSelect(document, initial.yScale);
  const sizeMetric = createChoiceMenu(
    document,
    metricOptions(nodeSizeMetricDefinitions(), nodes, [
      {
        value: "uniform",
        label: "Uniform",
        title: "Display every visible node with the same size.",
      },
    ]),
    "",
  );
  selectAvailableValue(sizeMetric, initial.nodeSizeMetric);

  const categoricalDefinitions: Array<{
    value: GraphNodeColorMetric;
    label: string;
    description: string;
    available: boolean;
  }> = [
    {
      value: "publication-type",
      label: "Publication type",
      description:
        "Colour nodes by the publication type reported by the provider.",
      available: colourOptionHasData(nodes, "publication-type"),
    },
    {
      value: "open-access",
      label: "Open Access",
      description: "Distinguish works with known open-access status.",
      available: colourOptionHasData(nodes, "open-access"),
    },
    {
      value: "citation-hop",
      label: "Citation hop",
      description:
        "Colour nodes by how many citation hops they sit from the nearest seed.",
      available: colourOptionHasData(nodes, "citation-hop"),
    },
    {
      value: "seed-links",
      label: "Seeds linked",
      description:
        "Colour hop-1 papers by how many of your seeds they are linked to.",
      available: colourOptionHasData(nodes, "seed-links"),
    },
    {
      value: "read-state",
      label: "Read state",
      description:
        "Colour papers Unread, Reading or Read, from Meristema Reading's read state.",
      available: colourOptionHasData(nodes, "read-state"),
    },
  ];
  const colorMetric = createChoiceMenu(
    document,
    metricOptions(nodeColorMetricDefinitions(), nodes, [
      {
        value: "uniform",
        label: "Uniform",
        title:
          "One colour for every node. Folders are shown as regions, from the rail.",
      },
      ...categoricalDefinitions
        .filter((definition) => definition.available)
        .map((definition) => ({
          value: definition.value,
          label: definition.label,
          title: definition.description,
        })),
    ]),
    "",
  );
  selectAvailableValue(colorMetric, initial.nodeColorMetric);

  const labels = createChoiceMenu(
    document,
    [
      { value: "title", label: "Title" },
      { value: "author-year", label: "Author (year)" },
      { value: "none", label: "No labels" },
    ],
    initial.nodeLabelMode,
  );
  // Named for tests and the stylesheet; the Zotero suite picks through these.
  xMetric.dataset.role = "x-metric";
  xScale.dataset.role = "x-scale";
  yMetric.dataset.role = "y-metric";
  yScale.dataset.role = "y-scale";
  sizeMetric.dataset.role = "size";
  colorMetric.dataset.role = "colour";
  labels.dataset.role = "labels";

  const tabs = element(document, "div", "cm-detail-tabs");
  tabs.style.marginTop = "0";
  const panes = new Map<string, HTMLDivElement>();
  const tabButtons = new Map<string, HTMLButtonElement>();
  const activate = (id: string): void => {
    for (const [key, pane] of panes) {
      const selected = key === id;
      pane.hidden = !selected;
      pane.style.display = selected ? "block" : "none";
      pane.setAttribute("aria-hidden", String(!selected));
    }
    for (const [key, tab] of tabButtons) {
      const selected = key === id;
      tab.dataset.selected = String(selected);
      tab.setAttribute("aria-selected", String(selected));
    }
  };
  const makePane = (id: string, label: string): HTMLDivElement => {
    const tab = element(document, "button");
    tab.type = "button";
    tab.textContent = label;
    tab.dataset.selected = "false";
    tab.setAttribute("role", "tab");
    tabs.appendChild(tab);
    tabButtons.set(id, tab);
    const pane = element(document, "div", "cm-appearance-section");
    pane.hidden = true;
    pane.style.display = "none";
    pane.style.margin = "8px 0 0";
    pane.style.border = "0";
    pane.style.padding = "0";
    pane.setAttribute("role", "tabpanel");
    panes.set(id, pane);
    tab.addEventListener("click", () => activate(id));
    return pane;
  };

  const compactLine = (...controls: HTMLElement[]): HTMLDivElement => {
    const line = element(document, "div", "cm-appearance-row");
    line.style.display = "flex";
    line.style.gridTemplateColumns = "none";
    line.style.alignItems = "center";
    line.style.gap = "6px";
    for (const control of controls) line.appendChild(control);
    return line;
  };
  const labelledLine = (
    label: string,
    control: HTMLElement,
    trailing?: HTMLElement,
  ): HTMLDivElement => {
    const line = compactLine(text(document, "span", label), control);
    const labelNode = line.firstElementChild as HTMLElement | null;
    if (labelNode) labelNode.style.flex = "0 0 44px";
    control.style.flex = "1 1 auto";
    if (trailing) line.appendChild(trailing);
    return line;
  };

  xScale.style.flex = "0 0 64px";
  xMetric.style.flex = "1 1 auto";
  yScale.style.flex = "0 0 64px";
  yMetric.style.flex = "1 1 auto";

  const xPane = makePane("x", "X axis");
  xPane.append(compactLine(xScale, xMetric));
  const yPane = makePane("y", "Y axis");
  yPane.append(compactLine(yScale, yMetric));
  const nodesPane = makePane("nodes", "Nodes");
  nodesPane.append(
    labelledLine("Label", labels),
    labelledLine("Size", sizeMetric),
    labelledLine("Color", colorMetric),
  );
  // Each choice's tooltip is its option's description; the panel carries no
  // prose.

  // The View button names the view a graph came from and marks it edited, so
  // the gear no longer repeats it (W19, after D28).
  panel.append(tabs, xPane, yPane, nodesPane);
  // New blank graphs' default is View's to set (D35); the gear keeps Reset.
  const actions = element(document, "div", "cm-appearance-actions");
  const reset = element(document, "button", "cm-secondary-button");
  reset.type = "button";
  reset.textContent = "Reset";
  reset.title =
    "Put this graph back on the settings a new blank graph opens with.";
  actions.appendChild(reset);
  panel.appendChild(actions);
  root.append(button, panel);
  // The choices' popups hang from the control rather than the panel: the
  // panel scrolls and blurs its backdrop, so a popup inside it is clipped to
  // it, and Color's list runs past its bottom edge.
  root.setAttribute(CHOICE_HOST_ATTRIBUTE, "");

  const read = (): GraphLayoutOptions => ({
    xMetric: xMetric.value as GraphAxisMetric,
    xScale: xScale.value as GraphScaleType,
    yMetric: yMetric.value as GraphAxisMetric,
    yScale: yScale.value as GraphScaleType,
    nodeSizeMetric: sizeMetric.value as GraphNodeSizeMetric,
    nodeColorMetric: colorMetric.value as GraphNodeColorMetric,
    nodeLabelMode: labels.value as GraphLayoutOptions["nodeLabelMode"],
  });
  const updateAvailability = (): void => {
    for (const [metric, scale] of [
      [xMetric, xScale],
      [yMetric, yScale],
    ] as const) {
      const selected = metric.value as GraphAxisMetric;
      const enabled =
        selected !== "free" && getMetricDefinition(selected).graph.logarithmic;
      scale.setOptionDisabled("log", !enabled);
      if (!enabled && scale.value === "log") scale.value = "linear";
      scale.disabled = selected === "free";
    }
  };
  let last = JSON.stringify(read());
  // A change stays with this graph (D17): the stored default moves only
  // through "Use these" and "Restore built-in" (New blank graphs).
  const commit = (layout: GraphLayoutOptions, force = false): void => {
    const signature = JSON.stringify(layout);
    if (!force && signature === last) return;
    onChange(layout);
    last = signature;
  };
  const choices = [
    xMetric,
    xScale,
    yMetric,
    yScale,
    sizeMetric,
    colorMetric,
    labels,
  ];
  for (const control of choices) {
    const applySelection = (): void => {
      updateAvailability();
      commit(read());
    };
    control.addEventListener("change", applySelection);
  }
  const close = (): void => {
    for (const choice of choices) choice.close();
    panel.hidden = true;
    panel.style.display = "none";
    button.setAttribute("aria-expanded", "false");
  };
  const open = (): void => {
    panel.hidden = false;
    panel.style.display = "block";
    button.setAttribute("aria-expanded", "true");
    activate("x");
  };
  button.addEventListener("click", () => {
    if (panel.hidden) open();
    else close();
  });
  const setControls = (layout: GraphLayoutOptions): void => {
    selectAvailableValue(xMetric, layout.xMetric);
    xScale.value = layout.xScale;
    selectAvailableValue(yMetric, layout.yMetric);
    yScale.value = layout.yScale;
    selectAvailableValue(sizeMetric, layout.nodeSizeMetric);
    selectAvailableValue(colorMetric, layout.nodeColorMetric);
    labels.value = layout.nodeLabelMode;
    updateAvailability();
  };
  const setLayout = (layout: GraphLayoutOptions): void => {
    setControls(layout);
    commit(read(), true);
  };
  const resetGraph = (): void => setLayout(defaults.current());
  const useForNewBlank = (): void => {
    defaults.make(read());
  };
  const restoreBuiltIn = (): void => {
    setLayout(defaults.forget());
  };
  reset.addEventListener("click", resetGraph);
  updateAvailability();
  activate("x");
  // What the selects landed on is what this graph can show, not a choice the
  // reader made: a graph without years or counts opens on Free axes, and
  // saving that as the default made every later graph open on Free axes too
  // (da2b54d). Opening stores nothing; only "Use these" does.
  last = JSON.stringify(read());
  return {
    root,
    button,
    panel,
    setLayout,
    getLayout: read,
    close,
    open,
    reset: resetGraph,
    useForNewBlank,
    restoreBuiltIn,
    hasStoredDefault: () => Boolean(defaults.stored()),
    setColourOptionAvailable(metric, available) {
      // Uniform is the fallback, never withheld.
      if (metric === "uniform") return;
      colorMetric.setOptionDisabled(metric, !available);
      if (!available && colorMetric.value === metric) {
        colorMetric.value = "uniform";
        colorMetric.dispatchEvent(
          new (document.defaultView as any).Event("change"),
        );
      }
    },
  };
}

/*
 * A drag handle on a pane's inner edge. Both of the view's side panes use
 * this: the Key rail, whose width grows as the pointer moves right, and the
 * detail pane, whose width grows as it moves left. The drawn width is always
 * clamped, so "drag it shut" is decided from where the pointer is, not from
 * the width: past the minimum by more than the threshold on release means
 * collapse.
 */
export type PaneEdge = "start" | "end";

export type PaneRelease =
  { kind: "commit"; width: number } | { kind: "collapse" };

/** The raw width the pointer asks for: distance from the pane's far edge. */
export function paneWidthFromPointer(
  edge: PaneEdge,
  origin: number,
  clientX: number,
): number {
  return edge === "start" ? clientX - origin : origin - clientX;
}

export function paneRelease(
  raw: number,
  minimum: number,
  maximum: number,
  collapseThreshold: number,
): PaneRelease {
  if (raw < minimum - collapseThreshold) return { kind: "collapse" };
  return { kind: "commit", width: clamp(raw, minimum, maximum) };
}

export interface PaneResizerOptions {
  handle: HTMLElement;
  edge: PaneEdge;
  minimum: number;
  maximum: () => number;
  /** Pixels past the minimum the pointer must go before release collapses. */
  collapseThreshold: number;
  /** The pane's far edge in client x: its left for "start", its right for "end". */
  origin: () => number;
  onBegin: () => void;
  onMove: (width: number) => void;
  /** Called on release only if the pointer moved. */
  onRelease: (release: PaneRelease) => void;
  /** Called on every release, after `onRelease`. */
  onEnd: () => void;
  onToggle: () => void;
}

/** Wire the handle. Returns a function that removes every listener. */
export function attachPaneResizer(options: PaneResizerOptions): () => void {
  const { handle } = options;
  let dragging = false;
  let lastRaw: number | null = null;

  /*
   * Pointer capture is load-bearing here: every listener is on the handle, so
   * without it a pointerup over the plot or outside the window never reaches
   * this code, `onEnd` never runs, and the binding's local-change depth stays
   * above zero — the pane would stop hearing from Zotero for the rest of the
   * session. `lostpointercapture` is the safety net for the cases where the
   * capture is refused or taken away mid-drag.
   */
  const onPointerDown = (event: PointerEvent): void => {
    dragging = true;
    lastRaw = null;
    handle.setPointerCapture?.(event.pointerId);
    options.onBegin();
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    lastRaw = paneWidthFromPointer(
      options.edge,
      options.origin(),
      event.clientX,
    );
    options.onMove(clamp(lastRaw, options.minimum, options.maximum()));
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    // Releasing throws when the pointer is already gone (a lost capture after
    // the pointer left). onEnd must still run, or the binding's local-change
    // depth never returns to zero and it stops notifying for good.
    try {
      handle.releasePointerCapture?.(event.pointerId);
    } catch {
      // Nothing to release.
    }
    if (lastRaw !== null) {
      options.onRelease(
        paneRelease(
          lastRaw,
          options.minimum,
          options.maximum(),
          options.collapseThreshold,
        ),
      );
    }
    options.onEnd();
  };
  const onDoubleClick = (): void => options.onToggle();

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", onPointerUp);
  handle.addEventListener("pointercancel", onPointerUp);
  // A no-op after a normal pointerup, which has already cleared `dragging`.
  handle.addEventListener("lostpointercapture", onPointerUp);
  handle.addEventListener("dblclick", onDoubleClick);
  return () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", onPointerUp);
    handle.removeEventListener("pointercancel", onPointerUp);
    handle.removeEventListener("lostpointercapture", onPointerUp);
    handle.removeEventListener("dblclick", onDoubleClick);
  };
}
