/** Côté maximal, en pixels, d'une image importée. */
const MAX_SIDE = 256

/**
 * Lit un fichier image et le redimensionne à MAX_SIDE au plus grand côté.
 * Renvoie une data URL PNG.
 */
export function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('unreadable'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('unreadable'))
      image.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('unreadable'))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      }
      image.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
