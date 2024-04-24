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
        dbConnection.query('SELECT * FROM user WHERE email = ?', [username], async (err, results)=> {
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
  function(req, res) {
    console.log("User authenticated successfully");
    console.log("In Login : ",req.session.redirectTo);
    res.redirect(req.session.redirectTo || "/" );
    
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


app.get("/", isLoggedIn, (req, res)=>{
    const user = req.user;
    const userDesig = req.user.designation;
    console.log(user);
    res.render("dashboard", {title: "Dashboard", userAccessibilty: userDesig, name: user.name, image: user.imagePath});
});



// designation rout
app.get("/add_designation", isLoggedIn, (req, res) => {
    const user = req.user;
    const requestDesignation = `SELECT * FROM designation`;
    // console.log(req.user);
    dbConnection.query(requestDesignation, (err, results, fields) => {
        if (err) throw err;
        res.render("add_designation", { title: "Add Designation", resultsTo: results, name: user.name, image: user.imagePath})
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
            res.render("add_role", { title: "Add Role", resultsTo: results, name: user.name, image: user.imagePath})
        });
    } else {
        res.send("<h1> You dont have permision to this Page </h1>")
    }



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
}else{
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
    res.render("edit", { title: "Edit", name: user.name, image: user.imagePath});
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
        res.redirect("/createdTask");
    });
});

// created Tasks
app.get("/createdTask", isLoggedIn, (req, res) => {

    const logedInUser = req.user;


    let myQuery = ``;
    if(logedInUser.designation === "CEO"){
        myQuery = `SELECT * FROM createtask`;
    }else if(logedInUser.designation === "Director"){
        myQuery = `SELECT * FROM createtask WHERE organization = '${logedInUser.organization}'`
    }else if(logedInUser.designation === "Staff") {
        myQuery = `SELECT * FROM createtask WHERE email = '${logedInUser.email}'`;
    }
    dbConnection.query(myQuery, (err, results, fields) => {
        res.render("createdTask", { title: "Created Tasks", results: results, name: logedInUser.name, image: logedInUser.imagePath });
    });

});




// assign_task

app.get("/assign_task/:user", isLoggedIn,  (req, res) => {
    const user = req.user;
    let param = req.params.user;
    let parts = param.split("-");
    let id = parts[1].trim();
    console.log("id: ", id);
    const myQuery = `SELECT * FROM createtask WHERE taskId = ${id}`;
    const depQuery = `SELECT * FROM department`;
    dbConnection.query(myQuery, (err, result) => {
        dbConnection.query(depQuery, (err, depResult) => {
            res.render("assign_task", { title: "Assign_task", result: result[0], depResult: depResult, name: user.name, image: user.imagePath });
        });
    });
});

app.post("/assign_task/:user", upload.single('assignTaskImage'), (req, res) => {
    let param = req.params.user;
    let parts = param.split("-");
    let id = parts[1].trim();

    let filePath = "no file chosen";
    if (req.file && req.file.filename) {
        filePath = req.file.filename;
    }

    const assignTask = {
        department: req.body.department,
        user: req.body.user,
        remarks: req.body.remarks,
        imagePath: filePath
    };

    const myQuery = `UPDATE createtask SET assignTo = ?, imagePath = ?, remarks = ? WHERE taskId = ?`;
    dbConnection.query(myQuery, [assignTask.user, assignTask.imagePath, assignTask.remarks, id], (err, result) => {
        if (err) {
            // Handle error
            console.error("Error updating task:", err);
            res.status(500).send("Error updating task.");
            return;
        }
        res.redirect("/createdTask");
    });
});

app.get("/action/:status", isLoggedIn, (req, res) => {
    const user = req.user;
    let param = req.params.status;
    let parts = param.split("-");
    let id = parts[1].trim();

    let file = "";
    if (req.file && req.file.fieldname) {
        file = req.file.filename;
    }
    const query = `SELECT * FROM createtask WHERE taskId = ${id}`;

    dbConnection.query(query, (err, result) => {
        if (err) throw err
        console.log(result[0]);
        res.render("action", { title: "Action", result: param, name: user.name, image: user.imagePath });
    })
});

app.post("/action/:status", upload.single('actionTaskFile'), (req, res) => {
    let param = req.params.status;
    let parts = param.split("-");
    let id = parts[1].trim();
    console.log("parameter from post request :" + param);

    let filePath = "";
    if (req.file && req.file.filename) {
        filePath = req.file.filename;
    }
    const actionTask = {
        status: req.body.status,
        remarks: req.body.remarks,
        file: filePath
    }

    const myQuery = `UPDATE createtask SET  currentStatus = ?, remarks = ?, imagePath = ? WHERE taskId = ?`;

    dbConnection.query(myQuery, [actionTask.status, actionTask.remarks, actionTask.file, id], (err, result) => {
        if (err) throw err
        res.redirect("/createdTask");
    });
});


app.get("/history", isLoggedIn, (req, res) => {
    const myQuery = `SELECT * FROM createtask`;
    const user = req.user;
    dbConnection.query(myQuery, (err, result)=>{

        res.render("history", { title: "History", result: result, name: user.name, image: user.imagePath });
    });
})

app.get("/login", (req, res) => {
    res.render("login", { title: "Login" });
})

server.listen(3000, () => {
    console.log("server runing");

});