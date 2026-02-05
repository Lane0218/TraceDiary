import { render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';

import App from './App';

describe('App calendar dots (flow)', () => {
  it('requests monthly days and renders dots on the calendar', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-05T12:00:00'));

    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_auth_status')
        return Promise.resolve({ password_set: true, needs_verify: false });
      if (cmd === 'get_diary') return Promise.resolve(null);
      if (cmd === 'list_diary_days_in_month') return Promise.resolve([5, 20]);
      return Promise.resolve(null);
    });

    render(<App />);

    // Wait for initial auth + diary load to settle (avoid async updates after the test ends).
    await screen.findByText('未找到该日期的日记');

    // Calendar day buttons exist; dot should appear for 2026-02-05 because the month list includes day 5.
    const dayBtn = await screen.findByRole('button', { name: '2026-02-05' });
    await waitFor(() => {
      expect(dayBtn).toHaveClass('has-entry');
    });
  });
});
