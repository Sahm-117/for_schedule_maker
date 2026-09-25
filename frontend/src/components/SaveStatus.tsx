import React from 'react';
import Spinner from './Spinner';

export type SaveState = 'saving' | 'saved' | 'error';

// Small inline feedback for controls that save the moment they change (e.g. an
// attendance dropdown): a spinner while saving, a tick once saved, red on failure.
const SaveStatus: React.FC<{ state?: SaveState }> = ({ state }) => {
  if (!state) return null;
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500" role="status">
        <Spinner className="h-3 w-3" />
        Saving…
      </span>
    );
  }
  if (state === 'saved') {
    return <span className="text-xs font-semibold text-emerald-700" role="status">✓ Saved</span>;
  }
  return <span className="text-xs font-semibold text-red-700" role="alert">Couldn’t save, try again</span>;
};

export default SaveStatus;
