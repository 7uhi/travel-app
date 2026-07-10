/**
 * Discriminated union returned by every server action instead of throwing,
 * so client components can narrow on `success` and render errors inline.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function fail(error: string): { success: false; error: string } {
  return { success: false, error };
}
