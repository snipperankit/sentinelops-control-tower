import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopBar } from "./TopBar.js";

describe("TopBar", () => {
  it("invokes the emergency stop callback on click, and never calls a tool directly", async () => {
    const onEmergencyStop = vi.fn();
    const user = userEvent.setup();
    render(
      <TopBar
        sessionId="incident-1"
        live={false}
        onEmergencyStop={onEmergencyStop}
        emergencyStopDisabled={false}
      />,
    );
    await user.click(screen.getByTestId("emergency-stop-button"));
    expect(onEmergencyStop).toHaveBeenCalledTimes(1);
  });

  it("disables the emergency stop button once the session is already terminal", () => {
    render(
      <TopBar
        sessionId="incident-1"
        live={false}
        onEmergencyStop={() => {}}
        emergencyStopDisabled
      />,
    );
    expect(screen.getByTestId("emergency-stop-button")).toBeDisabled();
  });

  it("shows the harness live indicator distinctly from demo mode", () => {
    const { rerender } = render(
      <TopBar
        sessionId="incident-1"
        live
        onEmergencyStop={() => {}}
        emergencyStopDisabled={false}
      />,
    );
    expect(screen.getByTestId("harness-live-indicator")).toHaveTextContent("harness live");

    rerender(
      <TopBar
        sessionId="incident-1"
        live={false}
        onEmergencyStop={() => {}}
        emergencyStopDisabled={false}
      />,
    );
    expect(screen.getByTestId("harness-live-indicator")).toHaveTextContent("demo mode");
  });
});
