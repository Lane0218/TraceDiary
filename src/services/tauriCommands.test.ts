import { invoke } from "@tauri-apps/api/core";

import { setPassword, verifyPassword } from "./tauriCommands";

jest.mock("@tauri-apps/api/core", () => ({ invoke: jest.fn() }));

describe("tauriCommands", () => {
  it("setPassword uses the expected invoke arg name", async () => {
    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockResolvedValueOnce(undefined);

    await setPassword("Trace2026");

    expect(invokeMock).toHaveBeenCalledWith("set_password", { passwordInput: "Trace2026" });
  });

  it("verifyPassword uses the expected invoke arg name", async () => {
    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockResolvedValueOnce(undefined);

    await verifyPassword("Trace2026");

    expect(invokeMock).toHaveBeenCalledWith("verify_password", { passwordInput: "Trace2026" });
  });
});

