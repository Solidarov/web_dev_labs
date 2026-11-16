const { Router } = require('express');
const validate = require('../utils/validate');
const { authenticate } = require('../utils/auth');
const controller = require('../controllers/authController');
const schemas = require('../models/auth');

const router = Router();

router.post('/register', validate(schemas.register), controller.register);
router.post('/login', validate(schemas.login), controller.login);
router.post('/refresh', validate(schemas.refresh), controller.refresh);
router.post('/logout', validate(schemas.refresh), controller.logout);
router.get('/me', authenticate, controller.me);
router.patch(
  '/password',
  authenticate,
  validate(schemas.changePassword),
  controller.changePassword,
);

module.exports = router;
