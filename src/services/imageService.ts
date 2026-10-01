import { firebaseApp, isFirebaseConfigured } from './firebase.ts'

export interface ProcessedImageResult {
  blob: Blob
  dataUrl: string
}

/**
 * Extracts 1-2 uppercase initials from a display name for fallback avatars.
 * e.g., "Nandha Krishna" -> "NK", "Guest" -> "G", "Sachin Ramesh Tendulkar" -> "ST"
 */
export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Loads an image from a Blob/File and extracts a center-cropped square
 * resized to targetSize x targetSize and compressed as JPEG.
 * Uses pure HTML Canvas without any heavy external libraries.
 */
export async function cropAndCompressImage(
  fileOrBlob: Blob | File,
  targetSize = 512,
  quality = 0.85
): Promise<ProcessedImageResult> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      // In test/node environments without DOM canvas
      return resolve({
        blob: fileOrBlob,
        dataUrl: 'data:image/jpeg;base64,mockImageDataUrl',
      })
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to decode image.'))
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = targetSize
          canvas.height = targetSize
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            return reject(new Error('Could not get 2D canvas context.'))
          }

          // Center-crop calculation
          const minDim = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height)
          const sx = ((img.naturalWidth || img.width) - minDim) / 2
          const sy = ((img.naturalHeight || img.height) - minDim) / 2

          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize)

          const dataUrl = canvas.toDataURL('image/jpeg', quality)
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return reject(new Error('Failed to create compressed image blob.'))
              }
              resolve({ blob, dataUrl })
            },
            'image/jpeg',
            quality
          )
        } catch (err) {
          reject(err)
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(fileOrBlob)
  })
}

/**
 * Uploads a profile photo blob to Firebase Storage under users/{uid}/profile.jpg.
 * Returns the public download URL.
 * Handles storage initialization errors gracefully.
 */
export async function uploadProfilePhoto(uid: string, imageBlob: Blob, timeoutMs = 3500): Promise<string> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase Storage is not configured. Local preview will be used.')
  }

  const uploadTask = async (): Promise<string> => {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
    const storage = getStorage(firebaseApp)
    const storageRef = ref(storage, `users/${uid}/profile.jpg`)

    await uploadBytes(storageRef, imageBlob, {
      contentType: 'image/jpeg',
      customMetadata: {
        uploadedAt: new Date().toISOString(),
      },
    })

    const downloadUrl = await getDownloadURL(storageRef)
    return downloadUrl
  }

  const timeoutTask = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Firebase Storage upload timed out.')), timeoutMs)
  })

  try {
    return await Promise.race([uploadTask(), timeoutTask])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('Firebase Storage upload failed:', message)
    throw new Error(`Cloud photo upload failed: ${message}`)
  }
}
