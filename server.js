const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

app.get("/", (req,res)=>{
    res.sendFile(path.join(__dirname,"index.html"))
})

/* MongoDB */
const MONGODB_URL = "mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/?retryWrites=true&w=majority"

mongoose.connect(MONGODB_URL)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err))

/* MODELS */

// Contact model
const Contact = mongoose.model("Contact", {
    name: String,
    phone: String
})

// Timer model
const Timer = mongoose.model("Timer", {
    unlockTime: Number
})

/* INITIALIZE TIMER IN DB (if not exists) */
async function initTimer() {
    let timer = await Timer.findOne()
    if(!timer){
        // Default 2 days from now
        const unlockTime = Date.now() + 2*24*60*60*1000
        await Timer.create({unlockTime})
        console.log("Timer initialized in database")
    }
}

initTimer()

/* ADD CONTACT */
app.post("/add", async (req,res)=>{
    try{
        const contact = new Contact(req.body)
        await contact.save()
        res.send("Saved")
    } catch(err){
        console.log(err)
        res.status(500).send("Error saving contact")
    }
})

/* CONTACT COUNT */
app.get("/count", async (req,res)=>{
    const count = await Contact.countDocuments()
    res.json({count})
})

/* TIMER API */
app.get("/timer", async (req,res)=>{
    const timer = await Timer.findOne()
    res.json({unlockTime: timer.unlockTime})
})

/* OPTIONAL: Reset timer (admin route) */
app.post("/set-timer", async (req,res)=>{
    const days = req.body.days || 2
    const unlockTime = Date.now() + days*24*60*60*1000
    let timer = await Timer.findOne()
    if(timer){
        timer.unlockTime = unlockTime
        await timer.save()
    } else {
        await Timer.create({unlockTime})
    }
    res.json({unlockTime})
})

/* DOWNLOAD VCF */
app.get("/download", async (req,res)=>{
    const timer = await Timer.findOne()
    if(Date.now() < timer.unlockTime){
        return res.status(403).send("Download locked until timer finishes")
    }

    const contacts = await Contact.find()
    let vcf = ""
    contacts.forEach(c=>{
        vcf += `BEGIN:VCARD
VERSION:3.0
FN:${c.name}
TEL:${c.phone}
END:VCARD
`
    })

    res.setHeader("Content-Type","text/vcard")
    res.setHeader("Content-Disposition","attachment; filename=contacts.vcf")
    res.send(vcf)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, ()=>{
    console.log("Server running on port " + PORT)
})
