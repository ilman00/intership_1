const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'pedoDB' // Specify the database name here
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL server: ', err);
        return;
    }
    console.log('Connected to MySQL server');
});

// Export the connection to be used in other modules
module.exports = connection;
