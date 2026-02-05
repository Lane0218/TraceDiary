import '@testing-library/jest-dom';

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
      return Promise.resolve(null);
    }),
  };
});
