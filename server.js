const express=require("express")
const mongoose=require("mongoose")
const cors=require("cors")

const app=express()

app.use(express.json())
app.use(cors())

mongoose.connect("mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/?appName=Cluster0")

const Contact=mongoose.model("Contact",{
name:String,
phone:String
})

app.post("/add",async(req,res)=>{

const contact=new Contact(req.body)

await contact.save()

res.send("Saved")

})

app.get("/count",async(req,res)=>{

const count=await Contact.countDocuments()

res.json({count})

})

app.get("/download",async(req,res)=>{

const contacts=await Contact.find()

let vcf=""

contacts.forEach(c=>{

vcf+=`BEGIN:VCARD
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

app.listen(3000)
