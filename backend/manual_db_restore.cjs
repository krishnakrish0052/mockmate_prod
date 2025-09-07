const { exec } = require('child_process');

console.log('Attempting manual database restoration...');

// Database credentials
const DB_HOST = '199.192.27.155';
const DB_USER = 'mockmate_user';
const DB_PASSWORD = 'mockmate_2024!';

// Set environment variable for password
process.env.PGPASSWORD = DB_PASSWORD;

// PostgreSQL executable paths
const PSQL_PATH = '"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"';

function executeCommand(command) {
    return new Promise((resolve, reject) => {
        console.log(`\nExecuting: ${command}`);
        
        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (stdout) console.log('STDOUT:', stdout);
            if (stderr) console.log('STDERR:', stderr);
            
            resolve({ error, stdout, stderr });
        });
    });
}

async function attemptRestore() {
    // Method 1: Try connecting directly and creating database
    console.log('\n=== Method 1: Direct database creation ===');
    
    const createResult = await executeCommand(
        `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d postgres -c "CREATE DATABASE mockmate_db;"`
    );
    
    if (createResult.error) {
        console.log('❌ Method 1 failed - user lacks CREATEDB privilege');
        
        // Method 2: Check what databases exist and if we can use an alternative name
        console.log('\n=== Method 2: Check existing databases ===');
        
        const listResult = await executeCommand(
            `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d postgres -l`
        );
        
        if (listResult.stdout) {
            console.log('Checking if we can create with different name...');
            
            // Try creating with a different name that might have fewer restrictions
            const altCreateResult = await executeCommand(
                `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d postgres -c "CREATE DATABASE mockmate_db_new;"`
            );
            
            if (altCreateResult.error) {
                console.log('❌ Method 2 also failed');
                
                console.log('\n=== Method 3: Check user privileges ===');
                const privResult = await executeCommand(
                    `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d postgres -c "SELECT rolname, rolsuper, rolcreatedb FROM pg_roles WHERE rolname = '${DB_USER}';"`
                );
                
                console.log('\n🔍 Analysis:');
                console.log('The mockmate_user does not have CREATEDB privileges.');
                console.log('You need to either:');
                console.log('1. Contact your server administrator to create the database');
                console.log('2. Grant CREATEDB privilege to mockmate_user');
                console.log('3. Provide postgres user credentials');
                console.log('\nTo grant CREATEDB privilege, run as postgres user:');
                console.log('ALTER USER mockmate_user CREATEDB;');
                
            } else {
                console.log('✅ Created database with alternative name');
                // Restore to the alternative database
                const restoreResult = await executeCommand(
                    `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d mockmate_db_new -f local_mockmate_backup.sql`
                );
                
                if (!restoreResult.error) {
                    console.log('✅ Successfully restored to mockmate_db_new');
                    console.log('You may need to update your .env file to use mockmate_db_new');
                }
            }
        }
    } else {
        console.log('✅ Database created successfully! Proceeding with restoration...');
        
        // Restore the backup
        const restoreResult = await executeCommand(
            `${PSQL_PATH} -h ${DB_HOST} -U ${DB_USER} -d mockmate_db -f local_mockmate_backup.sql`
        );
        
        if (!restoreResult.error) {
            console.log('✅ Database restoration completed successfully!');
        } else {
            console.log('❌ Database restoration failed');
        }
    }
}

attemptRestore();
