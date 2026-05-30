import { describe, expect, it } from 'vitest'
import { decodeSafariBinaryCookies } from './browser-cookie-import'

function buildSafariCookieRecord(index: number): Buffer {
  const domain = '.example.com'
  const name = `cookie-${index}`
  const path = '/'
  const value = 'value'
  const strings = [domain, name, path, value]
  const stringBytes = strings.map((entry) => Buffer.byteLength(entry) + 1)
  const size = 48 + stringBytes.reduce((sum, length) => sum + length, 0)
  const record = Buffer.alloc(size)
  record.writeUInt32LE(size, 0)
  record.writeUInt32LE(0, 8)
  let cursor = 48
  const offsets = strings.map((entry, stringIndex) => {
    const offset = cursor
    record.write(entry, offset, 'utf8')
    cursor += stringBytes[stringIndex]
    return offset
  })
  record.writeUInt32LE(offsets[0], 16)
  record.writeUInt32LE(offsets[1], 20)
  record.writeUInt32LE(offsets[2], 24)
  record.writeUInt32LE(offsets[3], 28)
  record.writeDoubleLE(0, 40)
  return record
}

function buildSafariBinaryCookies(count: number): Buffer {
  const records = Array.from({ length: count }, (_, index) => buildSafariCookieRecord(index))
  const totalRecordBytes = records.reduce((sum, record) => sum + record.length, 0)
  const pageHeaderBytes = 8 + count * 4
  const page = Buffer.alloc(pageHeaderBytes + totalRecordBytes)
  page.writeUInt32BE(0x00000100, 0)
  page.writeUInt32LE(count, 4)

  let recordOffset = pageHeaderBytes
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    page.writeUInt32LE(recordOffset, 8 + index * 4)
    record.copy(page, recordOffset)
    recordOffset += record.length
  }

  const file = Buffer.alloc(12 + page.length)
  file.write('cook', 0, 'utf8')
  file.writeUInt32BE(1, 4)
  file.writeUInt32BE(page.length, 8)
  page.copy(file, 12)
  return file
}

describe('decodeSafariBinaryCookies', () => {
  it('decodes Safari binary cookie pages with very large cookie counts', () => {
    const cookies = decodeSafariBinaryCookies(buildSafariBinaryCookies(125_000))

    expect(cookies).toHaveLength(125_000)
    expect(cookies[0]?.name).toBe('cookie-0')
    expect(cookies.at(-1)?.name).toBe('cookie-124999')
  })
})
