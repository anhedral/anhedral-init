import { createClerkClient } from '@clerk/chrome-extension/background';

type ChromeWithSidePanel = typeof chrome & {
  sidePanel: {
    setPanelBehavior: (behavior: { openPanelOnActionClick: boolean }) => Promise<void>;
  };
};

export default defineBackground(() => {
  // Initialize Clerk in the background script for cookie-based auth
  void createClerkClient({
    publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '',
  }).catch(() => {});

  // Open the side panel when the extension icon is clicked.
  (chrome as ChromeWithSidePanel).sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});
