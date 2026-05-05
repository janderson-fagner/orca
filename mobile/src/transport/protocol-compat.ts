import { MIN_COMPATIBLE_DESKTOP_VERSION, MOBILE_PROTOCOL_VERSION } from './protocol-version'

export type CompatVerdict =
  | { kind: 'ok' }
  | {
      kind: 'blocked'
      reason: 'mobile-too-old' | 'desktop-too-old'
      desktopVersion: number
      requiredMobileVersion?: number
      requiredDesktopVersion?: number
    }

export function evaluateCompat(input: {
  desktopProtocolVersion: number | undefined
  desktopMinCompatibleMobileVersion: number | undefined
}): CompatVerdict {
  // Why: absent fields → 0 lets mobile keep talking to pre-PR desktops.
  // Bumping MIN_COMPATIBLE_DESKTOP_VERSION above 0 will fence those
  // older desktops alongside any explicitly-version-0 desktop, which
  // is the intended kill-switch behavior.
  const desktopVersion = input.desktopProtocolVersion ?? 0
  const requiredMobile = input.desktopMinCompatibleMobileVersion ?? 0

  // Why: mobile-too-old precedence — if desktop says "I refuse this
  // mobile build" (kill switch), that wins over any local mobile
  // judgment about desktop's age.
  if (MOBILE_PROTOCOL_VERSION < requiredMobile) {
    return {
      kind: 'blocked',
      reason: 'mobile-too-old',
      desktopVersion,
      requiredMobileVersion: requiredMobile
    }
  }
  if (desktopVersion < MIN_COMPATIBLE_DESKTOP_VERSION) {
    return {
      kind: 'blocked',
      reason: 'desktop-too-old',
      desktopVersion,
      requiredDesktopVersion: MIN_COMPATIBLE_DESKTOP_VERSION
    }
  }
  return { kind: 'ok' }
}
