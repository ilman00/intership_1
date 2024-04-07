const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const dbConnection = require("./db");


const app = express();

app.use(express.static("public"))
app.set("view engine", "ejs");

app.get("/", (req, res) => {
    res.render("add_designation")
});

app.get("/add_role", (req, res)=>{
    res.render("add_role");
});


app.listen(5000, ()=>{
    console.log("server runing");
} )