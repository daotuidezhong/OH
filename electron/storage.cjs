const fs = require("node:fs");
const path = require("node:path");

const BACKUP_FORMAT = "oh-user-data";
const BACKUP_VERSION = 3;
const INITIALIZED_KEY = "berry-desktop-storage-initialized";
const JOURNAL_PHOTO_PATTERN = /^journal-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i;
const PHOTO_BOARD_PATTERN = /^board-[0-9a-f-]{36}\.jpg$/i;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function validateStoredData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("备份中没有可用数据");
  const entries = Object.entries(data);
  if (!entries.length || entries.some(([key, value]) => !key.startsWith("berry-") || typeof value !== "string")) {
    throw new Error("备份数据格式不正确");
  }
  const stored = Object.fromEntries(entries);
  if (stored["berry-workout-game"]) {
    let game;
    try { game = JSON.parse(stored["berry-workout-game"]); } catch { throw new Error("备份中的游戏进度格式不正确"); }
    if (!game || typeof game !== "object" || Array.isArray(game)) throw new Error("备份中的游戏进度格式不正确");
  }
  if (stored["berry-workout-history"]) {
    let history;
    try { history = JSON.parse(stored["berry-workout-history"]); } catch { throw new Error("备份中的日记记录格式不正确"); }
    if (!Array.isArray(history)) throw new Error("备份中的日记记录格式不正确");
  }
  return stored;
}

function readJournalPhotos(directory) {
  if (!directory || !fs.existsSync(directory)) return {};
  return Object.fromEntries(fs.readdirSync(directory)
    .filter((name) => JOURNAL_PHOTO_PATTERN.test(name))
    .map((name) => [name, fs.readFileSync(path.join(directory, name)).toString("base64")]));
}

function readPhotoFiles(directory, pattern) {
  if (!directory || !fs.existsSync(directory)) return {};
  return Object.fromEntries(fs.readdirSync(directory).filter((name) => pattern.test(name)).map((name) => [name, fs.readFileSync(path.join(directory, name)).toString("base64")]));
}

