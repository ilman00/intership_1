const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const dbConnection = require("./db");


const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }))


const createTableQuery = `
    CREATE TABLE IF NOT EXISTS designation (
        title VARCHAR(255) NOT NULL,
    )
`;

dbConnection.query(createTableQuery, (error, results) => {
    if (error) {
        console.error('Error creating table: ', error);
        return;
    }
    console.log('Table created successfully.');
});

app.get("/add_designation", (req, res) => {
    res.render("add_designation")
});

app.post("/add_designation", (req, res)=>{
    const addDesignation = req.body.designation;
    const data = `INSERT INTO designation (title) VALUES (?)`
    dbConnection.query(data, addDesignation, (error, results, fields)=>{
        if(error){
            console.log("Error inserting data ", error);
            return;
        }
        console.log("data inserted");
    });
    
});



app.get("/add_role", (req, res)=>{
    res.render("add_role");
});


app.listen(5000, ()=>{
    console.log("server runing");
} )