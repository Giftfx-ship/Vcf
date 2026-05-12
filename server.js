const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security & Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests' }
});
app.use('/api/', limiter);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/vcf_system?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✓ MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));

// ========== SCHEMAS ==========
const ContactSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    submittedAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', ContactSchema);

const SettingSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    value: { type: mongoose.Schema.Types.Mixed }
});
const Setting = mongoose.model('Setting', SettingSchema);

// ========== INIT ==========
async function initSystem() {
    // Set 2-day timer
    const timer = await Setting.findOne({ key: 'unlockTime' });
    if (!timer) {
        const unlockTime = Date.now() + (2 * 24 * 60 * 60 * 1000);
        await Setting.create({ key: 'unlockTime', value: unlockTime });
        console.log('✓ Timer initialized: 2 days');
    }
    
    // Set admin credentials
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (!admin) {
        await Setting.create({ key: 'adminKey', value: 'DevGift2026' });
        console.log('✓ Admin credentials set');
    }
}
initSystem();

// ========== PUBLIC API ==========
app.get('/api/timer', async (req, res) => {
    const timer = await Setting.findOne({ key: 'unlockTime' });
    res.json({ unlockTime: timer.value, isUnlocked: Date.now() >= timer.value });
});

app.post('/api/contact', async (req, res) => {
    try {
        const { name, phone } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ error: 'Name and phone required' });
        }
        
        const existing = await Contact.findOne({ phone });
        if (existing) {
            return res.status(409).json({ error: 'Phone number already registered' });
        }
        
        const contact = new Contact({ name, phone });
        await contact.save();
        res.json({ success: true, message: 'Contact registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ========== ADMIN API ==========
app.post('/api/admin/verify', async (req, res) => {
    const { key } = req.body;
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (key === admin.value) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.get('/api/admin/contacts', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const contacts = await Contact.find().sort({ submittedAt: -1 });
    res.json(contacts);
});

app.get('/api/admin/download', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    const timer = await Setting.findOne({ key: 'unlockTime' });
    
    if (adminKey !== admin.value) {
        return res.status(401).send('Unauthorized');
    }
    
    if (Date.now() < timer.value) {
        const remaining = Math.ceil((timer.value - Date.now()) / (1000 * 60 * 60 * 24));
        return res.status(403).json({ error: `Download locked. ${remaining} days remaining` });
    }
    
    const contacts = await Contact.find();
    let vcf = 'BEGIN:VCARD\nVERSION:3.0\n';
    contacts.forEach(c => {
        vcf += `FN:${c.name}\nTEL:${c.phone}\nEND:VCARD\n`;
    });
    
    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.vcf');
    res.send(vcf);
});

app.get('/api/admin/stats', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const count = await Contact.countDocuments();
    const timer = await Setting.findOne({ key: 'unlockTime' });
    res.json({ totalContacts: count, unlockTime: timer.value });
});

// Serve pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'user.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
