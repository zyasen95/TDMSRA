'use client';

export async function extractTextFromImage(fileOrUrl: File | string): Promise<string> {
  // Dynamically import so Next doesn't try to bundle workers on the server
  const Tesseract = (await import('tesseract.js')).default;

  // Support both File (from <input>) and URL/string
  const isFile = typeof fileOrUrl !== 'string';
  const src = isFile ? URL.createObjectURL(fileOrUrl as File) : (fileOrUrl as string);

  try {
    const { data: { text } } = await Tesseract.recognize(src, 'eng', {
      logger: (m: any) => {
        if (m?.status === 'recognizing text' && typeof m?.progress === 'number') {
          // Keep logs light; remove if noisy
          console.log(`📸 OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    return text;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OCR extraction failed: ${msg}`);
  } finally {
    if (isFile) {
      URL.revokeObjectURL(src);
    }
  }
}
