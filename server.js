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
    batch: { type: String, default: 'Batch 1' },
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

    // Set default batch number
    const batch = await Setting.findOne({ key: 'batchNumber' });
    if (!batch) {
        await Setting.create({ key: 'batchNumber', value: '1' });
        console.log('✓ Batch number initialized');
    }

    // Set default announcement
    const announcement = await Setting.findOne({ key: 'announcement' });
    if (!announcement) {
        await Setting.create({ key: 'announcement', value: 'Welcome! The VCF will be released soon. Join our WhatsApp group for updates.' });
        console.log('✓ Announcement initialized');
    }
}
initSystem();

// ========== SELF-PING (KEEP ALIVE) ==========
const PORT = process.env.PORT || 3000;

function selfPing() {
    const url = `http://localhost:${PORT}`;
    fetch(url)
        .then(() => console.log('✓ Self-ping successful'))
        .catch(err => console.log('✗ Self-ping failed:', err.message));
}

// Start self-ping after server starts
setTimeout(() => {
    selfPing();
    setInterval(selfPing, 14 * 60 * 1000); // Every 14 minutes
}, 5000);

// ========== PUBLIC API ==========
app.get('/api/timer', async (req, res) => {
    const timer = await Setting.findOne({ key: 'unlockTime' });
    const batch = await Setting.findOne({ key: 'batchNumber' });
    const announcement = await Setting.findOne({ key: 'announcement' });
    res.json({ 
        unlockTime: timer.value, 
        isUnlocked: Date.now() >= timer.value,
        batch: batch ? batch.value : '1',
        announcement: announcement ? announcement.value : ''
    });
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
        
        const batch = await Setting.findOne({ key: 'batchNumber' });
        const contact = new Contact({ 
            name, 
            phone,
            batch: batch ? `Batch ${batch.value}` : 'Batch 1'
        });
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
    const batch = await Setting.findOne({ key: 'batchNumber' });
    const announcement = await Setting.findOne({ key: 'announcement' });
    res.json({ 
        totalContacts: count, 
        unlockTime: timer.value,
        batch: batch ? batch.value : '1',
        announcement: announcement ? announcement.value : ''
    });
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

// ========== ADMIN ROUTES ==========

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

// Edit contact
app.put('/api/admin/contact/:id', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { name, phone } = req.body;
    try {
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { name, phone },
            { new: true }
        );
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        res.json({ success: true, contact });
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Update batch number
app.put('/api/admin/batch', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { batch } = req.body;
    if (!batch || isNaN(batch) || batch < 1) {
        return res.status(400).json({ error: 'Invalid batch number' });
    }
    await Setting.findOneAndUpdate(
        { key: 'batchNumber' },
        { value: String(batch) },
        { upsert: true }
    );
    res.json({ success: true, batch });
});

// Export CSV
app.get('/api/admin/export/csv', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const contacts = await Contact.find().sort({ submittedAt: -1 });
    let csv = 'Name,Phone,Batch,Submitted\n';
    contacts.forEach(c => {
        csv += `"${c.name}","${c.phone}","${c.batch}","${new Date(c.submittedAt).toISOString()}"\n`;
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

// Reset timer to 2 days
app.post('/api/admin/timer/reset', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const unlockTime = Date.now() + (2 * 24 * 60 * 60 * 1000);
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

// Post announcement (message)
app.post('/api/admin/announcement', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const admin = await Setting.findOne({ key: 'adminKey' });
    if (adminKey !== admin.value) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }
    await Setting.findOneAndUpdate(
        { key: 'announcement' },
        { value: message },
        { upsert: true }
    );
    res.json({ success: true, message: 'Announcement updated' });
});

// ========== SERVE PAGES ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'user.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));