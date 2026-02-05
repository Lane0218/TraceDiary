import { render, screen } from '@testing-library/react';

import App from './App';

describe('App', () => {
  it('renders app heading', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /tracediary/i })).toBeVisible();
    // Wait for the auth panel to appear (driven by mocked Tauri invoke).
    expect(await screen.findByRole('heading', { name: /首次设置密码/i })).toBeVisible();
  });
});
