const crypto = require('node:crypto');
const { z } = require('zod');
const prisma = require('../utils/prisma');
const crud = require('../utils/crud');
const eventBus = require('../utils/eventBus');
const { filePath, removeFile } = require('../utils/upload');

const isAdmin = (req) => req.user.role === 'admin';
const scope = (req) => (isAdmin(req) ? {} : { userId: req.user.id });

// userId filter is AND-ed with the scope, so non-admins still only see their own bookings
const controller = crud('booking', undefined, {
  scope,
  sort: ['startTime', 'endTime'],
  filters: {
    resourceId: (id) => ({ resourceId: z.uuid().parse(id) }),
    userId: (id) => ({ userId: z.uuid().parse(id) }),
    from: (from) => ({ startTime: { gte: z.coerce.date().parse(from) } }),
    to: (to) => ({ endTime: { lte: z.coerce.date().parse(to) } }),
  },
});

const crudUpdate = controller.update;

controller.create = async (req, res, next) => {
  try {
    const userId = (isAdmin(req) && req.body.userId) || req.user.id;
    const newBooking = await prisma.booking.create({ data: { ...req.body, userId } });
    eventBus.emit('bookingCreated', newBooking);
    res.status(201).json(newBooking);
  } catch (err) {
    next(err);
  }
};

// Non-admins cannot move a booking to another user
controller.update = (req, res, next) => {
  if (!isAdmin(req)) delete req.body.userId;
  return crudUpdate(req, res, next);
};

// Attachments: metadata lives in Booking.attachments, files on disk under UPLOAD_DIR

const notFound = (res) => res.status(404).json({ error: 'Not found' });

// Runs before multer, so nothing is written to disk for a missing or foreign booking
controller.loadAttachments = async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, ...scope(req) } });
    if (!booking) return notFound(res);
    req.attachments = booking.attachments || [];
    if (req.params.fileId) {
      req.attachment = req.attachments.find((a) => a.id === req.params.fileId);
      if (!req.attachment) return notFound(res);
    }
    next();
  } catch (err) {
    next(err);
  }
};

const saveAttachments = (req, attachments) =>
  prisma.booking.update({ where: { id: req.params.id }, data: { attachments } });

const toMeta = (file, id = crypto.randomUUID()) => ({
  id,
  originalName: file.originalname,
  mimetype: file.mimetype,
  size: file.size,
  filename: file.filename,
  uploadedAt: new Date().toISOString(),
});

controller.addAttachments = async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const attachments = [...req.attachments, ...req.files.map((f) => toMeta(f))];
    await saveAttachments(req, attachments);
    res.status(201).json(attachments);
  } catch (err) {
    next(err);
  }
};

controller.downloadAttachment = (req, res) =>
  res.download(filePath(req.attachment.filename), req.attachment.originalName);

controller.replaceAttachment = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const updated = toMeta(req.file, req.attachment.id);
    await saveAttachments(
      req,
      req.attachments.map((a) => (a.id === updated.id ? updated : a)),
    );
    await removeFile(req.attachment.filename);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

controller.deleteAttachment = async (req, res, next) => {
  try {
    await saveAttachments(
      req,
      req.attachments.filter((a) => a !== req.attachment),
    );
    await removeFile(req.attachment.filename);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = controller;
