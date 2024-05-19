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

        });
    });

    socket.on("organization Data from user", (data) => {
        const depQuery = `SELECT * FROM department WHERE depOrg = '${data}'`
        dbConnection.query(depQuery, (err, results, fields) => {
            socket.emit("department data to user", results);
        });
    });

    socket.on("data from assign task", (data) => {
        const userQuery = `SELECT * FROM user WHERE department = '${data}'`
        dbConnection.query(userQuery, (err, result) => {
            socket.emit("data to assign task", result);
        });
    });
    socket.on("assign task user", (data) => {
        console.log("user name and Email", data);
        let splitNameAndEmail = data.split(":");
        let userName = splitNameAndEmail[0];
        let userEmail = splitNameAndEmail[1];
        const userQuery = `SELECT * FROM user WHERE email = ?`;
        dbConnection.query(userQuery, [userEmail], (err, userData)=>{
            if(err) throw err;
            socket.emit("user data to assign task", userData);
        })
    })

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
    let query = ``;
    let NoOfTaskToDashboard = ``
    if (user.role === "CEO") {
        query = `SELECT * FROM organization`;
        NoOfTaskToDashboard = `SELECT taskId, organization FROM createtask`
    } else if (user.role === "Director") {
        query = `SELECT * FROM organization WHERE orgTitle = '${user.organization}'`;
        NoOfTaskToDashboard = `SELECT taskId, organization FROM createtask WHERE organization = '${user.organization}' `

    } else {
        query = `SELECT * FROM organization WHERE orgTitle = '${user.organization}'`;
        NoOfTaskToDashboard = `SELECT taskId, organization FROM createtask WHERE organization = '${user.organization}' AND email = '${user.email}'`
    }
    dbConnection.query(query, (err, result) => {
        dbConnection.query(NoOfTaskToDashboard, (err, result2) => {
            console.log(result2);
            res.render("dashboard", { title: "Dashboard", organizations: result, userAccessibilty: user.role, name: user.name, image: user.imagePath, result2: result2, userRole: user.role });
        })
    })
    console.log(user);
});

app.get("/specificOrg/:organiztion", isLoggedIn, (req, res) => {
    const user = req.user;
    const param = req.params.organiztion;
    let orgDashboardQuery = ``
    if (user.role === "CEO") {
        orgDashboardQuery = `SELECT * FROM createtask WHERE organization = '${param}'`

    } else {

        orgDashboardQuery = `SELECT * FROM createtask WHERE organization = '${param}' AND email = '${user.email}'`
    }

    dbConnection.query(orgDashboardQuery, (err, results) => {
        res.render("specific_org", { title: param, name: user.name, image: user.imagePath, user: user, results, userRole: user.role });

    });
});

