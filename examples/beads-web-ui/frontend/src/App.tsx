import { AppLayout, ConnectionStatus } from '@/components';
import { useIssues } from '@/hooks';

function App() {
  const { connectionState, reconnectAttempts, retryConnection } = useIssues();

  return (
    <AppLayout
      actions={
        <ConnectionStatus
          state={connectionState}
          reconnectAttempts={reconnectAttempts}
          onRetry={retryConnection}
          variant="inline"
        />
      }
    >
      <p>Task management interface for beads.</p>
    </AppLayout>
  );
}

export default App;
