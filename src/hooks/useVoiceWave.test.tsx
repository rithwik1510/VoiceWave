import { fireEvent, render, screen } from "@testing-library/react";
import { act, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVoiceWave } from "./useVoiceWave";

function HookProbe() {
  const { activeState, runDictation, snapshot, stopDictation } = useVoiceWave();

  useEffect(() => {
    return () => {
      // Ensures cleanup is exercised when component unmounts.
    };
  }, []);

  return (
    <div>
      <button type="button" onClick={() => void runDictation("fixture")}>
        run
      </button>
      <button type="button" onClick={() => void stopDictation()}>
        stop
      </button>
      <span data-testid="state">{activeState}</span>
      <span data-testid="partial">{snapshot.lastPartial ?? ""}</span>
      <span data-testid="final">{snapshot.lastFinal ?? ""}</span>
    </div>
  );
}

describe("useVoiceWave web fallback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels scheduled state transitions when stop is pressed", async () => {
    vi.useFakeTimers();
    render(<HookProbe />);

    await act(async () => {
      fireEvent.click(screen.getByText("run"));
    });

    expect(screen.getByTestId("state").textContent).toBe("listening");

    await act(async () => {
      fireEvent.click(screen.getByText("stop"));
      vi.runAllTimers();
    });

    expect(screen.getByTestId("state").textContent).toBe("idle");
    expect(screen.getByTestId("partial").textContent).toBe("");
  });

  it("toggles dictation with default hotkey in web fallback", async () => {
    vi.useFakeTimers();
    render(<HookProbe />);

    await act(async () => {
      fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true, altKey: true });
    });
    expect(screen.getByTestId("state").textContent).toBe("listening");

    await act(async () => {
      fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true, altKey: true });
    });
    expect(screen.getByTestId("state").textContent).toBe("idle");
  });

  it("starts and stops with push-to-talk key lifecycle", async () => {
    vi.useFakeTimers();
    render(<HookProbe />);

    await act(async () => {
      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", ctrlKey: true, metaKey: true });
    });
    expect(screen.getByTestId("state").textContent).toBe("listening");

    await act(async () => {
      fireEvent.keyUp(window, { key: "Meta", code: "MetaLeft", ctrlKey: true, metaKey: false });
      vi.runAllTimers();
    });
    expect(screen.getByTestId("state").textContent).toBe("idle");
  });
});
