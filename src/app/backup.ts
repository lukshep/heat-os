import type { AppState } from '../data/model';
import { deserializeState, serializeState } from '../data/storage';

/**
 * Hands the user a backup file. On a phone that means the share sheet, which is the only
 * dependable way to save a file from an installed web app; elsewhere it is a download.
 */
export async function exportBackup(state: AppState, dayKey: string): Promise<void> {
  const file = new File([serializeState(state)], `heat-backup-${dayKey}.json`, { type: 'application/json' });

  const onPhone = window.matchMedia('(pointer: coarse)').matches;
  if (onPhone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // Closing the share sheet is a decision, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Reads a chosen backup file. Returns null if it is not a HEAT backup this version can read. */
export async function readBackup(file: File): Promise<AppState | null> {
  return deserializeState(await file.text());
}
