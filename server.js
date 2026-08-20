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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mrdev:09133971843@cluster0.grjlq7v.mongodb.net/vcf_system?retryWrites=true&w=majority';

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

// ========== NEW ADMIN ROUTES ==========

// Delete single contact
app.delete('/api/admin/contact/:id', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Delete all contacts
app.delete('/api/admin/contacts', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await Contact.deleteMany({});
        res.json({ success: true, message: 'All contacts cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Clear failed' });
    }
});

// Export CSV
app.get('/api/admin/export/csv', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const contacts = await Contact.find().sort({ submittedAt: -1 });
    let csv = 'Name,Phone,Submitted\n';
    contacts.forEach(c => {
        csv += `"${c.name}","${c.phone}","${new Date(c.submittedAt).toISOString()}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
});

// Update timer
app.post('/api/admin/timer', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { days } = req.body;
    if (days === undefined || days < 0) {
        return res.status(400).json({ error: 'Invalid days value' });
    }
    const unlockTime = Date.now() + (days * 24 * 60 * 60 * 1000);
    await Setting.findOneAndUpdate(
        { key: 'unlockTime' },
        { value: unlockTime },
        { upsert: true }
    );
    res.json({ success: true, unlockTime });
});

// Update admin key
app.put('/api/admin/key', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { currentKey, newKey } = req.body;
    if (currentKey !== admin.value) {
        return res.status(403).json({ error: 'Current key is incorrect' });
    }
    if (!newKey || newKey.length < 6) {
        return res.status(400).json({ error: 'New key must be at least 6 characters' });
    }
    await Setting.findOneAndUpdate(
        { key: 'adminKey' },
        { value: newKey },
        { upsert: true }
    );
    res.json({ success: true, message: 'Admin key updated' });
});

// ========== SERVE PAGES ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'user.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));