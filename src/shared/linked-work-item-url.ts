export type LinkedWorkItemUrlNormalizationResult =
  | { ok: true; linkedWorkItemUrl: string | null }
  | { ok: false; error: string }

export function normalizeLinkedWorkItemUrl(value: unknown): LinkedWorkItemUrlNormalizationResult {
  if (value === undefined || value === null) {
    return { ok: true, linkedWorkItemUrl: null }
  }
  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid linked work item URL.' }
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return { ok: true, linkedWorkItemUrl: null }
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: 'Invalid linked work item URL.' }
    }
    return { ok: true, linkedWorkItemUrl: url.href }
  } catch {
    return { ok: false, error: 'Invalid linked work item URL.' }
  }
}
