import { describe, expect, it } from 'vitest'
import { evaluateCompat } from './protocol-compat'
import { MIN_COMPATIBLE_DESKTOP_VERSION, MOBILE_PROTOCOL_VERSION } from './protocol-version'

describe('evaluateCompat', () => {
  it('returns ok when both fields are undefined and constants are wide-open', () => {
    const verdict = evaluateCompat({
      desktopProtocolVersion: undefined,
      desktopMinCompatibleMobileVersion: undefined
    })
    expect(verdict).toEqual({ kind: 'ok' })
  })

  it('returns ok when desktop reports version equal to MOBILE_PROTOCOL_VERSION', () => {
    const verdict = evaluateCompat({
      desktopProtocolVersion: MOBILE_PROTOCOL_VERSION,
      desktopMinCompatibleMobileVersion: 0
    })
    expect(verdict).toEqual({ kind: 'ok' })
  })

  it('returns ok when desktop reports a newer version (additive changes assumed safe)', () => {
    const verdict = evaluateCompat({
      desktopProtocolVersion: MOBILE_PROTOCOL_VERSION + 5,
      desktopMinCompatibleMobileVersion: 0
    })
    expect(verdict).toEqual({ kind: 'ok' })
  })

  it('blocks with mobile-too-old when desktop requires a newer mobile', () => {
    const verdict = evaluateCompat({
      desktopProtocolVersion: 5,
      desktopMinCompatibleMobileVersion: MOBILE_PROTOCOL_VERSION + 1
    })
    expect(verdict).toEqual({
      kind: 'blocked',
      reason: 'mobile-too-old',
      desktopVersion: 5,
      requiredMobileVersion: MOBILE_PROTOCOL_VERSION + 1
    })
  })

  it('coerces undefined desktopVersion to 0 in the verdict payload', () => {
    const verdict = evaluateCompat({
      desktopProtocolVersion: undefined,
      desktopMinCompatibleMobileVersion: MOBILE_PROTOCOL_VERSION + 1
    })
    expect(verdict).toMatchObject({
      kind: 'blocked',
      reason: 'mobile-too-old',
      desktopVersion: 0
    })
  })

  it('mobile-too-old wins precedence when both constraints would fire', () => {
    // Why: documents the intended kill-switch precedence — desktop's
    // refusal of a too-old mobile takes priority over mobile's local
    // refusal of a too-old desktop.
    const verdict = evaluateCompat({
      desktopProtocolVersion: -1, // would also trip desktop-too-old if we got there
      desktopMinCompatibleMobileVersion: MOBILE_PROTOCOL_VERSION + 1
    })
    expect(verdict.kind).toBe('blocked')
    expect((verdict as { reason: string }).reason).toBe('mobile-too-old')
  })

  it('today: MIN_COMPATIBLE_DESKTOP_VERSION = 0 lets every reported desktop pass', () => {
    expect(MIN_COMPATIBLE_DESKTOP_VERSION).toBe(0)
    for (const v of [0, 1, 2, 99]) {
      expect(
        evaluateCompat({
          desktopProtocolVersion: v,
          desktopMinCompatibleMobileVersion: 0
        })
      ).toEqual({ kind: 'ok' })
    }
  })
})
