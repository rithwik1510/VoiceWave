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
  const dispatchKeyEvent = (
    target: EventTarget,
    type: "keydown" | "keyup",
    init: KeyboardEventInit
  ): KeyboardEvent => {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

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

  it("releases push-to-talk when window loses focus", async () => {
    vi.useFakeTimers();
    render(<HookProbe />);

    await act(async () => {
      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", ctrlKey: true, metaKey: true });
    });
    expect(screen.getByTestId("state").textContent).toBe("listening");

    await act(async () => {
      fireEvent.blur(window);
      vi.runAllTimers();
    });
    expect(screen.getByTestId("state").textContent).toBe("idle");
  });

  it("releases push-to-talk when document becomes hidden", async () => {
    vi.useFakeTimers();
    render(<HookProbe />);

    await act(async () => {
      fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", ctrlKey: true, metaKey: true });
    });
    expect(screen.getByTestId("state").textContent).toBe("listening");

    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true
    });

    try {
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        vi.runAllTimers();
      });
    } finally {
      if (hiddenDescriptor) {
        Object.defineProperty(document, "hidden", hiddenDescriptor);
      } else {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => false
        });
      }
    }

    expect(screen.getByTestId("state").textContent).toBe("idle");
  });

  it("suppresses browser default handling for configured hotkeys outside editable targets", () => {
    render(<HookProbe />);

    const toggleHotkey = dispatchKeyEvent(window, "keyup", {
      key: "x",
      code: "KeyX",
      ctrlKey: true,
      altKey: true
    });
    expect(toggleHotkey.defaultPrevented).toBe(true);

    const modifierSpace = dispatchKeyEvent(window, "keydown", {
      key: " ",
      code: "Space",
      ctrlKey: true
    });
    expect(modifierSpace.defaultPrevented).toBe(true);
  });

  it("does not suppress browser default handling for editable targets", () => {
    render(
      <div>
        <HookProbe />
        <input data-testid="editable" />
      </div>
    );
    const editable = screen.getByTestId("editable");

    const event = dispatchKeyEvent(editable, "keydown", {
      key: "x",
      code: "KeyX",
      ctrlKey: true,
      altKey: true
    });

    expect(event.defaultPrevented).toBe(false);
  });
});
