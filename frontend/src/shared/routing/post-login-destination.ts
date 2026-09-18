const DEFAULT_POST_LOGIN_DESTINATION = "/app";
const INTERNAL_ORIGIN = "https://top.internal";
const INVALID_PERCENT_ENCODING = /%(?![0-9a-f]{2})/i;
const AMBIGUOUS_PATH_ENCODING = /%(?:2e|2f|5c)/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function resolvePostLoginDestination(
  candidate: string | null | undefined,
): string {
  if (!candidate || candidate !== candidate.trim()) {
    return DEFAULT_POST_LOGIN_DESTINATION;
  }

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    CONTROL_CHARACTER.test(candidate)
  ) {
    return DEFAULT_POST_LOGIN_DESTINATION;
  }

  const pathEnd = candidate.search(/[?#]/);
  const rawPath = pathEnd === -1 ? candidate : candidate.slice(0, pathEnd);

  if (
    INVALID_PERCENT_ENCODING.test(rawPath) ||
    AMBIGUOUS_PATH_ENCODING.test(rawPath)
  ) {
    return DEFAULT_POST_LOGIN_DESTINATION;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return DEFAULT_POST_LOGIN_DESTINATION;
  }

  if (
    decodedPath.includes("\\") ||
    CONTROL_CHARACTER.test(decodedPath) ||
    AMBIGUOUS_PATH_ENCODING.test(decodedPath) ||
    decodedPath.split("/").includes("..")
  ) {
    return DEFAULT_POST_LOGIN_DESTINATION;
  }

  try {
    const destination = new URL(candidate, INTERNAL_ORIGIN);
    const pathname = destination.pathname;

    if (
      destination.origin !== INTERNAL_ORIGIN ||
      (pathname !== "/app" && !pathname.startsWith("/app/"))
    ) {
      return DEFAULT_POST_LOGIN_DESTINATION;
    }

    return `${pathname}${destination.search}${destination.hash}`;
  } catch {
    return DEFAULT_POST_LOGIN_DESTINATION;
  }
}
