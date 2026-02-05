import { fireEvent, render, screen } from '@testing-library/react';

import { MarkdownEditor } from './MarkdownEditor';

describe('MarkdownEditor (test fallback)', () => {
  it('renders a textarea and forwards changes', () => {
    const handleChange = jest.fn<void, [string]>();

    render(<MarkdownEditor value="hello" onChange={handleChange} ariaLabel="日记内容" />);

    const textbox = screen.getByRole('textbox', { name: '日记内容' });
    fireEvent.change(textbox, { target: { value: 'next' } });

    expect(handleChange).toHaveBeenCalledWith('next');
  });
});

