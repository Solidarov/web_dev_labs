const { Router } = require('express');
const controller = require('../controllers/logController');
const { authenticate, authorize } = require('../utils/auth');

const router = Router();

router.get('/', authenticate, authorize('admin'), controller.list);

module.exports = router;
