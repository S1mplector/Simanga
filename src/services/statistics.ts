export interface ReadingRecord {
  sourceId?: string;
  mangaId: string;
  chapterId: string;
  pagesRead: number;
  title?: string;
  coverUrl?: string;
  timestamp: number; // Unix timestamp
}

const DB_NAME = "SimangaStats";
const DB_VERSION = 1;
const STORE_NAME = "readingRecords";

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Error opening IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const store = (event.target as any).result.createObjectStore(STORE_NAME, {
        autoIncrement: true,
      });
      store.createIndex("timestamp", "timestamp", { unique: false });
      store.createIndex("mangaId", "mangaId", { unique: false });
    };
  });
}

export async function trackReadingProgress(
  sourceId: string | undefined,
  mangaId: string,
  chapterId: string,
  pagesRead: number,
  title?: string,
  coverUrl?: string
) {
  const record: Omit<ReadingRecord, 'id'> = {
    sourceId,
    mangaId,
    chapterId,
    pagesRead,
    title,
    coverUrl,
    timestamp: Date.now(),
  };

  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  store.add(record);

  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllReadingRecords(): Promise<ReadingRecord[]> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result as ReadingRecord[]);
    };
    request.onerror = () => {
      console.error("Error fetching reading records:", request.error);
      reject(request.error);
    };
  });
}
