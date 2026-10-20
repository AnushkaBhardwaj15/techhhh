import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppErrorBoundary } from './AppErrorBoundary';

function BrokenPage(): never {
  throw new Error('private@example.test secret-token');
}

describe('AppErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows safe recovery guidance and logs only redacted render metadata', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppErrorBoundary><BrokenPage /></AppErrorBoundary>);

    expect(await screen.findByRole('alert')).toHaveTextContent('This page hit a problem. Reload to try again.');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.queryByText(/private@example|secret-token/)).not.toBeInTheDocument();
    const safeLog = errorLog.mock.calls.find(([label]) => label === 'Tech Tombola diagnostic');
    expect(safeLog?.[1]).toMatchObject({ type: 'render' });
    expect(JSON.stringify(safeLog?.[1])).not.toMatch(/private@example|secret-token/);
  });
});
