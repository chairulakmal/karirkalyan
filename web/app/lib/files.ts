// Must match the server-side limit (files are stored in a bytea column and
// validated at 1 MB in the Rails model). Checking client-side spares the user
// a full upload round-trip just to learn the file is too big.
export const MAX_FILE_BYTES = 1_048_576;

export function fileTooLargeMessage(size: number): string {
  return `That file is ${(size / MAX_FILE_BYTES).toFixed(1)} MB — the limit is 1 MB.`;
}
