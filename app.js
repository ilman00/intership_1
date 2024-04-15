const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const multer = require("multer");
const dbConnection = require("./db");
const path = require("path");
const socketIO = require("socket.io");
const http = require("http");
const { log } = require("console");


const app = express();

const server = http.createServer(app)
const io = socketIO(server);

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
});

var upload = multer({
    storage: storage
});




// socket.io

io.on("connection", (socket) => {
    console.log("user connected");
    socket.on("selectData", (data) => {
        console.log("socket data :", data);

        myquery = `SELECT * FROM department WHERE depOrg = '${data}'`;
        dbConnection.query(myquery, (err, results, fields) => {
            if (err) throw err;
            socket.emit("selectData from server", results);
            console.log(results);
        });
    });

    socket.on("department Data", (data) => {
        console.log("department data :", data);

        const myQuery = `SELECT * FROM user WHERE department = '${data}'`
        dbConnection.query(myQuery, (err, result, fields) => {
            if (err) throw err;
            socket.emit("user data", data);
            console.log(data);
        });
    });

    socket.on("organization Data from user", (data) => {
        const depQuery = `SELECT * FROM department WHERE depOrg = '${data}'`
        dbConnection.query(depQuery, (err, results, fields) => {
            console.log(results);
            socket.emit("department data to user", results);
        });
    });

    socket.on("data from assign task", (data) => {
        const userQuery = `SELECT * FROM user WHERE department = '${data}'`
        dbConnection.query(userQuery, (err, result) => {
            socket.emit("data to assign task", result);
        });
    });

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
    const userQuery = `SELECT * FROM user`;
    const roleQuery = `SELECT * FROM role`;
    const desigQuery = `SELECT * FROM designation`;
    const orgQeury = `SELECT * FROM  organization`;

    dbConnection.query(userQuery, (err1, results, fields) => {
        dbConnection.query(roleQuery, (err2, roleData, rolefields) => {
            dbConnection.query(desigQuery, (err3, desigData, desigFields) => {
                dbConnection.query(orgQeury, (err4, orgData, orgFields) => {

                    res.render("add_user", { userData: results, role: roleData, designation: desigData, organization: orgData });
                });
            });
        });

    });

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

    var imgsrc = "No File Chosen";

    if (req.file && req.file.filename) {
        imgsrc = "/uploads/" + req.file.filename
    }

    var queryArr = [role, designation, name, email, mobile, password, organization, department, imgsrc]
    var insertData = "INSERT INTO user(role, designation, name, email, mobile, password, organization, department, imagePath)VALUES(?,?,?,?,?,?,?,?,?)";
    dbConnection.query(insertData, queryArr, (err, result) => {
        if (err) throw err
        console.log("file uploaded");

        res.redirect("/add_user");
    });
});



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
    console.log("post : ", param);

    const tableName = param.split(/[^a-zA-Z]/)[0];
    const id = param.split(/[^0-9]/).pop();
    console.log("table Name: " + tableName, "table Id:" + id);
    const newTitle = req.body.title;
    if (tableName === "designation") {
        var sql = `UPDATE ${tableName} SET title = '${newTitle}' WHERE id = ${id}`;
    } else if (tableName === "department") {
        var sql = `UPDATE ${tableName} SET depTitle = '${newTitle}' WHERE depId = ${id}`;
    } else if (tableName === "organization") {
        var sql = `UPDATE ${tableName} SET orgTitle = '${newTitle}' WHERE orgId = ${id}`;
    } else if (tableName === "role") {
        var sql = `UPDATE ${tableName} SET roleTitle = '${newTitle}' WHERE roleId = ${id}`;
    }

    dbConnection.query(sql, (err, results) => {
        if (err) throw err;
        console.log("tableName in query : " + tableName);
        res.redirect(`/add_${tableName}`);
    });
});

app.get("/create_task", (req, res) => {
    const myQuery = `SELECT * FROM organization`;
    dbConnection.query(myQuery, (err, results, fields) => {

        res.render("create_task", { results: results });
    })
});

app.post("/create_task", upload.single('imagePath'), (req, res) => {
    let image = 'no file chosen';
    if (req.file && req.file.filename) {
        image = req.file.filename;
    }
    const createTask = {
        title: req.body.title,
        description: req.body.description,
        date: req.body.date,
        organization: req.body.organization,
        department: req.body.department,
        assignTo: req.body.assignTo,
        email: req.body.email,
        taskType: req.body.taskType,
        imagePath: image
    }
    const taskQuery = `INSERT INTO createTask(title, description, date, organization, department, assignTo, email, taskType, imagePath) VALUES (?,?,?,?,?,?,?,?,?)`
    const taskArry = [createTask.title, createTask.description, createTask.date, createTask.organization, createTask.department, createTask.assignTo, createTask.email, createTask.taskType, createTask.imagePath];
    dbConnection.query(taskQuery, taskArry, (err, results, fields) => {
        res.redirect("/create_task");
    });
});

// created Tasks
app.get("/createdTask", (req, res) => {
    const myQuery = `SELECT * FROM assign_task`;
        
        dbConnection.query(myQuery, (err, results, fields) => {
            
            res.render("createdTask", { results: results });
    });
});




// assign_task

app.get("/assign_task/:user", (req, res) => {
    console.log(req.params.user);
    let param = req.params.user;
    let parts = param.split("-");
    let id = parts[1].trim();
    console.log("id: ", id);
    const myQuery = `SELECT * FROM createtask WHERE taskId = ${id}`;
    const depQuery = `SELECT * FROM department`;
    dbConnection.query(myQuery, (err, result) => {
        dbConnection.query(depQuery, (err, depResult) => {
            res.render("assign_task", { result: result[0], depResult: depResult });
        });
    });
});

app.post("/assign_task/:user", upload.single('assignTaskImage'), (req, res) => {
    let param = req.params.user;
    let parts = param.split("-");
    let id = parts[1].trim();

    let filePath = "no file chosen"
    if (req.file && req.file.filename) {
        filePath = req.file.filename
    }

    const assignTask = {
        department: req.body.department,
        user: req.body.user,
        remarks: req.body.remarks,
        imagePath: filePath
    }


    const myQuery = `INSERT INTO assign_task(id, title, description, deadline, department, user, remarks, assignTaskImg) VALUES (?,?,?,?,?,?,?,?)`;

    
});

server.listen(5000, () => {
    console.log("server runing");
})