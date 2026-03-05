const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Read MongoDB URL from environment variable
const MONGODB_URL = process.env.MONGODB_URL;

mongoose.connect(MONGODB_URL)
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));

const Contact = mongoose.model("Contact", {
    name: String,
    phone: String
});

app.post("/add", async (req, res) => {
    try {
        const contact = new Contact(req.body);
        await contact.save();
        res.send("Saved");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error saving contact");
    }
});

app.get("/count", async (req, res) => {
    const count = await Contact.countDocuments();
    res.json({ count });
});

app.get("/download", async (req, res) => {
    const contacts = await Contact.find();
    let vcf = "";
    contacts.forEach(c => {
        vcf += `BEGIN:VCARD
VERSION:3.0
FN:${c.name}
TEL:${c.phone}
END:VCARD
`;
    });

    res.setHeader("Content-Type", "text/vcard");
    res.setHeader("Content-Disposition", "attachment; filename=contacts.vcf");
    res.send(vcf);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
