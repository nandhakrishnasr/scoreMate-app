import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { deliverFile } from '../src/utils/fileDelivery.ts'

describe('File Delivery Utility', () => {
  beforeEach(() => {
    // Ensure document mock exists in test environment if needed
    if (typeof globalThis.document === 'undefined') {
      const mockElement = {
        href: '',
        download: '',
        click: () => {},
      }
      // @ts-expect-error Mocking minimal document for testing
      globalThis.document = {
        createElement: () => mockElement,
        body: {
          appendChild: () => {},
          removeChild: () => {},
        },
      }
      if (typeof globalThis.URL.createObjectURL === 'undefined') {
        globalThis.URL.createObjectURL = () => 'blob:mock-url'
        globalThis.URL.revokeObjectURL = () => {}
      }
    }
  })

  it('delivers text/json files on web without throwing', async () => {
    await assert.doesNotReject(async () => {
      await deliverFile({
        filename: 'test-backup.json',
        content: '{"hello":"world"}',
        mimeType: 'application/json',
      })
    })
  })

  it('delivers base64/pdf files on web without throwing', async () => {
    await assert.doesNotReject(async () => {
      await deliverFile({
        filename: 'test-scorecard.pdf',
        content: 'JVBERi0xLjQK...',
        mimeType: 'application/pdf',
        isBase64: true,
      })
    })
  })
})
