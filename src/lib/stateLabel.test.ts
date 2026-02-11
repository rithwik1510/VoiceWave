import { describe, expect, it } from "vitest";
import { stateClassName, stateLabel } from "./stateLabel";

describe("stateLabel helpers", () => {
  it("maps all phase one HUD states", () => {
    expect(stateLabel("idle")).toBe("Idle");
    expect(stateLabel("listening")).toBe("Listening");
    expect(stateLabel("transcribing")).toBe("Transcribing");
    expect(stateLabel("inserted")).toBe("Inserted");
    expect(stateLabel("error")).toBe("Error");
  });

  it("provides distinct style classes for each state", () => {
    expect(stateClassName("idle")).not.toBe(stateClassName("listening"));
    expect(stateClassName("transcribing")).not.toBe(stateClassName("error"));
  });
});
