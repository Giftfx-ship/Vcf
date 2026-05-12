const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname)));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/vcf_nexus?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// ========== SCHEMAS ==========
const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

const timerSchema = new mongoose.Schema({
  unlockTime: { type: Number, required: true }
});
const Timer = mongoose.model('Timer', timerSchema);

const adminSchema = new mongoose.Schema({
  key: { type: String, required: true }
});
const Admin = mongoose.model('Admin', adminSchema);

// ========== INITIALIZE DATA ==========
async function initData() {
  // Init timer (2 days from now)
  let timer = await Timer.findOne();
  if (!timer) {
    const unlockTime = Date.now() + (2 * 24 * 60 * 60 * 1000);
    await Timer.create({ unlockTime });
    console.log('⏰ Timer initialized: 2 days');
  }
  
  // Init admin key
  let admin = await Admin.findOne();
  if (!admin) {
    await Admin.create({ key: 'DevGift2026' });
    console.log('🔐 Admin key initialized');
  }
}
initData();

// ========== API ROUTES ==========

// Get timer status
app.get('/api/timer', async (req, res) => {
  const timer = await Timer.findOne();
  res.json({ unlockTime: timer.unlockTime });
});

// Add contact
app.post('/api/add', async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone required' });
    }
    
    const existing = await Contact.findOne({ phone });
    if (existing) {
      return res.status(409).json({ error: 'Phone already registered' });
    }
    
    const contact = new Contact({ name, phone });
    await contact.save();
    res.json({ success: true, message: 'Contact saved!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get contact count (for admin)
app.get('/api/count', async (req, res) => {
  const count = await Contact.countDocuments();
  res.json({ count });
});

// Admin verify
app.post('/api/admin/verify', async (req, res) => {
  const { key } = req.body;
  const admin = await Admin.findOne();
  if (key === admin.key) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// Download VCF (admin only, timer must be unlocked)
app.get('/api/download', async (req, res) => {
  const timer = await Timer.findOne();
  const adminKey = req.headers['x-admin-key'];
  const admin = await Admin.findOne();
  
  // Check admin
  if (adminKey !== admin.key) {
    return res.status(401).send('Unauthorized');
  }
  
  // Check timer
  if (Date.now() < timer.unlockTime) {
    return res.status(403).send('Download locked. Timer not finished.');
  }
  
  const contacts = await Contact.find();
  let vcf = '';
  contacts.forEach(c => {
    vcf += `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nTEL:${c.phone}\nEND:VCARD\n`;
  });
  
  res.setHeader('Content-Type', 'text/vcard');
  res.setHeader('Content-Disposition', 'attachment; filename=vcf_nexus_contacts.vcf');
  res.send(vcf);
});

// Get all contacts (admin only)
app.get('/api/contacts', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  const admin = await Admin.findOne();
  
  if (adminKey !== admin.key) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const contacts = await Contact.find();
  res.json(contacts);
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
