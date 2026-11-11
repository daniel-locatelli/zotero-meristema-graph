import { describe, it } from "node:test";
import { expect } from "chai";
import {
  isPluginWrite,
  READING_MIRROR_MARK,
  SELF_WRITE_MARK,
} from "../../src/services/automaticUpdateCoordinator";

describe("automatic update marks", () => {
  it("skips Meristema's own writes and Meristema Reading's mirror", () => {
    expect(isPluginWrite({ [SELF_WRITE_MARK]: true })).to.equal(true);
    expect(isPluginWrite({ [READING_MIRROR_MARK]: true })).to.equal(true);
  });
  it("updates for any other modify", () => {
    expect(isPluginWrite(undefined)).to.equal(false);
    expect(isPluginWrite({})).to.equal(false);
    expect(isPluginWrite({ [READING_MIRROR_MARK]: false })).to.equal(false);
  });
});
