/**
 * FaceUploader.ts
 *
 * Thin wrapper around a hidden <input type="file"> that returns a promise
 * resolving to an HTMLImageElement once the user picks a file.
 *
 * Usage (alternative to inline wiring in main.ts):
 *   const uploader = new FaceUploader(document.getElementById('file-input'));
 *   const img = await uploader.promptUpload();
 */
export class FaceUploader {
  private input: HTMLInputElement;

  constructor(input: HTMLInputElement) {
    this.input = input;
  }

  /**
   * Open the native file picker and return the selected image.
   * Rejects if the user cancels without selecting a file.
   */
  promptUpload(): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const onChange = () => {
        this.input.removeEventListener('change', onChange);
        const file = this.input.files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          this.input.value = ''; // reset so the same file can be re-selected
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load selected image'));
        };
        img.src = objectUrl;
      };

      this.input.addEventListener('change', onChange);
      this.input.click();
    });
  }
}
