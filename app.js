const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const multer = require("multer");
const dbConnection = require("./db");
const path = require("path");


const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// multer
var storage = multer.diskStorage({
    destination: (req, file, callBack) => {
      callBack(null, './uploads/')     // './uploads/' directory name where save the file
    },
    filename: (req, file, callBack) => {
      callBack(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }
  })
  
  var upload = multer({
    storage: storage
  });




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

app.post("/add_role", (req, res) => {
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
});



// user rout
app.get("/add_user", (req, res) => {
    const myquery = `SELECT * FROM user`;
    dbConnection.query(myquery, (err, results, fields)=>{
        console.log(results);
        res.render("add_user", {userData: results});
    })

});

app.post("/add_user", upload.single('image'), (req, res) => { 
    const role = req.body.role;
    const designation = req.body.designation;
    const name = req.body.name;
    const email = req.body.email;
    const mobile = req.body.mobile;
    const password = req.body.password;
    const organization = req.body.organization;
    const department = req.body.department;

    console.log("req.file above the if condition :", req.file.filename );
    if (!req.file) {
        console.log("No file upload");
      } else {
        console.log(req.file.filename)
        var imgsrc = "/uploads/" + req.file.filename
        var queryArr = [role, designation, name, email, mobile, password, organization, department, imgsrc]
        var insertData = "INSERT INTO user(role, designation, name, email, mobile, password, organization, department, imagePath)VALUES(?,?,?,?,?,?,?,?,?)";
        dbConnection.query(insertData, queryArr, (err, result) => {
          if (err) throw err
          console.log("file uploaded");
    
          res.redirect("/add_user");
        });
      }

})






// organization rout
app.get("/add_organization", (req, res) => {
    const requestOrg = `SELECT * FROM organization`;

    dbConnection.query(requestOrg, (err, results, fields) => {
        if (err) throw err;
        console.log(results);
        res.render("add_organization", { resultsTo: results })
    });
});

app.post("/add_organization", (req, res) => {
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
app.get("/add_subdepartment", (req, res) => {
    const requestOrg = `SELECT orgTitle FROM organization`;
    const requestDepartment = `SELECT * FROM department`;

    dbConnection.query(requestOrg, (err1, resultOrg, fields1) => {
        dbConnection.query(requestDepartment, (err2, resultDep, fields2) => {

            res.render("add_subdepartment", { resultOrg: resultOrg, resultDep: resultDep });

        });
    });

});

app.post("/add_subdepartment", (req, res) => {
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


});

app.get("/edit/:file", (req, res) => {
    console.log(req.params.file);
    const param = req.params.file;
    
    res.render("edit");
})


app.post("/edit/:file", (req, res) => {
    const param = req.params.file;
    console.log( "post : ", param);

    const tableName = param.split(/[^a-zA-Z]/)[0];
    const id = param.split(/[^0-9]/).pop();
    console.log("table Name: "+ tableName, "table Id:" + id);
    const newTitle = req.body.title;
    if(tableName === "designation"){
        var sql = `UPDATE ${tableName} SET title = '${newTitle}' WHERE id = ${id}`;
    }else if(tableName === "department"){
        var sql = `UPDATE ${tableName} SET depTitle = '${newTitle}' WHERE depId = ${id}`;
    }else if(tableName === "organization"){
        var sql = `UPDATE ${tableName} SET orgTitle = '${newTitle}' WHERE orgId = ${id}`;
    }else if(tableName === "role"){
        var sql = `UPDATE ${tableName} SET roleTitle = '${newTitle}' WHERE roleId = ${id}`;
    }

    dbConnection.query(sql, (err, results)=>{
        if(err) throw err;
        res.redirect("/add_designation");
    });


})


app.listen(5000, () => {
    console.log("server runing");
})