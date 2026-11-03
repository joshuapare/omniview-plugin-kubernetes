/**
 * Extract initials from a name string.
 * Handles whitespace-separated, dash-separated, and single-word names.
 */
export function getInitials(name: string): string {
  const normalized = name.trim();
  if (!normalized) return 'NA';

  let parts = normalized.split(/\s+/);
  if (parts.length === 1) parts = normalized.split('-').filter(Boolean);

  if (parts.length < 2) {
    return (parts[0] ?? normalized).slice(0, 2).toUpperCase();
  }

  return `${parts[0][0].toUpperCase()}${parts[1][0].toUpperCase()}`;
}

/**
 * Client-side image compression pipeline.
 * Loads an image file, scales it to fit within maxDim x maxDim preserving aspect ratio,
 * and returns a compressed base64 data URL.
 */
export function processImageFile(
  file: File,
  maxDim = 128,
  quality = 0.8,
  maxBytes = 50_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Scale to fit within maxDim x maxDim
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Try at requested quality
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= maxBytes) {
          resolve(dataUrl);
          return;
        }

        // Retry at lower quality
        dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        if (dataUrl.length <= maxBytes) {
          resolve(dataUrl);
          return;
        }

        reject(new Error('Image is too large even after compression. Try a smaller image.'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
