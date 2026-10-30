import multer from "multer";
import {
  createExclusiveDiskStorage,
  MAX_FILE_SIZE_BYTES,
  removeFile,
  validateUploadedFile
} from "../../../file-service/src/fileSecurity.js";

export function createAudioUploadMiddleware(uploadsDir) {
  return multer({
    storage: createExclusiveDiskStorage(uploadsDir),
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 1,
      fields: 16,
      parts: 17,
      fieldNameSize: 100,
      headerPairs: 32
    }
  });
}

export { removeFile, validateUploadedFile };
