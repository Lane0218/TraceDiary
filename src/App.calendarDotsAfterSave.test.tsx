import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';

import App from './App';

describe('App calendar dots (save flow)', () => {
  it('adds a highlight on the calendar after saving a new diary in the current month', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-05T12:00:00'));

    const invokeMock = invoke as unknown as jest.Mock;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_auth_status')
        return Promise.resolve({ password_set: true, needs_verify: false });
      if (cmd === 'get_diary') return Promise.resolve(null);
      if (cmd === 'list_diary_days_in_month') return Promise.resolve([]); // initially empty
      if (cmd === 'list_historical_diaries') return Promise.resolve([]);
      if (cmd === 'save_diary')
        return Promise.resolve({
          date: '2026-02-05',
          content: 'hi',
          word_count: 2,
          modified_at: '1770289623',
        });
      return Promise.resolve(null);
    });

    render(<App />);

    const dayBtn = await screen.findByRole('button', { name: '2026-02-05' });
    expect(dayBtn).not.toHaveClass('has-entry');

    fireEvent.change(screen.getByRole('textbox', { name: '日记内容' }), {
      target: { value: 'hi' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(dayBtn).toHaveClass('has-entry');
    });
  });
});
