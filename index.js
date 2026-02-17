const express = require('express');
const cors = require('cors');
require('dotenv').config();

const analyticsRoutes = require('./src/routes/analyticsRoutes');

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

// Analytics Routes
app.use('/api', analyticsRoutes);

app.listen(PORT, () => {
  console.log(`Analytics Service running on port ${PORT}`);
});