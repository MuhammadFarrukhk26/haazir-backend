const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/stats', require('./stats'));
router.use('/bookings', require('./bookings'));
router.use('/workers', require('./workers'));
router.use('/trades', require('./trades'));
router.use('/service-categories', require('./serviceCategories'));

module.exports = router;