import { render, screen } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';

import App from './App';

describe('App history panel virtualization', () => {
  it('does not render all rows at once when many historical entries exist', async () => {
    // Simulate a far future year so there can be 50+ "past years same day" entries.
    jest.useFakeTimers().setSystemTime(new Date('2076-02-05T12:00:00'));

    const many = Array.from({ length: 54 }, (_, i) => {
      const year = 2075 - i; // 2075..2022 (unique years)
      return {
        date: `${year}-02-05`,
        year,
        preview: `p${i}`,
        word_count: i,
      };
    });

    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_auth_status')
        return Promise.resolve({ password_set: true, needs_verify: false });
      if (cmd === 'get_diary') return Promise.resolve(null);
      if (cmd === 'list_diary_days_in_month') return Promise.resolve([]);
      if (cmd === 'list_historical_diaries') return Promise.resolve(many);
      return Promise.resolve(null);
    });

    render(<App />);

    await screen.findByRole('button', { name: /2075年 2075-02-05/ });

    const rendered = screen.getAllByRole('button', {
      name: /\d{4}年 \d{4}-\d{2}-\d{2}/,
    });

    expect(rendered.length).toBeLessThan(54);
  });
});
