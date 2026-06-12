import type { TFunction } from "i18next";

const TIMEOUT_NAME = "TimeoutError";

/**
 * Reject if `promise` doesn't settle within `ms`. A network drop or a paused
 * backend can leave a fetch pending forever; without this the caller's
 * try/finally never runs and a submit button spins indefinitely.
 *
 * Note: this rejects the wait, it does not cancel the underlying request — the
 * caller should treat a timeout as "unknown outcome, safe to retry".
 */
export function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`Request timed out after ${Math.round(ms / 1000)}s`);
      e.name = TIMEOUT_NAME;
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export function isTimeoutError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === TIMEOUT_NAME;
}

/** Map a thrown DB/network error to a short, human-readable message for a toast. */
export function describeDbError(e: unknown, t: TFunction): string {
  const err = (e && typeof e === "object" ? e : {}) as { name?: string; code?: string; message?: string };
  if (err.name === TIMEOUT_NAME) {
    return t("errors.timeout", "The request timed out — check your connection and try again.");
  }
  switch (err.code) {
    case "23505": // unique_violation — duplicate cage, phone, serial, etc.
      return t("errors.duplicate", "This conflicts with an existing record — a cage or number may already be in use.");
    case "23503": // foreign_key_violation
      return t("errors.linkMissing", "A linked record is missing. Refresh and try again.");
    case "23502": // not_null_violation
    case "23514": // check_violation
      return t("errors.invalidValue", "Some values are invalid. Please review and try again.");
    case "42501": // RLS / insufficient_privilege
    case "PGRST301":
      return t("errors.unauthorized", "Your session may have expired. Sign in again and retry.");
  }
  if (typeof err.message === "string" && err.message.trim()) return err.message;
  return t("errors.database", "Database error. Please try again.");
}

/** Friendly message for a media-upload failure (file too large, network, storage, …). */
export function describeUploadError(e: unknown, t: TFunction): string {
  const err = (e && typeof e === "object" ? e : {}) as { name?: string; maxMb?: number; message?: string };
  if (err.name === "FileTooLargeError") {
    return t("errors.fileTooLarge", "File is too large (max {{mb}} MB). Try a smaller image.", { mb: err.maxMb ?? 25 });
  }
  if (err.name === TIMEOUT_NAME) {
    return t("errors.timeout", "The request timed out — check your connection and try again.");
  }
  if (typeof err.message === "string" && /fetch|network|storage|bucket|object|cors|load failed|not found/i.test(err.message)) {
    return t("errors.uploadFailed", "Upload failed — check your connection and try again.");
  }
  return describeDbError(e, t);
}

/** Friendly message for a sign-in failure (invalid credentials, timeout, network…). */
export function describeAuthError(raw: string | null | undefined, t: TFunction): string {
  const s = (raw ?? "").toLowerCase();
  if (!raw) return t("auth.genericError", "Couldn't sign in. Please try again.");
  if (/timed?\s*out|timeout/.test(s)) return t("errors.timeout", "The request timed out — check your connection and try again.");
  if (/invalid login|invalid credentials|invalid email or password/.test(s)) return t("auth.invalidCreds", "Invalid email or password.");
  if (/email not confirmed|not confirmed/.test(s)) return t("auth.notConfirmed", "Please verify your email before signing in.");
  if (/failed to fetch|networkerror|network error|fetch/.test(s)) return t("auth.networkError", "Network error — check your connection.");
  if (/rate|too many/.test(s)) return t("auth.rateLimited", "Too many attempts. Please wait a moment and try again.");
  return raw;
}
