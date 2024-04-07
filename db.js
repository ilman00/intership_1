const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL server: ', err);
        return;
    }
    console.log('Connected to MySQL server');

    connection.query('CREATE DATABASE IF NOT EXISTS pedoDB', (error) => {
        if (error) {
            console.error('Error creating database: ', error);
            return;
        }
        console.log('Database created or already exists');
        // Now that the database exists (or was already there), connect to it
        connection.end(); // Close the connection to the MySQL server

        // Connect to the specific database
        const dbConnection = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'root',
            database: 'pedoDB'
        });

        // Export the connection to be used in other modules
        module.exports = dbConnection;

        // Perform other operations with the database
    });
});
