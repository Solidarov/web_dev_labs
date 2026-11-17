const prisma = require('./prisma');

const readOnly = ['GET', 'HEAD', 'OPTIONS'];

// Logs every write request once the response is sent; never logs bodies.
// req.user is set later by route-level authenticate, but is available on 'finish'.
module.exports = (req, res, next) => {
  if (!readOnly.includes(req.method))
    res.on('finish', () => {
      prisma.actionLog
        .create({
          data: {
            userId: req.user?.id ?? null,
            method: req.method,
            path: req.originalUrl.split('?')[0],
            status: res.statusCode,
          },
        })
        .catch(console.error);
    });
  next();
};
