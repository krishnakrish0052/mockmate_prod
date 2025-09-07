const { exec } = require('child_process');
const path = require('path');

console.log('Starting remote database restoration process...');

// Database credentials
const DB_HOST = '199.192.27.155';
const DB_USER = 'mockmate_user';
const DB_PASSWORD = 'mockmate_2024!';
const DB_NAME = 'mockmate_db';
const BACKUP_FILE = 'local_mockmate_backup.sql';

// Set environment variable for password
process.env.PGPASSWORD = DB_PASSWORD;

// PostgreSQL executable paths
const PSQL_PATH = '"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"';

function executeCommand(command, description) {
    return new Promise((resolve, reject) => {
        console.log(`\n${description}...`);
        console.log(`Command: ${command}`);
        
        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (stdout) console.log('STDOUT:', stdout);
            if (stderr) console.log('STDERR:', stderr);
            
            if (error && !stdout.includes('database "mockmate_db" does not exist')) {
                console.error(`Error: ${error.message}`);
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

async function restoreDatabase() {
    try {
        // Step 1: Try to create database using mockmate_user
        // (This might fail if user doesn't have CREATEDB privilege, but that's okay)
        try {
            await executeCommand(
                `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"`,
                'Creating database'
            );
            console.log('✅ Database created successfully');
        } catch (error) {
            console.log('⚠️  Database creation failed, but continuing with restoration...');
            
            // Try creating database with template0 to avoid encoding issues
            try {
                await executeCommand(
                    `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d postgres -c "CREATE DATABASE ${DB_NAME} WITH TEMPLATE template0 OWNER ${DB_USER};"`,
                    'Creating database with template0'
                );
                console.log('✅ Database created with template0');
            } catch (error2) {
                console.log('⚠️  Database creation still failed, will try restoration anyway...');
            }
        }

        // Step 2: Restore the backup
        await executeCommand(
            `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -f ${BACKUP_FILE}`,
            'Restoring database from backup'
        );
        
        console.log('✅ Database restoration completed');

        // Step 3: Verify restoration by checking if key tables exist
        const result = await executeCommand(
            `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "\\dt"`,
            'Verifying table restoration'
        );
        
        if (result.stdout.includes('users') && result.stdout.includes('system_config')) {
            console.log('✅ Key tables found - restoration successful');
        } else {
            console.log('⚠️  Some tables might be missing');
        }

    } catch (error) {
        console.error('❌ Restoration failed:', error.message);
        process.exit(1);
    }
}

restoreDatabase();
