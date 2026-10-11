import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const DATA_DIR = path.resolve(process.cwd(), 'data');

export async function createFullDataBackup(): Promise<Buffer> {
  const zip = new JSZip();

  function addFolderToZip(currentDir: string, zipFolder: JSZip) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        const subFolder = zipFolder.folder(entry.name);
        if (subFolder) addFolderToZip(fullPath, subFolder);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath);
        zipFolder.file(entry.name, content);
      }
    }
  }

  addFolderToZip(DATA_DIR, zip);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function restoreDataFromBackup(zipBuffer: Buffer): Promise<{ ok: boolean; restoredFilesCount: number; error?: string }> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    let count = 0;

    for (const [relPath, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      // Prevent directory traversal attacks
      const cleanRel = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
      const targetPath = path.join(DATA_DIR, cleanRel);
      const parentDir = path.dirname(targetPath);

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const buffer = await file.async('nodebuffer');
      fs.writeFileSync(targetPath, buffer);
      count++;
    }

    return { ok: true, restoredFilesCount: count };
  } catch (err: any) {
    return { ok: false, restoredFilesCount: 0, error: err.message || 'Failed to extract backup ZIP' };
  }
}
