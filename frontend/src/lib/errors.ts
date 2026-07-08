/** Normalize an unknown thrown value to a user-displayable message. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
