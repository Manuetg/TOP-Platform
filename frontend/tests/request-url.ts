/** Resolve a captured browser request without assuming an absolute API base. */
export function requestUrl(value: string | URL): URL {
  return new URL(value, window.location.origin);
}
