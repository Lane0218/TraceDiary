import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

function QueryClientProbe() {
  const query = useQuery({
    queryKey: ['probe-query'],
    queryFn: async () => 'query-ready',
  })

  const mutation = useMutation({
    mutationFn: async () => 'mutation-ready',
  })

  return (
    <div>
      <p>{query.data ?? 'loading'}</p>
      <button onClick={() => mutation.mutate()}>run-mutation</button>
      <p>{mutation.data ?? 'idle'}</p>
    </div>
  )
}

describe('TanStack Query 全局能力', () => {
  it('应可正常使用 query 与 mutation', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <QueryClientProbe />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('query-ready')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'run-mutation' }))
    await waitFor(() => expect(screen.getByText('mutation-ready')).toBeTruthy())
  })
})
