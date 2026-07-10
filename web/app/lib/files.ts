// Must match the server-side limit (files are stored in a bytea column and
// validated at 1 MB in the Rails model). Checking client-side spares the user
// a full upload round-trip just to learn the file is too big.
export const MAX_FILE_BYTES = 1_048_576;

/**
 * The oversize file's size in MB, to one decimal — the only number the
 * "too large" message needs. The sentence itself lives in the `files.tooLarge`
 * catalog entry, which interpolates this.
 */
export function fileSizeMb(bytes: number): string {
  return (bytes / MAX_FILE_BYTES).toFixed(1);
}
