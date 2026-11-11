import { describe, it } from "node:test";
import { expect } from "chai";
import type { GraphLayoutOptions } from "../../src/domain/graphTypes";
import {
  createAxesAppearance,
  type AppearanceDefaults,
} from "../../src/services/graphViewControls";
import { FakeDocument, type FakeElement } from "./controlDoubles";
import { node } from "./graphRendererDoubles";

const fakeDocument = new FakeDocument() as unknown as Document;

const SAVED: GraphLayoutOptions = {
  xMetric: "year",
  xScale: "linear",
  yMetric: "citations",
  yScale: "linear",
  nodeSizeMetric: "citations",
  nodeColorMetric: "uniform",
  nodeLabelMode: "author-year",
};

const BUILT_IN: GraphLayoutOptions = {
  ...SAVED,
  nodeColorMetric: "publication-type",
};

/** The stored default, kept in memory: `persisted` is every write. */
function fakeDefaults(initiallyStored: boolean): {
  defaults: AppearanceDefaults;
  persisted: GraphLayoutOptions[];
  forgotten: () => number;
} {
  const persisted: GraphLayoutOptions[] = [];
  let stored: GraphLayoutOptions | null = initiallyStored ? SAVED : null;
  let forgets = 0;
  return {
    persisted,
    forgotten: () => forgets,
    defaults: {
      current: () => stored ?? BUILT_IN,
      stored: () => stored !== null,
      make: (layout) => {
        persisted.push(layout);
        stored = layout;
      },
      forget: () => {
        forgets += 1;
        stored = null;
        return BUILT_IN;
      },
    },
  };
}

/**
 * The gear lists only the metrics the loaded papers carry, so a graph with
 * no year or count shows Free axes. That is what this graph can show, not a
 * choice the reader made: opening it must leave the saved appearance alone,
 * or every graph opened after it starts on Free axes too. The Zotero suite's
 * empty-library case did exactly that to the folder-region case after it,
 * whose plot then had no frame or axes to paint.
 */
describe("The gear's appearance on opening", () => {
  it("shows Free axes on a graph without data, and saves nothing", () => {
    const { defaults, persisted } = fakeDefaults(false);
    const gear = createAxesAppearance(
      fakeDocument,
      SAVED,
      [],
      () => {},
      defaults,
    );
    expect(gear.getLayout().xMetric).to.equal("free");
    expect(gear.getLayout().yMetric).to.equal("free");
    expect(persisted, "the saved appearance was overwritten").to.deep.equal([]);
  });

  it("shows the saved appearance where the papers carry it", () => {
    const { defaults, persisted } = fakeDefaults(false);
    const gear = createAxesAppearance(
      fakeDocument,
      SAVED,
      [node("a", { year: 2020, citationCount: 4 })],
      () => {},
      defaults,
    );
    expect(gear.getLayout()).to.deep.equal(SAVED);
    expect(persisted).to.deep.equal([]);
  });
});

/** The papers carry what every layout below asks for. */
const RICH = [
  node("a", {
    year: 2020,
    citationCount: 4,
    publicationType: "journal-article",
    provider: "openalex",
  }),
];

function buttonReading(
  gear: { root: HTMLDivElement },
  label: string,
): FakeElement {
  const found = (gear.root as unknown as FakeElement)
    .descendants()
    .find((el) => el.tagName === "button" && el.textContent === label);
  if (!found) throw new Error(`no button reading ${label}`);
  return found;
}

function colourChoice(gear: { root: HTMLDivElement }): FakeElement {
  const found = (gear.root as unknown as FakeElement)
    .descendants()
    .find((el) => el.dataset.role === "colour");
  if (!found) throw new Error("no colour choice");
  return found;
}

/** Open the gear's Color choice and click `value`'s row, as the reader does. */
function pickColour(gear: { root: HTMLDivElement }, value: string): void {
  colourChoice(gear).click();
  const row = (gear.root as unknown as FakeElement)
    .all("cm-choice-row")
    .find((el) => el.dataset.value === value);
  if (!row) throw new Error(`no ${value} row`);
  row.click();
}

/**
 * D17: a gear edit stays with its graph. The stored default changes only
 * through View's menu, which calls the two handlers these cases call.
 */
describe("The gear's default", () => {
  it("keeps an edit with the graph and stores nothing", () => {
    const { defaults, persisted } = fakeDefaults(false);
    const changes: GraphLayoutOptions[] = [];
    const gear = createAxesAppearance(
      fakeDocument,
      BUILT_IN,
      RICH,
      (layout) => changes.push(layout),
      defaults,
    );
    pickColour(gear, "citations");
    expect(changes.map((layout) => layout.nodeColorMetric)).to.deep.equal([
      "citations",
    ]);
    expect(persisted, "a gear edit stored a default").to.deep.equal([]);
  });

  it("stores the graph's settings when View asks", () => {
    const { defaults, persisted } = fakeDefaults(false);
    const gear = createAxesAppearance(
      fakeDocument,
      BUILT_IN,
      RICH,
      () => {},
      defaults,
    );
    pickColour(gear, "citations");
    gear.useForNewBlank();
    expect(persisted).to.deep.equal([
      { ...BUILT_IN, nodeColorMetric: "citations" },
    ]);
  });

  it("forgets a made default when View asks, and shows the built-in one", () => {
    const { defaults, forgotten } = fakeDefaults(true);
    const changes: GraphLayoutOptions[] = [];
    const gear = createAxesAppearance(
      fakeDocument,
      SAVED,
      RICH,
      (layout) => changes.push(layout),
      defaults,
    );
    gear.restoreBuiltIn();
    expect(forgotten()).to.equal(1);
    expect(gear.getLayout()).to.deep.equal(BUILT_IN);
    expect(changes.at(-1)).to.deep.equal(BUILT_IN);
  });

  it("offers only Reset, with no label (the 2026-11-04 walk)", () => {
    const gear = createAxesAppearance(
      fakeDocument,
      BUILT_IN,
      RICH,
      () => {},
      fakeDefaults(true).defaults,
    );
    const actions = (gear.root as unknown as FakeElement)
      .descendants()
      .find((el) => el.className.split(" ").includes("cm-appearance-actions"));
    expect(actions?.children.map((child) => child.textContent)).to.deep.equal([
      "Reset",
    ]);
  });

  it("puts the graph back on the default with Reset, storing nothing", () => {
    const { defaults, persisted, forgotten } = fakeDefaults(true);
    const gear = createAxesAppearance(
      fakeDocument,
      BUILT_IN,
      RICH,
      () => {},
      defaults,
    );
    buttonReading(gear, "Reset").fire("click");
    expect(gear.getLayout()).to.deep.equal(SAVED);
    expect(persisted).to.deep.equal([]);
    expect(forgotten()).to.equal(0);
  });
});
