import { invoke } from '@tauri-apps/api/core';

import { listDiaryDaysInMonth, setPassword, verifyPassword } from './tauriCommands';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));

describe('tauriCommands', () => {
  it('setPassword uses the expected invoke arg name', async () => {
    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockResolvedValueOnce(undefined);

    await setPassword('Trace2026');

    expect(invokeMock).toHaveBeenCalledWith('set_password', {
      passwordInput: 'Trace2026',
    });
  });

  it('verifyPassword uses the expected invoke arg name', async () => {
    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockResolvedValueOnce(undefined);

    await verifyPassword('Trace2026');

    expect(invokeMock).toHaveBeenCalledWith('verify_password', {
      passwordInput: 'Trace2026',
    });
  });

  it('listDiaryDaysInMonth calls the expected command', async () => {
    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockResolvedValueOnce([5, 20]);

    const days = await listDiaryDaysInMonth(2026, 2);

    expect(days).toEqual([5, 20]);
    expect(invokeMock).toHaveBeenCalledWith('list_diary_days_in_month', {
      year: 2026,
      month: 2,
    });
  });
});
