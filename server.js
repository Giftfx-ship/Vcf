const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cors());

// serve html files
app.use(express.static(__dirname));

app.get("/", (req,res)=>{
res.sendFile(path.join(__dirname,"index.html"))
})

// Hard-coded MongoDB URL
const MONGODB_URL = "mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URL)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

const Contact = mongoose.model("Contact",{
name:String,
phone:String
});

app.post("/add",async(req,res)=>{
try{

const contact = new Contact(req.body);

await contact.save();

res.send("Saved");

}catch(err){

console.log(err);
res.status(500).send("Error saving contact");

}
});

app.get("/count",async(req,res)=>{

const count = await Contact.countDocuments();

res.json({count});

});

app.get("/download",async(req,res)=>{

const contacts = await Contact.find();

let vcf = "";

contacts.forEach(c=>{

vcf += `BEGIN:VCARD
VERSION:3.0
FN:${c.name}
TEL:${c.phone}
END:VCARD
`;

});

res.setHeader("Content-Type","text/vcard");
res.setHeader("Content-Disposition","attachment; filename=contacts.vcf");

res.send(vcf);

});

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("Server running on port "+PORT)
});
