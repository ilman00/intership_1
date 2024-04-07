const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const dbConnection = require("./db");


const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }))


// const createTableQuery = `
// CREATE TABLE your_table_name (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     title VARCHAR(255),
//     timeStamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// )`;

// dbConnection.query(createTableQuery, (error, results) => {
//     if (error) {
//         console.error('Error creating table: ', error);
//         return;
//     }
//     console.log('Table created successfully.');
// });




// designation rout
app.get("/add_designation", (req, res) => {
    const requestDesignation = `SELECT * FROM designation`;

    dbConnection.query(requestDesignation, (err, results, fields) => {
        if (err) throw err;
        console.log(results);
        res.render("add_designation", { resultsTo: results })
    })

});

app.post("/add_designation", (req, res) => {
    const addDesignation = req.body.designation;
    console.log(addDesignation);
    const data = `INSERT INTO designation (title) VALUES (?)`;
    dbConnection.query(data, addDesignation, (error, results, fields) => {
        if (error) {
            console.log("Error inserting data ", error);
            return;
        }
        console.log("data inserted");
        res.redirect("/add_designation");
    });

});

// role rout

app.get("/add_role", (req, res) => {
    const requestRole = `SELECT * FROM role`;

    dbConnection.query(requestRole, (err, results, fields) => {
        if (err) throw err;
        console.log(results);
        res.render("add_role", { resultsTo: results })
    });

});

app.post("/add_role", (req, res)=> {
    const addRole = req.body.role;
    console.log(addRole);
    const data = `INSERT INTO role (roleTitle) VALUES (?)`;
    dbConnection.query(data, addRole, (error, results, fields) => {
        if (error) {
            console.log("Error inserting data ", error);
            return;
        }
        console.log("data inserted");
        res.redirect("/add_role");
    });
} );

// user rout
app.get("/add_user", (req, res)=>{
    res.render("add_user");
});

app.post("/add_user", (req, res)=>{})


// organization rout
app.get("/add_organization", (req, res)=>{
    const requestOrg = `SELECT * FROM organization`;

    dbConnection.query(requestOrg, (err, results, fields) => {
        if (err) throw err;
        console.log(results);
        res.render("add_organization", { resultsTo: results })
    });
});

app.post("/add_organization", (req, res)=>{
    const addOrg = req.body.org;
    console.log(addOrg);
    const data = `INSERT INTO organization (orgTitle) VALUES (?)`;
    dbConnection.query(data, addOrg, (error, results, fields) => {
        if (error) {
            console.log("Error inserting data ", error);
            return;
        }
        console.log("data inserted");
        res.redirect("/add_organization");
    });
});


// sub Department rout
app.get("/add_subdepartment", (req, res)=>{
    const requestOrg = `SELECT orgTitle FROM organization`;
    const requestDepartment = `SELECT * FROM department`;

    dbConnection.query(requestOrg, (err1, resultOrg, fields1)=>{
        dbConnection.query(requestDepartment, (err2, resultDep, fields2 )=>{

            res.render("add_subdepartment", { resultOrg: resultOrg, resultDep: resultDep });
        
        });
    });

});

app.post("/add_subdepartment", (req, res)=>{
    const addDep = req.body.department;
    const addOrg = req.body.organization;
    var depArray = [addOrg, addDep]
    console.log(addOrg);
    const data = `INSERT INTO department (depOrg ,depTitle) VALUES (?,?)`;
    dbConnection.query(data, depArray, (error, results, fields) => {
        if (error) {
            console.log("Error inserting data ", error);
            return;
        }
        console.log("data inserted");
        res.redirect("/add_subdepartment");
    });


})



app.listen(5000, () => {
    console.log("server runing");
})