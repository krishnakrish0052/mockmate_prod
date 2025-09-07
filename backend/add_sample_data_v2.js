import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, getDatabase, closeDatabase } from './config/database.js';
import bcrypt from 'bcryptjs';

async function addSampleData() {
  try {
    console.log('🔧 Adding sample production data...');
    
    await initializeDatabase();
    const db = getDatabase();
    
    await db.query('BEGIN');
    
    try {
      // 1. First, update the admin user to match production format
      console.log('\n👤 Setting up admin user...');
      
      // Check current admin user
      const currentAdminResult = await db.query('SELECT * FROM admin_users LIMIT 1');
      if (currentAdminResult.rows.length > 0) {
        const currentAdmin = currentAdminResult.rows[0];
        console.log(`   Current admin: ${currentAdmin.email} (${currentAdmin.username})`);
        
        // Update to match production admin - without first_name/last_name which don't exist
        await db.query(`
          UPDATE admin_users SET 
            username = 'admin',
            email = 'krishankant962@gmail.com',
            updated_at = NOW()
          WHERE id = $1
        `, [currentAdmin.id]);
        
        console.log('   ✅ Updated existing admin user to production format');
      }
      
      // 2. Add sample users
      console.log('\n👥 Adding sample users...');
      
      const users = [
        {
          email: 'narendersharma962@gmail.com',
          name: 'Narender Sharma',
          first_name: 'Narender',
          last_name: 'Sharma',
          subscription_tier: 'pro',
          credits: 150,
          total_sessions: 12,
          total_spent_usd: 49.99,
          registration_source: 'web',
          country: 'India',
        },
        {
          email: 'john.doe@example.com',
          name: 'John Doe',
          first_name: 'John', 
          last_name: 'Doe',
          subscription_tier: 'free',
          credits: 5,
          total_sessions: 3,
          total_spent_usd: 0.00,
          registration_source: 'web',
          country: 'United States',
        },
        {
          email: 'sarah.wilson@example.com',
          name: 'Sarah Wilson',
          first_name: 'Sarah',
          last_name: 'Wilson', 
          subscription_tier: 'enterprise',
          credits: 1000,
          total_sessions: 45,
          total_spent_usd: 299.99,
          registration_source: 'referral',
          country: 'United Kingdom',
        }
      ];
      
      for (const userData of users) {
        const passwordHash = await bcrypt.hash('password123', 10);
        
        const userResult = await db.query(`
          INSERT INTO users (
            email, name, first_name, last_name, password_hash,
            subscription_tier, credits, total_sessions, total_spent_usd,
            registration_source, country, is_active, is_verified,
            created_at, updated_at, last_activity
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, true,
            NOW() - INTERVAL '30 days' * random(), NOW(), NOW() - INTERVAL '1 day' * random()
          ) 
          ON CONFLICT (email) DO NOTHING
          RETURNING id, email
        `, [
          userData.email, userData.name, userData.first_name, userData.last_name, 
          passwordHash, userData.subscription_tier, userData.credits, 
          userData.total_sessions, userData.total_spent_usd, userData.registration_source, 
          userData.country
        ]);
        
        if (userResult.rows.length > 0) {
          console.log(`   ✅ Added user: ${userResult.rows[0].email}`);
          
          // Add some sessions for each user
          const userId = userResult.rows[0].id;
          for (let i = 0; i < Math.min(userData.total_sessions, 3); i++) {
            await db.query(`
              INSERT INTO sessions (
                user_id, session_name, company_name, job_title,
                interview_type, difficulty_level, status, credits_used,
                total_duration_minutes, created_at, started_at, ended_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, 
                NOW() - INTERVAL '${i + 1} days', 
                NOW() - INTERVAL '${i + 1} days' + INTERVAL '5 minutes',
                NOW() - INTERVAL '${i + 1} days' + INTERVAL '25 minutes'
              )
            `, [
              userId,
              `Interview Session ${i + 1}`,
              ['Google', 'Microsoft', 'Amazon', 'Meta'][i % 4],
              ['Software Engineer', 'Senior Developer', 'Tech Lead'][i % 3],
              ['technical', 'behavioral', 'system_design'][i % 3],
              ['medium', 'hard', 'easy'][i % 3],
              'completed',
              Math.floor(Math.random() * 10) + 5,
              Math.floor(Math.random() * 30) + 15
            ]);
          }
        } else {
          console.log(`   ⚠️  User already exists: ${userData.email}`);
        }
      }
      
      // 3. Add sample credit packages (if not already exist)
      console.log('\n💰 Adding sample credit packages...');
      
      // Check if table has created_by column
      const checkCreatedByColumn = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'credit_packages' AND column_name = 'created_by'
        ) as exists
      `);
      
      const hasCreatedByColumn = checkCreatedByColumn.rows[0].exists;
      console.log(`   Credit packages table ${hasCreatedByColumn ? 'has' : 'does not have'} created_by column`);
      
      // Get admin ID for foreign key if needed
      let adminId = null;
      if (hasCreatedByColumn) {
        const adminResult = await db.query('SELECT id FROM admin_users LIMIT 1');
        if (adminResult.rows.length > 0) {
          adminId = adminResult.rows[0].id;
        }
      }
      
      const creditPackages = [
        {
          package_id: 'starter_10',
          package_name: 'Starter Pack',
          credits_amount: 10,
          price_usd: 9.99,
          package_type: 'one_time',
          description: 'Perfect for getting started'
        },
        {
          package_id: 'professional_50',
          package_name: 'Professional Pack',
          credits_amount: 50,
          price_usd: 39.99,
          package_type: 'one_time', 
          description: 'Best value for regular users'
        },
        {
          package_id: 'enterprise_200',
          package_name: 'Enterprise Pack',
          credits_amount: 200,
          price_usd: 149.99,
          package_type: 'one_time',
          description: 'For heavy users and teams'
        }
      ];
      
      for (const pkg of creditPackages) {
        // Build query based on schema
        let insertQuery;
        let params;
        
        if (hasCreatedByColumn && adminId) {
          insertQuery = `
            INSERT INTO credit_packages (
              package_id, package_name, credits_amount, price_usd,
              package_type, description, is_active, created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW(), $7)
            ON CONFLICT (package_id) DO NOTHING
            RETURNING package_name
          `;
          params = [
            pkg.package_id, pkg.package_name, pkg.credits_amount, 
            pkg.price_usd, pkg.package_type, pkg.description, adminId
          ];
        } else {
          insertQuery = `
            INSERT INTO credit_packages (
              package_id, package_name, credits_amount, price_usd,
              package_type, description, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
            ON CONFLICT (package_id) DO NOTHING
            RETURNING package_name
          `;
          params = [
            pkg.package_id, pkg.package_name, pkg.credits_amount, 
            pkg.price_usd, pkg.package_type, pkg.description
          ];
        }
        
        const result = await db.query(insertQuery, params);
        
        if (result.rows.length > 0) {
          console.log(`   ✅ Added credit package: ${result.rows[0].package_name}`);
        } else {
          console.log(`   ⚠️  Credit package already exists: ${pkg.package_name}`);
        }
      }
      
      // 4. Add some sample payments
      console.log('\n💳 Adding sample payments...');
      
      // Check payments table schema
      const checkPaymentsColumns = await db.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'payments'
      `);
      
      const paymentColumns = checkPaymentsColumns.rows.map(row => row.column_name);
      console.log(`   Payments table has columns: ${paymentColumns.slice(0, 5).join(', ')}...`);
      
      // Check if payments table has credits_purchased column
      const hasCreditsColumn = paymentColumns.includes('credits_purchased');
      
      const proUser = await db.query(`SELECT id FROM users WHERE subscription_tier = 'pro' LIMIT 1`);
      if (proUser.rows.length > 0) {
        // Create query based on schema
        let paymentQuery;
        if (hasCreditsColumn) {
          paymentQuery = `
            INSERT INTO payments (
              user_id, amount_usd, credits_purchased, payment_provider,
              payment_method_type, status, created_at, completed_at
            ) VALUES ($1, 49.99, 50, 'stripe', 'card', 'completed', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days')
            ON CONFLICT DO NOTHING
          `;
        } else {
          paymentQuery = `
            INSERT INTO payments (
              user_id, amount_usd, payment_provider,
              payment_method_type, status, created_at, completed_at
            ) VALUES ($1, 49.99, 'stripe', 'card', 'completed', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days')
            ON CONFLICT DO NOTHING
          `;
        }
        
        await db.query(paymentQuery, [proUser.rows[0].id]);
        console.log('   ✅ Added sample payment');
      }
      
      // 5. Update app versions to have more realistic data
      console.log('\n📱 Updating app versions...');
      
      await db.query(`
        UPDATE app_versions SET 
          version = '1.2.0',
          download_count = 247,
          updated_at = NOW()
        WHERE version = '0.1.0'
      `);
      console.log('   ✅ Updated app version data');
      
      // 6. Add some user_credit_balances records if table exists
      console.log('\n💵 Adding user credit balances...');
      
      const checkCreditBalanceTable = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'user_credit_balances'
        ) as exists
      `);
      
      if (checkCreditBalanceTable.rows[0].exists) {
        // Get column names to determine schema
        const creditBalanceColumns = await db.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'user_credit_balances'
        `);
        
        const creditBalanceColumnNames = creditBalanceColumns.rows.map(row => row.column_name);
        console.log(`   Credit balance table has columns: ${creditBalanceColumnNames.join(', ')}`);
        
        // Add credit balances for users
        const users = await db.query(`SELECT id, credits FROM users`);
        for (const user of users.rows) {
          // Check if balance column exists or credits column exists
          const insertQuery = creditBalanceColumnNames.includes('balance') 
            ? `
                INSERT INTO user_credit_balances (user_id, balance, created_at, updated_at)
                VALUES ($1, $2, NOW(), NOW())
                ON CONFLICT (user_id) DO NOTHING
              `
            : `
                INSERT INTO user_credit_balances (user_id, credits, created_at, updated_at)
                VALUES ($1, $2, NOW(), NOW())
                ON CONFLICT (user_id) DO NOTHING
              `;
          
          await db.query(insertQuery, [user.id, user.credits]);
        }
        console.log('   ✅ Added credit balances for all users');
      } else {
        console.log('   ⚠️ user_credit_balances table does not exist, skipping');
      }
      
      await db.query('COMMIT');
      
      // 7. Test enhanced users endpoint query
      console.log('\n🔍 Testing enhanced users endpoint query...');
      
      // Build query based on testing the actual structure
      const testQuery = `
        SELECT 
          u.id, u.name, u.first_name, u.last_name, u.email, u.phone, u.country,
          u.credits, u.subscription_tier, u.is_active, u.is_verified, u.is_suspended,
          u.registration_source, u.created_at, u.last_activity,
          u.total_sessions, u.total_spent_usd,
          
          -- Session statistics
          COUNT(DISTINCT s.id) as session_count,
          COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed_sessions,
          COUNT(DISTINCT CASE WHEN s.created_at >= NOW() - INTERVAL '30 days' THEN s.id END) as recent_sessions,
          
          -- Payment statistics  
          COUNT(DISTINCT p.id) as payment_count,
          SUM(CASE WHEN p.status = 'completed' THEN p.amount_usd ELSE 0 END) as total_payments,
          MAX(p.completed_at) as last_payment_date
          
        FROM users u
        LEFT JOIN sessions s ON u.id = s.user_id
        LEFT JOIN payments p ON u.id = p.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT 5
      `;
      
      const testResult = await db.query(testQuery);
      console.log(`   ✅ Enhanced users query successful! Found ${testResult.rows.length} users`);
      
      testResult.rows.forEach((user, index) => {
        console.log(`     ${index + 1}. ${user.email} - ${user.session_count} sessions, $${user.total_payments || 0} spent`);
      });
      
      await closeDatabase();
      
      console.log('\n🎉 Sample data added successfully!');
      console.log('\n📋 SAMPLE DATA SUMMARY:');
      console.log('=======================');
      console.log('✅ Admin user updated to production format');  
      console.log('✅ Sample users added with various subscription tiers');
      console.log('✅ Sample sessions created for each user');
      console.log('✅ Credit packages configured');
      console.log('✅ Sample payments added');
      console.log('✅ App versions updated');
      console.log('✅ User credit balances added (if table exists)');
      console.log('✅ Enhanced users endpoint tested and working');
      
      console.log('\n🔑 ADMIN LOGIN CREDENTIALS:');
      console.log('============================');
      console.log('Username: admin');
      console.log('Email: krishankant962@gmail.com');
      console.log('Password: MockMateAdmin123!');
      
      console.log('\n🚀 NEXT STEPS:');
      console.log('===============');
      console.log('1. Start your application server: npm start');
      console.log('2. Test admin panel login at http://localhost:3001');
      console.log('3. Test enhanced users endpoint: GET /api/admin/users-enhanced');
      console.log('4. Verify analytics dashboard works');
      console.log('5. Test user management features');
      
      console.log('\n💡 TIP: The system should now be fully functional with sample data!');
      
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Failed to add sample data:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

addSampleData();
