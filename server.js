const express = require('express');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.DB);

// Define Giveaway Schema
const giveawaySchema = new mongoose.Schema({
  giveawayId: String,
  totalAmount: Number,
  remainingAmount: Number,
  perUserAmount: Number,
  qrCodePath: String,
  transactions: [{
    userId: String,
    amount: Number,
    timestamp: Date
  }]
});

const Giveaway = mongoose.model('Giveaway', giveawaySchema);


const qrCodeDir = path.join(__dirname, 'qrcodes');
fs.mkdir(qrCodeDir, { recursive: true }).catch(console.error);

// Create a new giveaway
app.post('/giveaway', async (req, res) => {
  try {
    const { totalAmount, perUserAmount } = req.body;
    const giveawayId = uuidv4();
    const qrCodeFileName = `${giveawayId}.png`;
    const qrCodePath = path.join(qrCodeDir, qrCodeFileName);
    
   
    await qrcode.toFile(qrCodePath, giveawayId);

    const giveaway = new Giveaway({
      giveawayId,
      totalAmount,
      remainingAmount: totalAmount,
      perUserAmount,
      qrCodePath: `/qrcode/${giveawayId}`,
      transactions: []
    });

    await giveaway.save();
    res.status(201).json({ 
      giveawayId, 
      qrCodeUrl: `${req.protocol}://${req.get('host')}/qrcode/${giveawayId}` 
    });
  } catch (error) {
    console.error('Error creating giveaway:', error);
    res.status(500).json({ error: 'Failed to create giveaway' });
  }
});

app.get('/qrcode/:giveawayId', async (req, res) => {
  try {
    const { giveawayId } = req.params;
    const qrCodePath = path.join(qrCodeDir, `${giveawayId}.png`);
    
   
    await fs.access(qrCodePath);
    
    
    res.type('png');
    
    // Send the file
    res.sendFile(qrCodePath);
  } catch (error) {
    console.error('Error serving QR code:', error);
    res.status(404).json({ error: 'QR code not found' });
  }
});


app.post('/scan/:giveawayId', async (req, res) => {
  try {
    const { giveawayId } = req.params;
    const { userId } = req.body;

    const giveaway = await Giveaway.findOne({ giveawayId });

    if (!giveaway) {
      return res.status(404).json({ error: 'Giveaway not found' });
    }

    if (giveaway.remainingAmount < giveaway.perUserAmount) {
      return res.status(400).json({ error: 'Giveaway has ended' });
    }

    // Simulate UPI transaction
    const transactionSuccess = await simulateUpiTransaction(userId, giveaway.perUserAmount);

    if (transactionSuccess) {
      giveaway.remainingAmount -= giveaway.perUserAmount;
      giveaway.transactions.push({
        userId,
        amount: giveaway.perUserAmount,
        timestamp: new Date()
      });

      await giveaway.save();
      res.json({ success: true, amount: giveaway.perUserAmount });
    } else {
      res.status(500).json({ error: 'Transaction failed' });
    }
  } catch (error) {
    console.error('Error processing scan:', error);
    res.status(500).json({ error: 'Failed to process scan' });
  }
});


app.get('/giveaway/:giveawayId/stats', async (req, res) => {
  try {
    const { giveawayId } = req.params;
    const giveaway = await Giveaway.findOne({ giveawayId });

    if (!giveaway) {
      return res.status(404).json({ error: 'Giveaway not found' });
    }

    const stats = {
      totalAmount: giveaway.totalAmount,
      remainingAmount: giveaway.remainingAmount,
      transactionsCount: giveaway.transactions.length,
      uniqueUsers: new Set(giveaway.transactions.map(t => t.userId)).size
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Mock UPI transaction API
async function simulateUpiTransaction(userId, amount) {
  try {
    // In a real scenario, we would integrate with an actual UPI API
    // For testing, we'll simulate a successful transaction
    
    console.log(`Simulating UPI transaction: ${amount} to ${userId}`);
    return true;
  } catch (error) {
    console.error('UPI transaction failed:', error);
    return false;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});