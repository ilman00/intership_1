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

app.use(bodyParser.json());

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

        myquery = `SELECT * FROM department WHERE depOrg = ? AND showStatus <> 'inactive'`;
        dbConnection.query(myquery, [data],(err, results, fields) => {
            if (err) throw err;
            socket.emit("selectData from server", results);
        });
    });

    socket.on("department Data", (data) => {

        const myQuery = `SELECT * FROM user WHERE organization = ? AND showStatus <> 'inactive'`
        dbConnection.query(myQuery, [data],(err, result, fields) => {
            if (err) throw err;
            socket.emit("user data", result);

        });
    });

    socket.on("organization Data from user", (data) => {
        const depQuery = `SELECT * FROM department WHERE depOrg = ? AND showStatus <> 'inactive'`
        dbConnection.query(depQuery, [data],(err, results, fields) => {
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
        let splitNameAndEmail = data.split(":");
        let userName = splitNameAndEmail[0];
        let userEmail = splitNameAndEmail[1];
        const userQuery = `SELECT * FROM user WHERE email = ?`;
        dbConnection.query(userQuery, [userEmail], (err, userData) => {
            if (err) throw err;
            socket.emit("user data to assign task", userData);
        })
    })

    socket.on("Number Of Entries", (data) => {
        // console.log(data);
        const numbers = parseInt(data)
        const tasksQuery = `SELECT * FROM createtask LIMIT ?`;
        dbConnection.query(tasksQuery, [numbers], (err, result) => {
            if (err) throw err;
            socket.emit("Number of Record from Database", result);
            // console.log(result);
        })
    });

    socket.on("Page Records", (data) => {
        // console.log("data :", data);
        let pageValue = data;


        const offset = (pageValue - 1) * 10;

        const prevReocordQuery = `SELECT * from createtask LIMIT ? OFFSET ?`;
        dbConnection.query(prevReocordQuery, [10, offset], (err, result) => {
            if (err) throw err;

            socket.emit("Next Page Record to Frontend", result);
        });
    });

    // socket.on("Prev Page Rocords", (data) => {
    //     let pageValue = data;

    //     const offset = (pageValue - 1) * 10;

    //     const prevReocordQuery = `SELECT * from createtask LIMIT ? OFFSET ?`;
    //     dbConnection.query(prevReocordQuery, [10, offset], (err, result) => {
    //         if (err) throw err;
    //         console.log(result);
    //         socket.emit("Prev Page Record to Frontend", result);

    //     });
    // });

    socket.on("Search Page Records", (data) => {
        const { searchTerm, pageValue } = data;
        let offset = (pageValue - 1) * 10;
        const query = `SELECT * FROM createtask WHERE title LIKE ? LIMIT ? OFFSET ?`;
        const likePattern = `%${searchTerm}%`;

        dbConnection.query(query, [likePattern, 10, offset], (err, result) => {
            if (err) {
                console.error('Error executing query:', err);
                socket.emit("search data to frontend", []); // Send an empty result set in case of error
                return;
            }
            socket.emit("search data to frontend", result);
        });
    });

    const allowedTable = ["organization", "department", "designation", "user", "createtask"]
    // Here department mean organization
    socket.on("data from server", (data) => {
        if (!allowedTable.includes(data)) {
            console.error("invalid data", data);
            return
        }
        const departmentQuery = `SELECT * FROM ${data} WHERE showStatus = 'inactive'`;
        dbConnection.query(departmentQuery, [data], (err, result) => {
            if (err) throw err;
            if (data === "organization") {

                socket.emit("deparment data to client", result);
            } else if (data === "department") {
                socket.emit("subdepartment data to client", result);

            } else if (data === "designation") {
                socket.emit("designation data to client", result);
            } else if (data === "user") {
                socket.emit("user data to client", result);
            } else if (data === "createtask") {
                socket.emit("tasks data to client", result);
            }
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

app.get("/change-password", isLoggedIn ,(req, res)=>{
    const user = req.user;
    res.render("change_password", {name: user.name, image: user.imagePath, userRole: user.role })
});

app.post("/change-password", (req, res)=>{
    const email = req.body.email;
    const password = req.body.password;

    const findEmail = `SELECT userId , email FROM user WHERE email = ?`;
    dbConnection.query(findEmail, [email], (err1, result1)=>{
        if(err1) throw err1;
        if(result1.length == 0){
            res.send("email not found")
        }else{
            bcrypt.hash(password, 10)
            .then(hashPassword => {
                console.log("hashed password", hashPassword);
    
                const updatePassword = `UPDATE user SET password = ? WHERE email = ?`;
                dbConnection.query(updatePassword, [hashPassword, email], (err2, result2)=>{
                    res.redirect("/change-password");
                });
            })
            .catch(error => {
                console.error("Error hashing password:", error);
                res.status(500).send("Internal server error.");
            });
        }
    });   
});

app.get("/", isLoggedIn, (req, res) => {
    const user = req.user;
    let query = ``;
    let NoOfTaskToDashboard = ``
    if (user.role === "CEO") {
        query = `SELECT * FROM organization`;
        NoOfTaskToDashboard = `SELECT taskId, organization FROM createtask WHERE showStatus <> "inactive"`;
    } else if (user.role === "Director") {
        query = `SELECT * FROM organization WHERE orgTitle = '${user.organization}'`;
        NoOfTaskToDashboard = `SELECT taskId, organization FROM createtask WHERE organization = '${user.organization}' AND showStatus <> 'inactive'`

    } else {
        query = `SELECT * FROM organization WHERE orgTitle = '${user.organization}'`;
        NoOfTaskToDashboard = `SELECT taskId, organization FROM createtask WHERE organization = '${user.organization}' AND email = '${user.email}' AND showStatus <> 'inactive'`
    }
    dbConnection.query(query, (err, result) => {
        dbConnection.query(NoOfTaskToDashboard, (err, result2) => {
            res.render("dashboard", { title: "Dashboard", organizations: result, userAccessibilty: user.role, name: user.name, image: user.imagePath, result2: result2, userRole: user.role });
        })
    })
});

app.get("/specificOrg/:organiztion", isLoggedIn, (req, res) => {
    const user = req.user;
    const param = req.params.organiztion;
    let orgDashboardQuery = ``
    if (user.role === "CEO") {
        orgDashboardQuery = `SELECT * FROM createtask WHERE organization = '${param}' AND showStatus <> 'inactive'`

    } else {

        orgDashboardQuery = `SELECT * FROM createtask WHERE organization = '${param}' AND email = '${user.email}' AND showStatus <> 'inactive'`
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
    if (paramStatus === "tasks-created-by-ceo") {
        if (user.role === "CEO") {
            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND initiated_by = 'CEO' AND showStatus <> 'inactive'`;
        } else {
            query = `SELECT * FROM createtask WHERE organization = '${paramOrg}' AND email = '${user.email}' AND initiated_by = 'CEO' AND showStatus <> 'inactive'`;
        }

    } else if (paramStatus === "completed-tasks") {
        if (user.role === "CEO") {

            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'Complete' AND showStatus <> 'inactive'`;
        } else {
            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'Complete' AND email = '${user.email}' AND showStatus <> 'inactive'`;

        }
    } else if (paramStatus === "created-tasks") {
        if (user.role === "CEO") {
            query = `SELECT * FROM createtask WHERE organization = '${paramOrg}' AND showStatus <> 'inactive'`;

        } else {
            query = `SELECT * FROM createtask WHERE organization = '${paramOrg}' AND email = '${user.email}' AND showStatus <> 'inactive'`;

        }
    } else if (paramStatus === "in-process-tasks") {
        if (user.role === "CEO") {

            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'In Process' AND showStatus <> 'inactive'`;
        } else {
            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'In Process' AND email = '${user.email}' AND showStatus <> 'inactive'`;

        }
    } else if (paramStatus === "not-in-process-tasks") {
        if (user.role === "CEO") {

            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'Just Created' AND showStatus <> 'inactive'`;
        } else {
            query = `SELECT * FROM createtask  WHERE organization = '${paramOrg}' AND currentStatus = 'Just Created' AND email = '${user.email}' AND showStatus <> 'inactive'`;

        }
    } else if (paramStatus === "delayed-tasks") {
        if (user.role === "CEO") {
            query = `SELECT * FROM createtask WHERE date < CURDATE() AND organization = '${paramOrg}' AND showStatus <> 'inactive'`;

        } else {
            query = `SELECT * FROM createtask WHERE date < CURDATE() AND organization = '${paramOrg}' AND email = '${user.email}' AND showStatus <> 'inactive'`;

        }
    } else if (paramStatus === "tota-urgent-task") {
        if (user.role === "CEO") {
            query = `SELECT * FROM createtask WHERE taskType = 'Urgent' AND organization = '${paramOrg}'  AND showStatus <> 'inactive'`;

        } else {
            query = `SELECT * FROM createtask WHERE taskType = 'Urgent' AND organization = '${paramOrg}' AND email = '${user.email}' AND showStatus <> 'inactive'`;

        }
    }
    dbConnection.query(query, (err, results) => {
        const taskId = results.map(result => result.taskId);
        const taskIdString = taskId.join(',');
        // const historyQuery = taskIdString ? `SELECT taskId, file FROM history WHERE taskId IN (${taskIdString})` : '';

        const historyQuery = `SELECT taskId, file FROM history WHERE taskId IN (${taskIdString})`;
        if (taskIdString) {

            dbConnection.query(historyQuery, (err, filesFromHistory) => {
                if (err) throw err
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
    dbConnection.query(requestDesignation, (err, results, fields) => {
        if (err) throw err;
        res.render("add_designation", { title: "Add Designation", resultsTo: results, name: user.name, image: user.imagePath, userRole: user.role })
    })

});

app.post("/add_designation", (req, res) => {
    const addDesignation = req.body.designation;
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
app.get("/add_user", isLoggedIn, (req, res) => {
    const user = req.user || "";
    const checkRole = req.user.role;
    if (checkRole === "Director" || checkRole === "CEO") {

        const userQuery = `SELECT * FROM user WHERE showStatus <> "inactive"`;
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

        var insertData = "INSERT INTO user(designation, role, name, email, mobile, password, organization, department, imagePath, showStatus)VALUES(?,?,?,?,?,?,?,?,?,?)";
        var queryArr = [designation, role, name, email, mobile, hashedPassword, organization, department, imgsrc, "active"]
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
            res.render("add_organization", { title: "Add Organization", resultsTo: results, name: user.name, image: user.imagePath, userRole: user.role })
        });
    } else {
        res.send("<h1> You dont have permision to this Page </h1>")
    }
});

app.post("/add_organization", upload.single('orgPic'), (req, res) => {
    const addOrg = req.body.org;
    let imagePath = "";
    if (req.file) {

        imagePath = req.file.filename;;
    }
    const data = `INSERT INTO organization (orgTitle, image) VALUES (?, ?)`;
    dbConnection.query(data, [addOrg, imagePath], (error, results, fields) => {
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
        const requestOrg = `SELECT orgTitle, showStatus FROM organization`;
        const requestDepartment = `SELECT * FROM department`;

        dbConnection.query(requestOrg, (err1, resultOrg) => {
            dbConnection.query(requestDepartment, (err2, resultDep) => {

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


app.get("/report", isLoggedIn, (req, res) => {
    const user = req.user;
    const report = `SELECT * from createtask LIMIT 10`;
    dbConnection.query(report, (err, result) => {
        if (err) throw err;
        res.render("report", { name: user.name, image: user.imagePath, userRole: user.role, result: result });
    });
});

app.get("/inactivetasks", isLoggedIn, (req, res) => {
    const user = req.user;

    res.render("inactive-tasks", { name: user.name, image: user.imagePath, userRole: user.role });
});


app.get("/edit/:file", isLoggedIn, (req, res) => {
    const param = req.params.file;
    const parts = param.split("-");
    const id = parts[1];
    const tableName = parts[0];
    const user = req.user;
    let query = ``;
    let titleOfEdited = "";
    if (tableName === "designation") {
        query = `SELECT * FROM designation WHERE id = ${id}`;
    } else if (tableName === "subdepartment") {
        query = `SELECT * FROM department WHERE depId = ${id}`;
    } else if (tableName === "organization") {
        query = `SELECT * FROM organization WHERE orgId = ${id}`;
    } else if (tableName === "role") {
        query = `SELECT * FROM role WHERE id = ${id}`;
    }

    if (query !== '') {
        dbConnection.query(query, (err, result) => {
            if (tableName === "designation") {
                titleOfEdited = result[0].desigTitle;

            } else if (tableName === "subdepartment") {
                titleOfEdited = result[0].depTitle;
            } else if (tableName === "organization") {
                titleOfEdited = result[0].orgTitle;
            } else if (tableName === "role") {
                titleOfEdited = result[0].title;
            }

            res.render("edit", { title: "Edit", name: user.name, image: user.imagePath, userRole: user.role, result: result, titleOfEdited: titleOfEdited });
        })
    }
    // res.render("edit", { title: "Edit", name: user.name, image: user.imagePath, userRole: user.role });
})


app.post("/edit/:file", (req, res) => {
    const param = req.params.file;

    const tableName = param.split(/[^a-zA-Z]/)[0];
    const id = param.split(/[^0-9]/).pop();
    console.log("table Name: " + tableName, "table Id:" + id);
    const newTitle = req.body.title;

    if (tableName === "designation") {
        var sql = `UPDATE designation SET desigTitle = ? WHERE id = ?`;

    } else if (tableName === "subdepartment") {
        var sql = `UPDATE department SET depTitle = ? WHERE depId = ?`;
    } else if (tableName === "organization") {
        var sql = `UPDATE organization SET orgTitle = ? WHERE orgId = ?`;
    } else if (tableName === "role") {
        var sql = `UPDATE role SET title = ? WHERE id = ?`;
    }

    dbConnection.query(sql, [newTitle, id], (err, results) => {
        if (err) throw err;
        res.redirect(`/add_${tableName}`);
    });
});

app.patch("/delete-designation/:deleteFrom/:deleteId", (req, res) => {
    const deleteId = req.params.deleteId;
    const deleteName = req.params.deleteFrom
    let inactiveQuery = ``
    let inactiveUser = ``
    let selectUser = ``

    // if(deleteName === "designation"){

    inactiveQuery = `UPDATE designation SET showStatus = "inactive" WHERE id = ?`;
    inactiveUser = `UPDATE user SET showStatus = 'inactive' WHERE designation = ? `;
    selectUser = `SELECT email FROM user WHERE designation = ?`;
    // }
    dbConnection.query(inactiveQuery, [deleteId], (err1, result) => {
        if (err1) throw err1;
        if (result.affectedRows === 0) {
            res.status(404).send({ error: `Item with ID ${deleteId} not found` });
        } else {
            dbConnection.query(inactiveUser, [deleteName], (err2, result2) => {
                if (err2) throw err2;
                if (result2.affectedRows === 0) {

                    res.status(404).send({ error: `Item with ID ${deleteId} not found` });
                } else {


                    dbConnection.query(selectUser, [deleteName], (err3, result3) => {
                        if (err3) throw err3;
                        const userEmails = result3.map(userEmail => userEmail.email);
                        const emailsString = userEmails.join(",");
                        const tasksQuery = `UPDATE createtask SET showStatus = "inactive" WHERE email IN (?)`;
                        dbConnection.query(tasksQuery, [emailsString], (err4, result4) => {
                            if (err4) throw err4;
                            res.status(200).send({ message: `Item with ID ${deleteId} deleted successfully` });
                        });
                    });
                }
            });

        }
    });
});

app.patch('/delete-organization/:orgName/:id', (req, res) => {
    const { orgName, id } = req.params;

    if (orgName && id) {

        let inactiveQuery = `UPDATE organization SET showStatus = 'inactive' WHERE orgId = ?`;
        let inactiveSubDept = `UPDATE department SET showStatus = 'inactive' WHERE depOrg = ?`
        let inactiveUser = `UPDATE user SET showStatus = 'inactive' WHERE organization = ?`
        let inactiveTasks = `UPDATE createtask SET showStatus = 'inactive' WHERE organization = ?`
        dbConnection.query(inactiveQuery, [id], (err1, result1) => {
            if (err1) throw err1;
            dbConnection.query(inactiveSubDept, [orgName], (err2, result2) => {
                if (err2) throw err2;
                dbConnection.query(inactiveUser, [orgName], (err3, result3) => {
                    if (err3) throw err3;
                    dbConnection.query(inactiveTasks, [orgName], (err4, result4) => {
                        if (err4) throw err4;

                        res.status(200).send({ message: 'Success' });
                    });
                });
            });

        });


    } else {
        res.status(400).send({ error: 'Missing parameters' });
    }
});

app.patch("/delete-subdepartment/:deptName/:id", (req, res) => {
    const { deptName, id } = req.params;

    if (deptName && id) {
        const inactiveSubDept = `UPDATE department SET showStatus = 'inactive' WHERE depId = ?`;
        dbConnection.query(inactiveSubDept, [id], (err1, result1) => {
            if (err1) throw err1;
            res.status(200).send({ message: 'Success' });
        })
    } else {
        res.status(400).send({ error: 'Missing parameters' });
    }
});

app.patch("/undo-organization/:id", (req, res) => {
    const id = req.params.id;
    if (orgName && id) {
        const undoQuery = `UPDATE createtask SET showStatus = 'active' WHERE id = ?`
        dbConnection.query(undoQuery, [id], (err, result) => {
            if (err) throw err;
            res.status(200).send({ message: "successfully Activeted the Task" })
        })
    } else {
        res.status(400).send({ error: 'Missing parameters' });
    }
});

app.delete("/permanent-delete", (req, res) => {
    const { name, id } = req.body;
    const allowedTable = ["organization", "department", "designation", "user", "createtask"];
    let deleteQuery = ``;
    if (!allowedTable.includes(name)) {
        res.json({ success: false }); // Send response for disallowed table
        return;
    }

    if(name === "organization"){
        
        deleteQuery = `DELETE FROM ${name} WHERE orgId = ?`;
    }else if(name === "department"){
        deleteQuery = `DELETE FROM ${name} WHERE depId = ?`;
    }else if(name === "designation"){
        deleteQuery = `DELETE FROM ${name} WHERE id = ?`;
    }else if(name === "user"){
        deleteQuery = `DELETE FROM ${name} WHERE userId = ?`;
    }else if(name === "createtask"){
        deleteQuery = `DELETE FROM ${name} WHERE taskId = ?`;
    }

    dbConnection.query(deleteQuery, [id], (err, result) => {
        if (err) {
            console.error("Error executing query:", err);
            res.json({ success: false }); 
        } else {
            res.json({ success: true }); 
        }
    });
});

app.patch("/restore-record", (req, res)=>{
    const { name, id } = req.body;
    const allowedTable = ["organization", "department", "designation", "user", "createtask"];
    let restoreQuery = ``;
    if (!allowedTable.includes(name)) {
        res.json({ success: false }); 
        return;
    }

    if(name === "organization"){
        
        restoreQuery = `UPDATE ${name} SET showStatus = 'active' WHERE orgId = ?`;
    }else if(name === "department"){
        restoreQuery = `UPDATE ${name} SET showStatus = 'active' WHERE depId = ?`;
    }else if(name === "designation"){
        restoreQuery = `UPDATE ${name} SET showStatus = 'active' WHERE id = ?`;
    }else if(name === "user"){
        restoreQuery = `UPDATE ${name} SET showStatus = 'active' WHERE userId = ?`;
    }else if(name === "createtask"){
        restoreQuery = `UPDATE ${name} SET showStatus = 'active' WHERE taskId = ?`;
    }

    dbConnection.query(restoreQuery, [id], (err, result) => {
        if (err) {
            
            console.error("Error executing query:", err);
            res.json({ success: false }); 
        } else {
            res.json({ success: true }); 
        }
    });
});


app.get("/create_task", isLoggedIn, (req, res) => {
    const myQuery = `SELECT * FROM organization`;
    const user = req.user;
    dbConnection.query(myQuery, (err, results, fields) => {

        res.render("create_task", { title: "Create Task", results: results, name: user.name, image: user.imagePath, userRole: user.role });
    });
});

app.post("/create_task", upload.single('filePath'), (req, res) => {
    let image = 'uploads/person.png';
    if (req.file && req.file.filename) {
        image = req.file.filename;
    }
    const deadLine = new Date(req.body.date);
    const localDateForDeadLine = deadLine.toISOString().split('T')[0]; // Format as YYYY-MM-DD

    const user = req.user;

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

    // const fileQuery = `INSERT INTO files (file1) VALUES (?) `;

    const taskQuery = `INSERT INTO createTask(title, description, date, deadline_time ,organization, department, assignTo, email, taskType, initiated_by, currentStatus, showStatus) VALUES (?,?,?,?,?,?,?,?,?, ?,?,?)`;

    const historyQueryUsingId = `INSERT INTO history(taskId, description, initiated_by, on_date_time, assigned_to, deadline, current_status, file, deadline_time) VALUES
     (?,?,?,?,?,?,?,?,?)`
    const taskArry = [createTask.title, createTask.description, createTask.deadline, createTask.deadlineTime, createTask.organization, createTask.department, createTask.assignTo, createTask.email, createTask.taskType, user.role, "Just Created", "active"];

    dbConnection.query(taskQuery, taskArry, (err1, results) => {
        if (err1) throw err1
        if (results.insertId) {
        }
        const historyArray = [results.insertId, createTask.description, user.role, localDate, createTask.assignTo, createTask.deadline, "Just Created", createTask.filePath, createTask.deadlineTime]
        dbConnection.query(historyQueryUsingId, historyArray, (err2, historyResult) => {
            if (err2) throw err2;
            res.redirect(`/create_task`);
        });
    });
});




app.get("/organization/:organization/tasks/:task/assign_task/:user", isLoggedIn, (req, res) => {
    const user = req.user;
    let param = req.params.user;
    let parts = param.split("-");
    let id = parts[1];
    const paramOrg = req.params.organization;
    const paramTask = req.params.task;
    const myQuery = `SELECT * FROM createtask WHERE taskId = ${id}`;
    const depQuery = `SELECT * FROM department`;
    dbConnection.query(myQuery, (err1, result) => {
        if(err1) throw err1
        dbConnection.query(depQuery, (err2, depResult) => {
            if(err2) throw err2
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

    let myQuery = `UPDATE createtask SET  organization = ?,  department = ?, assignTo = ?, email = ?, remarks = ? WHERE taskId = ?`;

    if (req.file && req.file.filename) {
        filePath = req.file.filename;
        const selectQueryForCreate = `SELECT description, initiated_by, timeStamp, date ,  currentStatus FROM createtask WHERE taskId = ?`;
        const historyQuery = `INSERT INTO history (taskId, description, initiated_by, on_date_time, assigned_to, deadline, remarks , current_status, file) VALUES (?,?,?,?,?,?,?,?,?)`;

        dbConnection.query(selectQueryForCreate, [id], (err, result1) => {
            const historyQueryArray = [id, result1[0].description, result1[0].initiated_by, currentDate, assignTask.userName, result1[0].date, assignTask.remarks, result1[0].currentStatus, filePath];
            dbConnection.query(historyQuery, historyQueryArray, (err, fileResult) => {
                if (err) throw err;
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
            dbConnection.query(historyQuery, historyQueryArray, (err, fileResult) => {
                if (err) throw err;
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
        res.render("action", { title: "Action", paramOrg: paramOrg, paramTask: paramTask, result: paramStatus, name: user.name, image: user.imagePath, userRole: user.role });
    })
});

app.post("/organization/:organization/tasks/:task/action/:status", upload.single('actionTaskFile'), (req, res) => {
    let param = req.params.status;
    let parts = param.split("-");
    let id = parts[1].trim();

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
            dbConnection.query(historyQuery, [id, result1[0].description, result1[0].initiated_by, currentDate, result1[0].assignTo, result1[0].date, actionTask.remarks, actionTask.status, filePath, result1[0].deadline_time], (err, fileResult) => {
                if (err) throw err;
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
            dbConnection.query(historyQuery, [id, result1[0].description, result1[0].initiated_by, currentDate, result1[0].assignTo, result1[0].date, actionTask.remarks, actionTask.status], (err, fileResult) => {
                if (err) throw err;
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

        res.render("history", { title: "History", result: result, name: user.name, image: user.imagePath, userRole: user.role });
    });
})

app.get("/login", (req, res) => {
    res.render("login", { title: "Login" });
})

server.listen(3000, () => {
    console.log("server runing");

});