app.get("/organization/:organization/tasks/:status", isLoggedIn, (req, res) => {
    const paramStatus = req.params.status;
    const paramOrg = req.params.organization
    const user = req.user;
    var query = ``;
    console.log("Loged User: ", user);
    if (paramStatus === "tasks-created-by-ceo") {
        if (user.role === "CEO") {
            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND initiated_by = 'CEO'`;
        } else {
            query = `SELECT * FROM createtask WHERE organization = '${paramOrg}' AND email = '${user.email}' AND initiated_by = 'CEO'`;
        }

    } else if (paramStatus === "completed-tasks") {
        if (user.role === "CEO") {

            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'Complete'`;
        } else {
            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'Complete' AND email = '${user.email}'`;

        }
    } else if (paramStatus === "created-tasks") {
        if (user.role === "CEO") {
            query = `SELECT * FROM createtask WHERE organization = '${paramOrg}'`;

        } else {
            query = `SELECT * FROM createtask WHERE organization = '${paramOrg}' AND email = '${user.email}'`;

        }
    } else if (paramStatus === "in-process-tasks") {
        if (user.role === "CEO") {

            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'In Process'`;
        } else {
            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'In Process' AND email = '${user.email}'`;

        }
    }  else if (paramStatus === "task-not-in-process-tasks") {
        if (user.role === "CEO") {

            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus <> 'In Process'`;
        } else {
            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus <> 'In Process' AND email = '${user.email}'`;

        }
    } else if (paramStatus === "delayed-tasks") {
        if (user.role === "CEO") {
            query = `SELECT * FROM createtask WHERE date < CURDATE() AND organization = '${paramOrg}' `;

        } else {
            query = `SELECT * FROM createtask WHERE date < CURDATE() AND organization = '${paramOrg}' AND email = '${user.email}'`;

        }
    } else if (paramStatus === "tota-urgent-task") {
        if (user.role === "CEO") {
            query = `SELECT * FROM createtask WHERE taskType = 'Urgent' AND organization = '${paramOrg}' `;

        } else {
            query = `SELECT * FROM createtask WHERE taskType = 'Urgent' AND organization = '${paramOrg}' AND email = '${user.email}'`;

        }
    }
    dbConnection.query(query, (err, results) => {
        console.log("Result From create Task: ", results);
        const taskId = results.map(result => result.taskId);
        const taskIdString = taskId.join(',');
        // const historyQuery = taskIdString ? `SELECT taskId, file FROM history WHERE taskId IN (${taskIdString})` : '';

        const historyQuery = `SELECT taskId, file FROM history WHERE taskId IN (${taskIdString})`;
        if (taskIdString) {

            dbConnection.query(historyQuery, (err, filesFromHistory) => {
                if (err) throw err
                console.log("From History Table", filesFromHistory);
                res.render("createdTask", { title: paramStatus, paramOrg: paramOrg, results: results, name: user.name, image: user.imagePath, file: filesFromHistory, userRole: user.role });
            });
        } else {
            res.render("createdTask", { title: paramStatus, paramOrg: paramOrg, results: results, name: user.name, image: user.imagePath, userRole: user.role });
        }
    });
});


// designation rout

app.get("/add_designation", isLoggedIn, (req, res) => {
    const user = req.user;
    const requestDesignation = `SELECT * FROM designation`;
    // console.log(req.user);
    dbConnection.query(requestDesignation, (err, results, fields) => {
        if (err) throw err;
        res.render("add_designation", { title: "Add Designation", resultsTo: results, name: user.name, image: user.imagePath, userRole: user.role })
    })

});

app.post("/add_designation", (req, res) => {
    const addDesignation = req.body.designation;
    console.log(addDesignation);
    const data = `INSERT INTO designation (desigTitle) VALUES (?)`;
    dbConnection.query(data, [addDesignation], (error, results, fields) => {
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
    const checkRole = req.user.role;
    if (checkRole === "Director" || checkRole === "CEO") {
        const requestRole = `SELECT * FROM role`;

        dbConnection.query(requestRole, (err, results, fields) => {
            if (err) throw err;
            // console.log(results);
            res.render("add_role", { title: "Add Role", resultsTo: results, name: user.name, image: user.imagePath, userRole: user.role })
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

log

// user rout

// This is just a testing code for user route
app.get("/add_user", isLoggedIn, (req, res) => {
    const user = req.user || "";
    const checkRole = req.user.role;
    if (checkRole === "Director" || checkRole === "CEO") {

        const userQuery = `SELECT * FROM user`;
        const roleQuery = `SELECT * FROM role`;
        const desigQuery = `SELECT * FROM designation`;
        const orgQeury = `SELECT * FROM  organization`;
        dbConnection.query(userQuery, (err1, results) => {
            if (err1) throw err1;
            dbConnection.query(roleQuery, (err2, roleData) => {
                if (err2) throw err2;
                dbConnection.query(desigQuery, (err3, desigData) => {
                    if (err3) throw err3;
                    dbConnection.query(orgQeury, (err4, orgData) => {
                        if (err4) throw err4;

                        res.render("add_user", { title: "Add User", userData: results, role: roleData, designation: desigData, organization: orgData, name: user.name || "", image: user.imagePath || "", userRole: user.role });
                    });
                });
            });

        });
    } else {
        res.send("<h1> You dont have permision to this Page </h1>")
    }

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

        var insertData = "INSERT INTO user(designation, role, name, email, mobile, password, organization, department, imagePath)VALUES(?,?,?,?,?,?,?,?,?)";
        var queryArr = [designation, role, name, email, mobile, hashedPassword, organization, department, imgsrc]
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
    const checkRole = req.user.role;
    if (checkRole === "Director" || checkRole === "CEO") {
        const requestOrg = `SELECT * FROM organization`;

        dbConnection.query(requestOrg, (err, results, fields) => {
            if (err) throw err;
            console.log(results);
            res.render("add_organization", { title: "Add Organization", resultsTo: results, name: user.name, image: user.imagePath, userRole: user.role })
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
    const checkRole = req.user.role;
    if (checkRole === "Director" || checkRole === "CEO") {
        const requestOrg = `SELECT orgTitle FROM organization`;
        const requestDepartment = `SELECT * FROM department`;

        dbConnection.query(requestOrg, (err1, resultOrg, fields1) => {
            dbConnection.query(requestDepartment, (err2, resultDep, fields2) => {

                res.render("add_subdepartment", { title: "Add Sub Department", resultOrg: resultOrg, resultDep: resultDep, name: user.name, image: user.imagePath, userRole: user.role });

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
    const parts = param.split("-");
    const id = parts[1];
    const tableName = parts[0];
    // const query = ``
    // if (tableName === "designation") {
    //     query = `SELECT * FROM designation WHERE id = ${id}`;
    // } else if (tableName === "department") {
    //     query = `SELECT * FROM department WHERE depId = ${id}`;
    // } else if (tableName === "organization") {
    //     query = `SELECT * FROM organization WHERE orgId = ${id}`;
    // } else if (tableName === "role") {
    //     query = `SELECT * FROM role WHERE id = ${id}`;
    // }
    // const user = req.user;

    // if(query !== ''){
    //     dbConnection.query(query, (err, result)=>{

    //         res.render("edit", { title: "Edit", name: user.name, image: user.imagePath, userRole: user.role, result: result });
    //     })
    // }
    res.render("edit", { title: "Edit", name: user.name, image: user.imagePath, userRole: user.role });
})


app.post("/edit/:file", (req, res) => {
    const param = req.params.file;
    console.log("post : ", param);

    const tableName = param.split(/[^a-zA-Z]/)[0];
    const id = param.split(/[^0-9]/).pop();
    console.log("table Name: " + tableName, "table Id:" + id);
    const newTitle = req.body.title;
    if (tableName === "designation") {
        var sql = `UPDATE ${tableName} SET desigTitle = '${newTitle}' WHERE id = ${id}`;
    } else if (tableName === "department") {
        var sql = `UPDATE ${tableName} SET depTitle = '${newTitle}' WHERE depId = ${id}`;
    } else if (tableName === "organization") {
        var sql = `UPDATE ${tableName} SET orgTitle = '${newTitle}' WHERE orgId = ${id}`;
    } else if (tableName === "role") {
        var sql = `UPDATE ${tableName} SET title = '${newTitle}' WHERE id = ${id}`;
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
    console.log(user);
    dbConnection.query(myQuery, (err, results, fields) => {

        res.render("create_task", { title: "Create Task", results: results, name: user.name, image: user.imagePath, userRole: user.role });
    })
});

app.post("/create_task", upload.single('filePath'), (req, res) => {
    let image = 'uploads/person.png';
    if (req.file && req.file.filename) {
        image = req.file.filename;
    }
    const deadLine = new Date(req.body.date);
    const localDateForDeadLine = deadLine.toISOString().split('T')[0]; // Format as YYYY-MM-DD

    console.log("Dead Line: ", localDateForDeadLine);
    const user = req.user;
    console.log(req.user);

    const createTask = {
        title: req.body.title,
        description: req.body.description,
        deadline: localDateForDeadLine,
        deadlineTime: req.body.time,
        organization: req.body.organization,
        department: req.body.department,
        assignTo: req.body.assignTo,
        email: req.body.email,
        taskType: req.body.taskType,
        filePath: image
    }
    const currentDate = new Date();
    const localDate = currentDate.toISOString().split('T')[0];
    console.log("Current Date: ", localDate);

    // const fileQuery = `INSERT INTO files (file1) VALUES (?) `;

    const taskQuery = `INSERT INTO createTask(title, description, date, deadline_time ,organization, department, assignTo, email, taskType, initiated_by, currentStatus) VALUES (?,?,?,?,?,?,?,?,?, ?,?)`;

    const historyQueryUsingId = `INSERT INTO history(taskId, description, initiated_by, on_date_time, assigned_to, deadline, current_status, file, deadline_time) VALUES
     (?,?,?,?,?,?,?,?,?)`
    const taskArry = [createTask.title, createTask.description, createTask.deadline, createTask.deadlineTime, createTask.organization, createTask.department, createTask.assignTo, createTask.email, createTask.taskType, user.role, "Just Created"];

    dbConnection.query(taskQuery, taskArry, (err1, results) => {
        if (err1) throw err1
        if (results.insertId) {
            console.log("insertId Exist", results.insertId);
        }
        console.log("insert into createtask table: ", results);
        const historyArray = [results.insertId, createTask.description, user.role, localDate, createTask.assignTo, createTask.deadline, "Just Created", createTask.filePath, createTask.deadlineTime]
        dbConnection.query(historyQueryUsingId, historyArray, (err2, historyResult) => {
            if (err2) throw err2;
            console.log("cheking history query");
            res.redirect(`/create_task`);
        });
    });
});




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
            res.render("assign_task", { title: "Assign_task", paramOrg: paramOrg, paramTask: paramTask, result: result[0], depResult: depResult, name: user.name, image: user.imagePath, userRole: user.role });
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
    let currentDate = new Date()
    // let historyQueryArray = [];
    let assignTask = {
        department: req.body.department,
        userName: userName,
        userEmail: userEmail,
        remarks: req.body.remarks,
        userOrganization: req.body.organizationOfuser,
        userDepartment: req.body.departmentOfUser
    }

    console.log("usr Organization", assignTask.userOrganization);
    let myQuery = `UPDATE createtask SET  organization = ?,  department = ?, assignTo = ?, email = ?, remarks = ? WHERE taskId = ?`;

    if (req.file && req.file.filename) {
        filePath = req.file.filename;
        const selectQueryForCreate = `SELECT description, initiated_by, timeStamp, date ,  currentStatus FROM createtask WHERE taskId = ?`;
        const historyQuery = `INSERT INTO history (taskId, description, initiated_by, on_date_time, assigned_to, deadline, remarks , current_status, file) VALUES (?,?,?,?,?,?,?,?,?)`;

        dbConnection.query(selectQueryForCreate, [id], (err, result1) => {
            const historyQueryArray = [id, result1[0].description, result1[0].initiated_by, currentDate, assignTask.userName, result1[0].date, assignTask.remarks, result1[0].currentStatus, filePath];
            console.log("file ID: ", result1);
            dbConnection.query(historyQuery, historyQueryArray, (err, fileResult) => {
                if (err) throw err;
                console.log("file added to history");
                dbConnection.query(myQuery, [assignTask.userOrganization, assignTask.userDepartment, assignTask.userName, assignTask.userEmail, assignTask.remarks, id], (err, result2) => {
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
        const selectQueryForCreate = `SELECT description, initiated_by, timeStamp, date ,  currentStatus FROM createtask WHERE taskId = ?`;
        const historyQuery = `INSERT INTO history (taskId, description, initiated_by, on_date_time, assigned_to, deadline, remarks , current_status) VALUES (?,?,?,?,?,?,?,?)`;

        dbConnection.query(selectQueryForCreate, [id], (err, result1) => {
            const historyQueryArray = [id, result1[0].description, result1[0].initiated_by, currentDate, assignTask.userName, result1[0].date, assignTask.remarks, result1[0].currentStatus];
            console.log("file ID: ", result1);
            dbConnection.query(historyQuery, historyQueryArray, (err, fileResult) => {
                if (err) throw err;
                console.log("file added to history");
                dbConnection.query(myQuery, [assignTask.userOrganization, assignTask.userDepartment, assignTask.userName, assignTask.userEmail, assignTask.remarks, id], (err, result2) => {
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
        res.render("action", { title: "Action", paramOrg: paramOrg, paramTask: paramTask, result: paramStatus, name: user.name, image: user.imagePath, userRole: user.role });
    })
});

app.post("/organization/:organization/tasks/:task/action/:status", upload.single('actionTaskFile'), (req, res) => {
    let param = req.params.status;
    let parts = param.split("-");
    let id = parts[1].trim();
    console.log("parameter from post request :" + param);

    const paramOrg = req.params.organization;
    const paramTask = req.params.task;

    const currentDate = new Date();
    var myQuery = `UPDATE createtask SET  currentStatus = ?, remarks = ? WHERE taskId = '${id}'`;
    var actionTask = {
        status: req.body.status,
        remarks: req.body.remarks
    }
    if (req.file && req.file.filename) {
        let filePath = req.file.filename;
        const selectQueryForCreate = `SELECT description, initiated_by, assignTo ,timeStamp, date ,  currentStatus, deadline_time FROM createtask WHERE taskId = ?`;
        const historyQuery = `INSERT INTO history (taskId, description, initiated_by, on_date_time, assigned_to, deadline, remarks , current_status ,file, deadline_time) VALUES (?,?,?,?,?,?,?,?,?,?)`;

        dbConnection.query(selectQueryForCreate, [id], (err, result1) => {
            console.log("file ID: ", result1);
            dbConnection.query(historyQuery, [id, result1[0].description, result1[0].initiated_by, currentDate, result1[0].assignTo, result1[0].date, actionTask.remarks, actionTask.status, filePath, result1[0].deadline_time], (err, fileResult) => {
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
            dbConnection.query(historyQuery, [id, result1[0].description, result1[0].initiated_by, currentDate, result1[0].assignTo, result1[0].date, actionTask.remarks, actionTask.status], (err, fileResult) => {
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

        res.render("history", { title: "History", result: result, name: user.name, image: user.imagePath , userRole: user.role});
    });
})

app.get("/login", (req, res) => {
    res.render("login", { title: "Login" });
})

server.listen(3000, () => {
    console.log("server runing");

});