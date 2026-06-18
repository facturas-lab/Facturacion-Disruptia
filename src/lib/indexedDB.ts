const DB_NAME = 'disruptia_drafts_db';
const STORE_NAME = 'files_store';
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraftFiles(userId: string, files: Record<string, File | null>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    for (const [key, file] of Object.entries(files)) {
      const dbKey = `${userId}_${key}`;
      if (file) {
        store.put(file, dbKey);
      } else {
        store.delete(dbKey);
      }
    }
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDraftFiles(userId: string): Promise<Record<string, File>> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const files: Record<string, File> = {};
    
    const fields = ['rut', 'cedula', 'certificacionBancaria', 'autorizacionImagen', 'acuerdoConfidencialidad', 'formatoInfoGeneral'];
    let completed = 0;
    
    for (const field of fields) {
      const dbKey = `${userId}_${field}`;
      const req = store.get(dbKey);
      req.onsuccess = () => {
        if (req.result) {
          files[field] = req.result;
        }
        completed++;
        if (completed === fields.length) {
          resolve(files);
        }
      };
      req.onerror = () => {
        completed++;
        if (completed === fields.length) {
          resolve(files);
        }
      };
    }
  });
}

export async function clearDraftFiles(userId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const fields = ['rut', 'cedula', 'certificacionBancaria', 'autorizacionImagen', 'acuerdoConfidencialidad', 'formatoInfoGeneral'];
    for (const field of fields) {
      store.delete(`${userId}_${field}`);
    }
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
