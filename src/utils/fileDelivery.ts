import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export interface DeliverFileOptions {
  filename: string
  content: string // raw text (JSON, CSV) or base64 data URL / base64 string
  mimeType: string
  isBase64?: boolean
}

/**
 * Platform-aware file delivery utility for ScoreMate.
 * - On Web / Desktop: Uses programmatic browser anchor download via Blob or Data URL.
 * - On Native (Android / iOS): Writes to the application cache and launches the native System Share Sheet,
 *   allowing the user to Save to Device / Downloads, Google Drive, WhatsApp, etc.
 */
export async function deliverFile(options: DeliverFileOptions): Promise<void> {
  const { filename, content, mimeType, isBase64 } = options

  if (!Capacitor.isNativePlatform()) {
    if (typeof document === 'undefined') return
    let url: string
    let revokeNeeded = false

    if (isBase64) {
      url = content.startsWith('data:') ? content : `data:${mimeType};base64,${content}`
    } else {
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
      url = URL.createObjectURL(blob)
      revokeNeeded = true
    }

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    if (revokeNeeded) {
      URL.revokeObjectURL(url)
    }
    return
  }

  // Native Android / iOS delivery
  try {
    let cleanData = content
    if (isBase64) {
      if (cleanData.includes(',')) {
        cleanData = cleanData.split(',')[1] ?? ''
      }
      cleanData = cleanData.replace(/\s/g, '')
    }

    const writeOptions: {
      path: string
      data: string
      directory: Directory
      recursive: boolean
      encoding?: Encoding
    } = {
      path: filename,
      data: cleanData,
      directory: Directory.Cache,
      recursive: true,
    }

    if (!isBase64) {
      writeOptions.encoding = Encoding.UTF8
    }

    const writeResult = await Filesystem.writeFile(writeOptions)

    await Share.share({
      title: filename,
      url: writeResult.uri,
      files: [writeResult.uri],
      dialogTitle: `Save or Share ${filename}`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Silently ignore if user simply dismissed or cancelled the native share dialog
    if (
      msg.toLowerCase().includes('canceled') ||
      msg.toLowerCase().includes('cancelled') ||
      msg.toLowerCase().includes('dismissed')
    ) {
      return
    }
    throw err
  }
}
