import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function applyMigration() {
    const pool = new Pool({
        host: process.env.DATABASE_HOST,
        port: process.env.DATABASE_PORT,
        database: process.env.DATABASE_NAME,
        user: process.env.DATABASE_USER,
        password: (process.env.DATABASE_PASSWORD || '').toString().trim(),
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
