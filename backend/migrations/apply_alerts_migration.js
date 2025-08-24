import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - try multiple locations
const possibleEnvPaths = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', '..', '.env'),
    '.env',
    '../.env',
    '../../.env'
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
    try {
        if (fs.existsSync(envPath)) {
            console.log(`Loading environment from: ${envPath}`);
            dotenv.config({ path: envPath });
            envLoaded = true;
            break;
        }
    } catch (error) {
        // Continue to next path
    }
}

if (!envLoaded) {
    console.log('No .env file found, trying default dotenv config...');
    dotenv.config();
}

async function applyMigration() {
    // Try multiple environment variable naming conventions
    const dbConfig = {
        host: process.env.DATABASE_HOST || process.env.DB_HOST || process.env.PGHOST || 'localhost',
        port: process.env.DATABASE_PORT || process.env.DB_PORT || process.env.PGPORT || '5432',
        database: process.env.DATABASE_NAME || process.env.DB_NAME || process.env.PGDATABASE,
        user: process.env.DATABASE_USER || process.env.DB_USER || process.env.PGUSER,
        password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || process.env.PGPASSWORD
    };
    
    // Debug environment variables
    console.log('Database connection config:');
    console.log('HOST:', dbConfig.host);
    console.log('PORT:', dbConfig.port);
    console.log('DATABASE:', dbConfig.database);
    console.log('USER:', dbConfig.user);
    console.log('PASSWORD type:', typeof dbConfig.password);
    console.log('PASSWORD length:', dbConfig.password ? dbConfig.password.length : 'undefined');
    
    // Check if we have all required config
    if (!dbConfig.host || !dbConfig.database || !dbConfig.user || !dbConfig.password) {
        console.error('Missing required database configuration!');
        console.error('Available environment variables:');
        console.error('DATABASE_*:', Object.keys(process.env).filter(k => k.startsWith('DATABASE_')));
        console.error('DB_*:', Object.keys(process.env).filter(k => k.startsWith('DB_')));
        console.error('PG*:', Object.keys(process.env).filter(k => k.startsWith('PG')));
        process.exit(1);
    }
    
    const pool = new Pool({
        host: dbConfig.host,
        port: parseInt(dbConfig.port) || 5432,
        database: dbConfig.database,
        user: dbConfig.user,
        password: String(dbConfig.password || '').trim(),
    });

    try {
        // Read the migration SQL file
        const migrationPath = path.join(__dirname, 'create_alerts_system.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        // Clean up the SQL content
        const cleanedSql = sql
            .replace(/We've/g, "We''ve")  // Fix apostrophes in text
            .replace(/\r\n/g, '\n')       // Normalize line endings
            .trim();
        
        // Split SQL into statements, handling multi-line statements and functions
        const statements = [];
        let currentStatement = '';
        let inFunction = false;
        let dollarQuoteTag = null;
        
        const lines = cleanedSql.split('\n');
        
        for (let line of lines) {
            line = line.trim();
            
            // Skip empty lines and comments
            if (!line || line.startsWith('--')) {
                continue;
            }
            
            // Check for dollar-quoted strings (PostgreSQL functions)
            const dollarQuoteMatch = line.match(/\$(\w*)\$/);
            if (dollarQuoteMatch) {
                if (!inFunction) {
                    // Starting a function
                    inFunction = true;
                    dollarQuoteTag = dollarQuoteMatch[1];
                } else if (dollarQuoteTag === dollarQuoteMatch[1]) {
                    // Ending the function
                    inFunction = false;
                    dollarQuoteTag = null;
                }
            }
            
            currentStatement += line + '\n';
            
            // If we're not in a function and the line ends with semicolon, it's a complete statement
            if (!inFunction && line.endsWith(';')) {
                statements.push(currentStatement.trim());
                currentStatement = '';
            }
        }
        
        // Add any remaining statement
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }
        
        console.log(`Found ${statements.length} SQL statements to execute`);
        
        const client = await pool.connect();
        
        try {
            let successCount = 0;
            let skippedCount = 0;
            
            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i];
                
                if (!statement || statement.length === 0) {
                    continue;
                }
                
                try {
                    console.log(`Executing statement ${i + 1}/${statements.length}...`);
                    await client.query(statement);
                    successCount++;
                    console.log(`✓ Statement ${i + 1} executed successfully`);
                } catch (error) {
                    // Check if error is due to object already existing
                    if (error.code === '42P07' ||  // relation already exists
                        error.code === '42710' ||  // duplicate object
                        error.code === '42723' ||  // duplicate function
                        error.code === '42P06' ||  // duplicate schema
                        error.code === '42P16' ||  // invalid table name
                        error.message.includes('already exists') ||
                        error.message.includes('duplicate')) {
                        console.log(`⚠ Statement ${i + 1} skipped (object already exists): ${error.message}`);
                        skippedCount++;
                    } else {
                        console.error(`✗ Error executing statement ${i + 1}:`, error.message);
                        console.error('Statement:', statement.substring(0, 200) + '...');
                        throw error;
                    }
                }
            }
            
            console.log(`\nMigration completed successfully!`);
            console.log(`- ${successCount} statements executed`);
            console.log(`- ${skippedCount} statements skipped (already existed)`);
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the migration
applyMigration();
