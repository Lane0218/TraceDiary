import { fireEvent, render, screen } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';

import App from './App';

describe('App history panel (flow)', () => {
  it('renders historical items and clicking one jumps to that date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-05T12:00:00'));

    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_auth_status')
        return Promise.resolve({ password_set: true, needs_verify: false });
      if (cmd === 'get_diary') return Promise.resolve(null);
      if (cmd === 'list_diary_days_in_month') return Promise.resolve([]);
      if (cmd === 'list_historical_diaries')
        return Promise.resolve([
          {
            date: '2025-02-05',
            year: 2025,
            preview: 'hello',
            word_count: 5,
          },
        ]);
      return Promise.resolve(null);
    });

    render(<App />);

    const card = await screen.findByRole('button', { name: /2025年/i });
    expect(card).toBeVisible();

    fireEvent.click(card);
    expect(await screen.findByText('2025-02-05')).toBeVisible();
  });
});
