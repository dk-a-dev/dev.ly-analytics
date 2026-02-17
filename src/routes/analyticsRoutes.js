const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authenticateToken = require('../middlewares/authenticateToken');

router.post('/log', analyticsController.logClick);
router.get('/stats/urls-series', authenticateToken, analyticsController.getUrlTimeSeries);
router.get('/stats/:id', authenticateToken, analyticsController.getStats);
router.get('/stats', authenticateToken, analyticsController.getUserStats);

module.exports = router;