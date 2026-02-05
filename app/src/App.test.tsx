import { render, screen } from '@testing-library/react';

import App from './App';

describe('App', () => {
  it('renders welcome heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /welcome to tauri \+ react/i })).toBeVisible();
  });
});
