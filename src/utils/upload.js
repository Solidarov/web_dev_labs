const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const dir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(dir, { recursive: true });

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  fileFilter: (_req, file, cb) =>
    allowedTypes.includes(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error('Unsupported file type'), { code: 'UNSUPPORTED_FILE_TYPE' })),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, files: 5 },
});

// Paths are built only from server-generated filenames, never from client input
const filePath = (filename) => path.join(dir, filename);
const removeFile = (filename) => fs.promises.rm(filePath(filename), { force: true });

// If the request ends in an error, delete the files multer stored for it so no orphans are left
const cleanupOnError = (req, res, next) => {
  res.on('close', () => {
    if (res.statusCode < 400) return;
    const files = req.files || (req.file ? [req.file] : []);
    files.forEach((f) => removeFile(f.filename).catch(console.error));
  });
  next();
};

module.exports = { upload, filePath, removeFile, cleanupOnError };