function validateJournalPhotos(photos) {
  if (photos == null) return {};
  if (typeof photos !== "object" || Array.isArray(photos)) throw new Error("备份中的日记照片格式不正确");
  const entries = Object.entries(photos);
  const totalSize = entries.reduce((sum, [, value]) => sum + (typeof value === "string" ? value.length : 0), 0);
  if (entries.length > 500 || totalSize > 500_000_000 || entries.some(([name, value]) => {
    if (!JOURNAL_PHOTO_PATTERN.test(name) || typeof value !== "string" || value.length > 10_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return true;
    const photo = Buffer.from(value, "base64");
    return photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo.at(-2) !== 0xff || photo.at(-1) !== 0xd9 || photo.toString("base64") !== value;
  })) {
    throw new Error("备份中的日记照片格式不正确");
  }
  return Object.fromEntries(entries);
}

function validatePhotoBoardFiles(photos) {
  if (photos == null) return {};
  if (typeof photos !== "object" || Array.isArray(photos)) throw new Error("备份中的照片板照片格式不正确");
  const entries = Object.entries(photos);
  const totalSize = entries.reduce((sum, [, value]) => sum + (typeof value === "string" ? value.length : 0), 0);
  if (entries.length > 1000 || totalSize > 800_000_000 || entries.some(([name, value]) => {
    if (!PHOTO_BOARD_PATTERN.test(name) || typeof value !== "string" || value.length > 12_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return true;
    const photo = Buffer.from(value, "base64");
    return photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo.at(-2) !== 0xff || photo.at(-1) !== 0xd9 || photo.toString("base64") !== value;
  })) throw new Error("备份中的照片板照片格式不正确");
  return Object.fromEntries(entries);
}

function validatePhotoBoardReferences(data, photos) {
  if (!data["berry-photo-board"]) return;
  let board;
  try { board = JSON.parse(data["berry-photo-board"]); } catch { throw new Error("备份中的照片板数据格式不正确"); }
  if (!Array.isArray(board) || board.some((photo) => !photo || typeof photo !== "object" || !PHOTO_BOARD_PATTERN.test(photo.fileName ?? "") || !photos[photo.fileName])) throw new Error("备份中的照片板照片不完整");
}

function validatePhotoReferences(data, photos) {
  if (!data["berry-workout-history"]) return;
  const history = JSON.parse(data["berry-workout-history"]);
  for (const record of history) {
    const photo = record && typeof record === "object" ? record.photo : null;
    if (photo == null) continue;
    if (typeof photo !== "object" || Array.isArray(photo) || !JOURNAL_PHOTO_PATTERN.test(photo.fileName ?? "") || !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 1 || photo.height < 1 || photo.width > 1600 || photo.height > 1600 || !photos[photo.fileName]) {
      throw new Error("备份中的日记照片不完整");
    }
  }
}

function restoreJournalPhotos(directory, photos, backupDirectory) {
  if (!directory) return;
  const temporaryDirectory = `${directory}.importing`;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  fs.mkdirSync(temporaryDirectory, { recursive: true });
  try {
    for (const [name, value] of Object.entries(photos)) {
      fs.writeFileSync(path.join(temporaryDirectory, name), Buffer.from(value, "base64"));
    }
    if (fs.existsSync(directory)) fs.cpSync(directory, backupDirectory, { recursive: true });
    fs.rmSync(directory, { recursive: true, force: true });
    fs.renameSync(temporaryDirectory, directory);
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    if (!fs.existsSync(directory) && fs.existsSync(backupDirectory)) fs.cpSync(backupDirectory, directory, { recursive: true });
    throw error;
  }
}

function createStorage(dataFile, options = {}) {
  const journalPhotosDirectory = options.journalPhotosDirectory;
  const photoBoardDirectory = options.photoBoardDirectory;
  const backupFile = path.join(path.dirname(dataFile), "user-data.backup.json");
  const temporaryFile = `${dataFile}.tmp`;
  const read = () => readJson(dataFile) ?? readJson(backupFile) ?? {};
  const write = (data) => {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(temporaryFile, JSON.stringify(data), "utf8");
    fs.copyFileSync(temporaryFile, dataFile);
    fs.unlinkSync(temporaryFile);
  };

  return {
    snapshot() {
      return Object.fromEntries(Object.entries(read()).filter(([key, value]) => key.startsWith("berry-") && typeof value === "string"));
    },
    initialize(legacyData = {}) {
      const current = read();
      if (current[INITIALIZED_KEY] !== "1") {
        const legacyEntries = legacyData && typeof legacyData === "object" && !Array.isArray(legacyData)
          ? Object.entries(legacyData).filter(([key, value]) => key.startsWith("berry-") && typeof value === "string" && !Object.hasOwn(current, key))
          : [];
        if (readJson(dataFile)) fs.copyFileSync(dataFile, backupFile);
        write({ ...current, ...Object.fromEntries(legacyEntries), [INITIALIZED_KEY]: "1" });
      }
      return this.snapshot();
    },
    load(key) {
      return read()[key] ?? null;
    },
    save(key, value) {
      const current = readJson(dataFile);
      const data = { ...read(), [key]: value };
      if (current) fs.copyFileSync(dataFile, backupFile);
      write(data);
    },
    exportPayload(metadata = {}) {
      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        ...metadata,
        data: validateStoredData(read()),
        assets: { journalPhotos: readJournalPhotos(journalPhotosDirectory), photoBoardPhotos: readPhotoFiles(photoBoardDirectory, PHOTO_BOARD_PATTERN) },
      };
    },
    importPayload(payload) {
      if (!payload || payload.format !== BACKUP_FORMAT || ![1, 2, BACKUP_VERSION].includes(payload.version)) {
        throw new Error("这不是可识别的 OH 备份文件");
      }
      const data = validateStoredData(payload.data);
      data[INITIALIZED_KEY] = "1";
      const journalPhotos = validateJournalPhotos(payload.assets?.journalPhotos);
      const photoBoardPhotos = validatePhotoBoardFiles(payload.assets?.photoBoardPhotos);
      validatePhotoReferences(data, journalPhotos);
      validatePhotoBoardReferences(data, photoBoardPhotos);
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      const timestamp = new Date().toISOString().replaceAll(":", "-");
      const dataBackup = path.join(path.dirname(dataFile), `user-data.pre-import-${timestamp}.json`);
      const photosBackup = `${journalPhotosDirectory}.pre-import-${timestamp}`;
      const boardPhotosBackup = `${photoBoardDirectory}.pre-import-${timestamp}`;
      const hadData = fs.existsSync(dataFile);
      const hadPhotos = Boolean(journalPhotosDirectory && fs.existsSync(journalPhotosDirectory));
      const hadBoardPhotos = Boolean(photoBoardDirectory && fs.existsSync(photoBoardDirectory));
      const previousFallback = fs.existsSync(backupFile) ? fs.readFileSync(backupFile) : null;
      if (fs.existsSync(dataFile)) {
        fs.copyFileSync(dataFile, dataBackup);
      }
      let photosReplaced = false;
      let boardPhotosReplaced = false;
      try {
        restoreJournalPhotos(journalPhotosDirectory, journalPhotos, photosBackup);
        photosReplaced = Boolean(journalPhotosDirectory);
        restoreJournalPhotos(photoBoardDirectory, photoBoardPhotos, boardPhotosBackup);
        boardPhotosReplaced = Boolean(photoBoardDirectory);
        write(data);
        fs.copyFileSync(dataFile, backupFile);
      } catch (error) {
        fs.rmSync(temporaryFile, { force: true });
        if (hadData && fs.existsSync(dataBackup)) fs.copyFileSync(dataBackup, dataFile);
        else if (!hadData) fs.rmSync(dataFile, { force: true });
        if (previousFallback) fs.writeFileSync(backupFile, previousFallback);
        else fs.rmSync(backupFile, { force: true });
        if (photosReplaced && journalPhotosDirectory) {
          fs.rmSync(journalPhotosDirectory, { recursive: true, force: true });
          if (hadPhotos && fs.existsSync(photosBackup)) fs.cpSync(photosBackup, journalPhotosDirectory, { recursive: true });
        }
        if (boardPhotosReplaced && photoBoardDirectory) {
          fs.rmSync(photoBoardDirectory, { recursive: true, force: true });
          if (hadBoardPhotos && fs.existsSync(boardPhotosBackup)) fs.cpSync(boardPhotosBackup, photoBoardDirectory, { recursive: true });
        }
        throw error;
      }
      return Object.keys(data).filter((key) => key !== INITIALIZED_KEY);
    },
  };
}

module.exports = { createStorage };
