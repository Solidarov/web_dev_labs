const { z } = require('zod');
const crudRouter = require('../utils/crudRouter');
const controller = require('../controllers/bookingController');
const { createBooking, updateBooking } = require('../models/booking');
const { authenticate } = require('../utils/auth');
const { upload, cleanupOnError } = require('../utils/upload');

const router = crudRouter(controller, createBooking, updateBooking, {
  read: [authenticate],
  write: [authenticate],
});

router.param('fileId', (req, res, next, id) => {
  if (!z.uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid id' });
  next();
});

const load = [authenticate, controller.loadAttachments];
const file = '/:id/attachments/:fileId';
router.post(
  '/:id/attachments',
  ...load,
  cleanupOnError,
  upload.array('files', 5),
  controller.addAttachments,
);
router.get(file, ...load, controller.downloadAttachment);
router.patch(file, ...load, cleanupOnError, upload.single('file'), controller.replaceAttachment);
router.delete(file, ...load, controller.deleteAttachment);

module.exports = router;
