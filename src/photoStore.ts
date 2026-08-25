const DB_NAME = 'solemiSleepAssets'
const STORE_NAME = 'avatars'
const AVATAR_SIZE = 256

type AvatarRecord = {
  ref: string
  blob: Blob
  updatedAt: string
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'ref' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('IMAGE_LOAD_FAILED')) }
    image.src = url
  })
}

async function resizeAvatar(file: File) {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('IMAGE_PROCESSING_FAILED')

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
  const sourceX = (image.naturalWidth - sourceSize) / 2
  const sourceY = (image.naturalHeight - sourceSize) / 2
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('IMAGE_PROCESSING_FAILED')), 'image/webp', 0.82)
  })
}

export async function saveChildPhoto(childId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('INVALID_IMAGE')
  if (file.size > 12 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE')
  const blob = await resizeAvatar(file)
  const ref = `local-avatar:${childId}:${crypto.randomUUID()}`
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put({ ref, blob, updatedAt: new Date().toISOString() } satisfies AvatarRecord)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
  return ref
}

export async function loadChildPhoto(ref: string) {
  const database = await openDatabase()
  const record = await new Promise<AvatarRecord | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(ref)
    request.onsuccess = () => resolve(request.result as AvatarRecord | undefined)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return record?.blob ?? null
}
