import mysql from 'mysql2/promise';

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tirocinio',
    port: parseInt(process.env.DB_PORT || '3307'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export default pool;

export async function query<T>(sql: string, params?: unknown[]): Promise<T> {
    const [results] = await pool.execute(sql, params);
    return results as T;
}
