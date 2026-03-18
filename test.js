const mysql = require('mysql2/promise');
async function main() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'tirocinio',
        port: 3307
    });
    try {
        const [rows] = await pool.execute(`SELECT 1`);
        console.log("SUCCESS DB CONNECT", rows);
    } catch (e) {
        console.error("DB CONNECT ERROR", e);
    }
    process.exit(0);
}
main();
