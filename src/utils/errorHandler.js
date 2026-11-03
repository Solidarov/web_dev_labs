const prismaErrors = {
  P2002: [409, 'Already exists'],
  P2003: [400, 'Related record does not exist'],
  P2025: [404, 'Not found'],
};

module.exports = (err, req, res, _next) => {
  const known = prismaErrors[err.code];
  if (known) return res.status(known[0]).json({ error: known[1] });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
};
