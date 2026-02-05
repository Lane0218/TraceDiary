import '@testing-library/jest-dom';

// jsdom does not provide ResizeObserver; react-window relies on it.
// This lightweight stub is sufficient for unit tests.
class ResizeObserverStub {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly callback: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(callback: any) {
    this.callback = callback;
  }

  observe(): void {
    // No-op: tests can rely on List defaultHeight rather than actual DOM measurements.
    if (typeof this.callback === 'function') this.callback([], this);
  }

  unobserve(): void {
    // no-op
  }

  disconnect(): void {
    // no-op
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ResizeObserverStub;

// Tauri API is unavailable in Jest (jsdom). Provide a lightweight mock so components
// can mount without noisy console errors.
jest.mock('@tauri-apps/api/core', () => {
  return {
    invoke: jest.fn((cmd: string) => {
      if (cmd === 'get_auth_status') {
        return Promise.resolve({ password_set: false, needs_verify: false });
      }
      if (cmd === 'get_diary') {
        return Promise.resolve(null);
      }
      if (cmd === 'list_diary_days_in_month') {
        return Promise.resolve([]);
      }
      if (cmd === 'list_historical_diaries') {
        return Promise.resolve([]);
      }
      return Promise.resolve(null);
    }),
  };
});
