const { MulterError } = require('multer');

const knownErrors = {
  P2002: [409, 'Already exists'],
  P2003: [400, 'Related record does not exist'],
  P2025: [404, 'Not found'],
  LIMIT_FILE_SIZE: [413, 'File too large'],
  UNSUPPORTED_FILE_TYPE: [400, 'Unsupported file type'],
  ENOENT: [404, 'Not found'],
};

module.exports = (err, req, res, _next) => {
  const known = knownErrors[err.code];
  if (known) return res.status(known[0]).json({ error: known[1] });
  if (err instanceof MulterError) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
};
