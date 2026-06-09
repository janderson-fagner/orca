import type { Page } from '@stablyai/playwright-test'

const PROTOTYPE_FLAG = '__ORCA_TEST_ALLOW_SYNCHRONIZED_HIDDEN_MODEL_RESTORE__'

export async function setPrototypeSynchronizedHiddenModelRestore(
  page: Page,
  enabled: boolean
): Promise<void> {
  await page.evaluate(
    ({ flag, enabled }) => {
      ;(window as unknown as Record<string, boolean>)[flag] = enabled
    },
    { flag: PROTOTYPE_FLAG, enabled }
  )
}
