#!/bin/bash

# Check users table structure
echo "=== USERS TABLE STRUCTURE ==="
psql -U mockmate_user -d mockmate_db -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;"

echo -e "\n=== CHECK IF NAME COLUMN EXISTS ==="
psql -U mockmate_user -d mockmate_db -c "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'name');"

echo -e "\n=== SAMPLE DATA FROM USERS TABLE ==="
psql -U mockmate_user -d mockmate_db -c "SELECT id, email, first_name, last_name FROM users LIMIT 5;"
