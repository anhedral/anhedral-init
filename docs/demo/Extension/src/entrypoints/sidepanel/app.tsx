import * as React from 'react';
import { useAuth } from '../../contexts/auth-context';
import { SignIn } from '@clerk/chrome-extension';
import { Button } from '../../components/ui/button';

type PageSnapshot = {
  title: string;
  location: string;
};

export function SidePanelApp() {
  const { isSignedIn, isLoading, signOut, subscription } = useAuth();
  const [page, setPage] = React.useState<PageSnapshot | null>(null);
  const [pageError, setPageError] = React.useState<string | null>(null);

  const readActivePage = React.useCallback(async () => {
    setPageError(null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      setPageError('No active tab is available.');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'ANHEDRAL_PAGE_SNAPSHOT' });
      setPage(response as PageSnapshot);
    } catch {
      setPageError('Refresh the active page, then try again.');
    }
  }, []);

  if (isLoading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>;
  }

  if (!isSignedIn) {
    return (
      <div style={{ padding: 24 }}>
        <SignIn />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Welcome!</h2>
      <p>Subscription: {subscription.status}</p>
      <Button type="button" onClick={() => void readActivePage()}>Read active page</Button>
      {page ? (
        <div style={{ marginTop: 16 }}>
          <strong>{page.title || 'Untitled page'}</strong>
          <p style={{ overflowWrap: 'anywhere' }}>{page.location}</p>
        </div>
      ) : null}
      {pageError ? <p style={{ color: 'hsl(var(--destructive))' }}>{pageError}</p> : null}
      <Button type="button" variant="outline" onClick={signOut}>Sign Out</Button>
    </div>
  );
}
