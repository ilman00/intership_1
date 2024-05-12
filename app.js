const express = require("express");
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const flash = require('connect-flash');
const bodyParser = require("body-parser");
const ejs = require("ejs");
const multer = require("multer");
const dbConnection = require("./db");
const path = require("path");
const socketIO = require("socket.io");
const http = require("http");
const { log } = require("console");
const bcrypt = require('bcryptjs');


const app = express();

const server = http.createServer(app)
const io = socketIO(server);
var requestRout = ""

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());



passport.use(new LocalStrategy(
    function (username, password, done) {
        dbConnection.query('SELECT * FROM user WHERE email = ?', [username], async (err, results) => {
            if (err) { return done(err); }
            if (!results.length) {
                return done(null, false, { message: 'Incorrect username.' });
            }
            const user = results[0];
            try {
                // Use bcrypt to compare the password
                if (await bcrypt.compare(password, user.password)) {
                    return done(null, user);
                } else {
                    return done(null, false, { message: 'Password incorrect.' });
                }
            } catch (error) {
                return done(error);
            }
        });
    }
));

passport.serializeUser(function (user, done) {
    done(null, user.email);
});

passport.deserializeUser(function (username, done) {
    dbConnection.query('SELECT * FROM user WHERE email = ?', [username], function (err, results) {
        if (err) { return done(err); }
        if (!results.length) {
            return done(new Error('User not found'));
        }
        const user = results[0];
        done(null, user);
    });
});



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
            console.log("socket Data", results);
            socket.emit("selectData from server", results);
            console.log(results);
        });
    });

    socket.on("department Data", (data) => {
        console.log("department data :", data);

        const myQuery = `SELECT * FROM user WHERE department = '${data}'`
        dbConnection.query(myQuery, (err, result, fields) => {
            if (err) throw err;
            socket.emit("user data", result);
            console.log(result);
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


app.get("/login", (req, res) => {
    res.render("login", { title: "Login" });
});

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.redirectTo = req.originalUrl;
    res.redirect('/login');
}


app.post('/login',
    passport.authenticate('local', { failureRedirect: '/login', failureFlash: true, keepSessionInfo: true }),
    function (req, res) {
        res.redirect(req.session.redirectTo || "/");

    });



app.get('/logout', function (req, res) {
    req.logout(function (err) {
        if (err) {
            console.error('Error during logout:', err);
            return next(err);
        }
        res.redirect('/login');
    });
});


app.get("/", isLoggedIn, (req, res) => {
    const user = req.user;
    const userDesig = req.user.designation;
    const query = `SELECT * FROM organization`;
    dbConnection.query(query, (err, result) => {

        res.render("dashboard", { title: "Dashboard", organizations: result, userAccessibilty: userDesig, name: user.name, image: user.imagePath });
    })
    console.log(user);
});

app.get("/specificOrg/:organiztion", isLoggedIn, (req, res) => {
    const user = req.user;
    const param = req.params.organiztion;
    res.render("specific_org", { title: param, name: user.name, image: user.imagePath, user: user });
});

app.get("/organization/:organization/tasks/:status", isLoggedIn, (req, res) => {
    const paramStatus = req.params.status;
    const paramOrg = req.params.organization
    const user = req.user;
    var query = ``;
    console.log("Loged User: ", user);
    if (paramStatus === "tasks-created-by-ceo") {
        if (user.designation === "CEO") {
            query = `SELECT * FROM createtask JOIN files ON createtask.fileId = files.fileId WHERE createtask.organization = '${paramOrg}' AND initiated_by = 'CEO'`;
        } else {
            query = `SELECT * FROM createtask JOIN files ON createtask.fileId = files.fileId WHERE createtask.organization = '${paramOrg}' AND email = '${user.email}' AND initiated_by = 'CEO'`;
        }

    } else if (paramStatus === "completed-tasks") {
        if (user.designation === "CEO") {
            query = `SELECT * FROM createtask JOIN files ON createtask.fileId = files.fileId WHERE currentStatus = 'Complete' AND organization = '${paramOrg}'`;
        } else {
            query = `SELECT * FROM createtask JOIN files ON createtask.fileId = files.fileId WHERE currentStatus = 'Complete' AND organization = '${paramOrg}' AND email = '${user.email}'`;
        }
    } else if (paramStatus === "delayed-tasks") {
        query = `SELECT * FROM createtask WHERE date > CURDATE() AND organization = '${paramOrg}'`;
    } else if (paramStatus === "in-process-tasks") {
        query = `SELECT * FROM createtask JOIN files ON createtask.fileId = files.fileId WHERE currentStatus = 'In Process' AND organization = '${paramOrg}'`;
    } else {
        query = `SELECT * FROM createtask WHERE organization = '${paramOrg}'`;
    }
    dbConnection.query(query, (err, results) => {
        console.log("Result From create Task: ", results);
        const taskId = results.map(result => result.taskId) 
        console.log("taskIds : ", taskId);
        const historyQuery = `SELECT taskId,file from history WHERE taskId IN  (${taskId})`;
        dbConnection.query(historyQuery, (err, filesFromHistory)=>{
            if(err) throw err
            console.log("From History Table", filesFromHistory);
            res.render("createdTask", { title: paramStatus, paramOrg: paramOrg, results: results, name: user.name, image: user.imagePath, file: filesFromHistory });
        })
    });
});


// designation rout

app.get("/add_designation", isLoggedIn, (req, res) => {
    const user = req.user;
    const requestDesignation = `SELECT * FROM designation`;
    // console.log(req.user);
    dbConnection.query(requestDesignation, (err, results, fields) => {
        if (err) throw err;
        res.render("add_designation", { title: "Add Designation", resultsTo: results, name: user.name, image: user.imagePath })
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

app.get("/add_role", isLoggedIn, (req, res) => {
    const user = req.user;
    const checkDesig = req.user.designation;
    if (checkDesig === "Director" || checkDesig === "CEO") {
        const requestRole = `SELECT * FROM role`;

        dbConnection.query(requestRole, (err, results, fields) => {
            if (err) throw err;
            // console.log(results);
            res.render("add_role", { title: "Add Role", resultsTo: results, name: user.name, image: user.imagePath })
        });
    } else {
        res.send("<h1> You dont have permision to this Page </h1>")
    }



});

app.post("/add_role", (req, res) => {
    const addRole = req.body.role;
    console.log(addRole);
    console.log(req.user);
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

// This is just a testing code for user route
app.get("/add_user", (req, res) => {
    const user = req.user || "";
    // const checkDesig = req.user.designation;
    // if (checkDesig === "Director" || checkDesig === "CEO") {

    const userQuery = `SELECT * FROM user`;
    const roleQuery = `SELECT * FROM role`;
    const desigQuery = `SELECT * FROM designation`;
    const orgQeury = `SELECT * FROM  organization`;

    dbConnection.query(userQuery, (err1, results) => {
        dbConnection.query(roleQuery, (err2, roleData) => {
            dbConnection.query(desigQuery, (err3, desigData) => {
                dbConnection.query(orgQeury, (err4, orgData) => {

                    res.render("add_user", { title: "Add User", userData: results, role: roleData, designation: desigData, organization: orgData, name: user.name || "", image: user.imagePath || "" });
                });
            });
        });

    });
    // } else {
    //     res.send("<h1> You dont have permision to this Page </h1>")
    // }

});


app.post("/add_user", upload.single('image'), async (req, res) => {
    const role = req.body.role;
    const designation = req.body.designation;
    const name = req.body.name;
    const email = req.body.email;
    const mobile = req.body.mobile;
    const password = req.body.password; // Store the password without hashing
    const organization = req.body.organization;
    const department = req.body.department;

    var imgsrc = "No File Chosen";

    if (req.file && req.file.filename) {
        imgsrc = "/uploads/" + req.file.filename
    }

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt rounds

        var queryArr = [role, designation, name, email, mobile, hashedPassword, organization, department, imgsrc]
        var insertData = "INSERT INTO user(role, designation, name, email, mobile, password, organization, department, imagePath)VALUES(?,?,?,?,?,?,?,?,?)";
        dbConnection.query(insertData, queryArr, (err, result) => {
            if (err) throw err;
            console.log("file uploaded");

            res.redirect("/add_user");
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error adding user');
    }
});


// organization rout
app.get("/add_organization", isLoggedIn, (req, res) => {
    const user = req.user
    const checkDesig = req.user.designation;
    if (checkDesig === "Director" || checkDesig === "CEO") {
        const requestOrg = `SELECT * FROM organization`;

        dbConnection.query(requestOrg, (err, results, fields) => {
            if (err) throw err;
            console.log(results);
            res.render("add_organization", { title: "Add Organization", resultsTo: results, name: user.name, image: user.imagePath })
        });
    } else {
        res.send("<h1> You dont have permision to this Page </h1>")
    }
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
app.get("/add_subdepartment", isLoggedIn, (req, res) => {
    const user = req.user;
    const checkDesig = req.user.designation;
    if (checkDesig === "Director" || checkDesig === "CEO") {
        const requestOrg = `SELECT orgTitle FROM organization`;
        const requestDepartment = `SELECT * FROM department`;

        dbConnection.query(requestOrg, (err1, resultOrg, fields1) => {
            dbConnection.query(requestDepartment, (err2, resultDep, fields2) => {

                res.render("add_subdepartment", { title: "Add Sub Department", resultOrg: resultOrg, resultDep: resultDep, name: user.name, image: user.imagePath });

            });
        });
    } else {
        res.send("<h1> You dont have permision to this Page </h1>")
    }

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

app.get("/edit/:file", isLoggedIn, (req, res) => {
    console.log(req.params.file);
    const param = req.params.file;
    const user = req.user;
    res.render("edit", { title: "Edit", name: user.name, image: user.imagePath });
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

app.get("/create_task", isLoggedIn, (req, res) => {
    const myQuery = `SELECT * FROM organization`;
    const user = req.user;
    dbConnection.query(myQuery, (err, results, fields) => {

        res.render("create_task", { title: "Create Task", results: results, name: user.name, image: user.imagePath });
    })
});

app.post("/create_task", upload.single('filePath'), (req, res) => {
    let image = 'no file chosen';
    if (req.file && req.file.filename) {
        image = req.file.filename;
    }
    const user = req.user;
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
    const fileQuery = `INSERT INTO files (file1) VALUES (?) `;
    const taskQuery = `INSERT INTO createTask(title, description, date, organization, department, assignTo, email, taskType, fileId, initiated_by) VALUES (?,?,?,?,?,?,?,?,?, ?)`;

    dbConnection.query(fileQuery, [createTask.imagePath], (err, FileResult) => {
        console.log("File Result: ", FileResult.insertId);
        const taskArry = [createTask.title, createTask.description, createTask.date, createTask.organization, createTask.department, createTask.assignTo, createTask.email, createTask.taskType, FileResult.insertId, user.designation];

        dbConnection.query(taskQuery, taskArry, (err, results) => {
            res.redirect(`/organization/${createTask.organization}/tasks/create-tasks`);
        });
    });
});

// created Tasks
// app.get("/createdTask", isLoggedIn, (req, res) => {

//     const logedInUser = req.user;


//     let myQuery = ``;
//     if (logedInUser.designation === "CEO") {
//         myQuery = `SELECT * FROM createtask`;
//     } else if (logedInUser.designation === "Director") {
//         myQuery = `SELECT * FROM createtask WHERE organization = '${logedInUser.organization}'`
//     } else if (logedInUser.designation === "Staff") {
//         myQuery = `SELECT * FROM createtask WHERE email = '${logedInUser.email}'`;
//     }
//     dbConnection.query(myQuery, (err, results, fields) => {
//         res.render("createdTask", { title: "Created Tasks", results: results, name: logedInUser.name, image: logedInUser.imagePath });
//     });

// });

// assign_task

app.get("/organization/:organization/tasks/:task/assign_task/:user", isLoggedIn, (req, res) => {
    const user = req.user;
    let param = req.params.user;
    console.log("param: ", param);
    let parts = param.split("-");
    console.log("Request.URL: ", req.url);
    let id = parts[1];
    const paramOrg = req.params.organization;
    const paramTask = req.params.task;
    console.log("My  ID for checking : ", id);
    const myQuery = `SELECT * FROM createtask WHERE taskId = ${id}`;
    const depQuery = `SELECT * FROM department`;
    dbConnection.query(myQuery, (err, result) => {
        dbConnection.query(depQuery, (err, depResult) => {
            res.render("assign_task", { title: "Assign_task", paramOrg: paramOrg, paramTask: paramTask, result: result[0], depResult: depResult, name: user.name, image: user.imagePath });
        });
    });
});

app.post("/organization/:organization/tasks/:task/assign_task/:user", upload.single('assignTaskFile'), (req, res) => {
    let param = req.params.user;
    let parts = param.split("-");
    let id = parts[1];
    const paramOrg = req.params.organization;
    const paramTask = req.params.task;
    let filePath = "/uploads/person.png";
    let user = req.body.user;
    let partsOfUser = user.split(":");
    let userName = partsOfUser[0];
    let userEmail = partsOfUser[1];
    // let historyQueryArray = [];
    let assignTask = {
        department: req.body.department,
        userName: userName,
        userEmail: userEmail,
        remarks: req.body.remarks,

    }
    let myQuery = `UPDATE createtask SET assignTo = ?, email = ?, remarks = ? WHERE taskId = ?`;

    if (req.file && req.file.filename) {
        filePath = req.file.filename;
        const selectQueryForCreate = `SELECT description, initiated_by, timeStamp, date ,  currentStatus FROM createtask WHERE taskId = ?`;
        const historyQuery = `INSERT INTO history (taskId, description, initiated_by, on_date_time, assigned_to, deadline, remarks , current_status, file) VALUES (?,?,?,?,?,?,?,?,?)`;
        
        dbConnection.query(selectQueryForCreate, [id], (err, result1) => {
            const historyQueryArray = [id, result1[0].description, result1[0].initiated_by, result1[0].timeStamp, assignTask.userName, result1[0].date, assignTask.remarks, result1[0].currentStatus, filePath];
            console.log("file ID: ", result1);
            dbConnection.query(historyQuery, historyQueryArray , (err, fileResult) => {
                if (err) throw err;
                console.log("file added to history");
                dbConnection.query(myQuery, [assignTask.userName, assignTask.userEmail, assignTask.remarks, id], (err, result2) => {
                    if (err) {
                        // Handle error
                        console.error("Error updating task:", err);
                        res.status(500).send("Error updating task.");
                        return;
                    }
                    res.redirect(`/organization/${paramOrg}/tasks/${paramTask}`);
                });
            })
        });

    } else {
        const selectQueryForCreate = `SELECT  FROM description, initiated_by, timeStamp, date ,  currentStatus createtask WHERE taskId = ?`;
        const historyQuery = `INSERT INTO history (taskId, description, initiated_by, on_date_time, assigned_to, deadline, remarks , current_status) VALUES (?,?,?,?,?,?,?,?,?)`;
        
        dbConnection.query(selectQueryForCreate, [id], (err, result1) => {
            const historyQueryArray = [id, result1[0].descripotion, result1[0].initiated_by, result1[0].timeStamp, assignTask.userName, result1[0].date, assignTask.remarks, result1[0].currentStatus];
            console.log("file ID: ", result1);
            dbConnection.query(historyQuery, historyQueryArray , (err, fileResult) => {
                if (err) throw err;
                console.log("file added to history");
                dbConnection.query(myQuery, [assignTask.userName, assignTask.userEmail, assignTask.remarks, id], (err, result2) => {
                    if (err) {
                        // Handle error
                        console.error("Error updating task:", err);
                        res.status(500).send("Error updating task.");
                        return;
                    }
                    res.redirect(`/organization/${paramOrg}/tasks/${paramTask}`);
                });
            })
        });
    }
});

app.get("/organization/:organization/tasks/:task/action/:status", isLoggedIn, (req, res) => {
    const user = req.user;
    let paramStatus = req.params.status;
    let parts = paramStatus.split("-");
    let id = parts[1].trim();
    const paramOrg = req.params.organization;
    const paramTask = req.params.task;

    let file = "";
    if (req.file && req.file.fieldname) {
        file = req.file.filename;
    }
    const query = `SELECT * FROM createtask WHERE taskId = ${id}`;

    dbConnection.query(query, (err, result) => {
        if (err) throw err
        console.log(result[0]);
        res.render("action", { title: "Action", paramOrg: paramOrg, paramTask: paramTask, result: paramStatus, name: user.name, image: user.imagePath });
    })
});

app.post("/organization/:organization/tasks/:task/action/:status", upload.single('actionTaskFile'), (req, res) => {
    let param = req.params.status;
    let parts = param.split("-");
    let id = parts[1].trim();
    console.log("parameter from post request :" + param);

    const paramOrg = req.params.organization;
    const paramTask = req.params.task;
    

    var myQuery = `UPDATE createtask SET  currentStatus = ?, remarks = ? WHERE taskId = '${id}'`;
    var actionTask = {
        status: req.body.status,
        remarks: req.body.remarks
    }
    if (req.file && req.file.filename) {
        let filePath = req.file.filename;
        const selectQueryForCreate = `SELECT description, initiated_by, timeStamp, date ,  currentStatus FROM createtask WHERE taskId = ?`;
        const historyQuery = `INSERT INTO history (taskId, description, initiated_by, on_date_time, assigned_to, deadline, remarks , current_status, file) VALUES (?,?,?,?,?,?,?,?,?)`;
        
        dbConnection.query(selectQueryForCreate, [id], (err, result1) => {
            console.log("file ID: ", result1);
            dbConnection.query(historyQuery, [id, result1[0].description, result1[0].initiated_by, result1[0].timeStamp, result1[0].assignTo, result1[0].date, actionTask.remarks, actionTask.status, filePath  ], (err, fileResult) => {
                if (err) throw err;
                console.log("file added to file2");
                dbConnection.query(myQuery, [actionTask.status, actionTask.remarks], (err, result2) => {
                    if (err) {
                        console.error("Error updating task:", err);
                        res.status(500).send("Error updating task.");
                        return;
                    }
                    res.redirect(`/organization/${paramOrg}/tasks/${paramTask}`);
                });
            })
        });


    } else {
        const selectQueryForCreate = `SELECT * FROM createtask WHERE taskId = ?`;
        const historyQuery = `INSERT INTO history (taskId, description, initiated_by, on_date_time, assigned_to, deadline, remarks , current_status) VALUES (?,?,?,?,?,?,?,?)`;
        
        dbConnection.query(selectQueryForCreate, [id], (err, result1) => {
            console.log("file ID: ", result1);
            dbConnection.query(historyQuery, [id, result1[0].description, result1[0].initiated_by, result1[0].timeStamp, result1[0].assignTo, result1[0].date, actionTask.remarks, actionTask.status  ], (err, fileResult) => {
                if (err) throw err;
                console.log("file added to file2");
                dbConnection.query(myQuery, [actionTask.status, actionTask.remarks], (err, result2) => {
                    if (err) {
                        console.error("Error updating task:", err);
                        res.status(500).send("Error updating task.");
                        return;
                    }
                    res.redirect(`/organization/${paramOrg}/tasks/${paramTask}`);
                });
            })
        });
    }


});


app.get("/organization/:organization/tasks/:task/history/:history", isLoggedIn, (req, res) => {
    const historyParam = req.params.history;
    let parts = historyParam.split("-");
    let id = parts[1];
    // const myQuery = `SELECT * FROM createtask`;
    const historyQuery = `SELECT * FROM history WHERE taskId = ?`
    const user = req.user;
    dbConnection.query(historyQuery, [id], (err, result) => {

        res.render("history", { title: "History", result: result, name: user.name, image: user.imagePath });
    });
})

app.get("/login", (req, res) => {
    res.render("login", { title: "Login" });
})

server.listen(3000, () => {
    console.log("server runing");

});