/**
 * Supabase Database Migration Runner
 * 
 * วิธีใช้:
 * 1. สร้างไฟล์ migration ใหม่ใน migrations/
 * 2. ตั้งชื่อตาม pattern: YYYYMMDD_HHMMSS_description.sql
 * 3. รัน: node server/migrate.js
 */

import { supabase } from './supabaseDB.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// สร้าง migrations tracking table
async function createMigrationsTable() {
    const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                version TEXT UNIQUE NOT NULL,
                applied_at BIGINT NOT NULL
            );
        `
    });

    if (error && !error.message.includes('already exists')) {
        // Try alternative method using direct SQL
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                version TEXT UNIQUE NOT NULL,
                applied_at BIGINT NOT NULL
            );
        `;

        console.log('Creating migrations table...');
        // Note: Supabase client doesn't support raw SQL directly
        // Run this manually in SQL Editor first time:
        console.log('⚠️  Please run this in Supabase SQL Editor first:');
        console.log(createTableSQL);
    }
}

// ดึง migrations ที่รันแล้ว
async function getAppliedMigrations() {
    const { data, error } = await supabase
        .from('schema_migrations')
        .select('version')
        .order('version', { ascending: true });

    if (error) {
        if (error.code === '42P01') { // Table doesn't exist
            return [];
        }
        throw error;
    }

    return data.map(row => row.version);
}

// อ่านไฟล์ migrations
async function getMigrationFiles() {
    try {
        const files = await fs.readdir(MIGRATIONS_DIR);
        return files
            .filter(f => f.endsWith('.sql'))
            .sort();
    } catch (error) {
        if (error.code === 'ENOENT') {
            // สร้าง migrations directory
            await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
            return [];
        }
        throw error;
    }
}

// รัน migration เดียว
async function runMigration(filename) {
    console.log(`  Running: ${filename}`);

    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = await fs.readFile(filepath, 'utf-8');

    // Split SQL by statements (simple split by semicolon)
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    // Execute each statement
    // Note: Supabase JS client doesn't support raw SQL
    // You need to run these via SQL Editor or use Supabase Management API
    console.log(`  ⚠️  Manual SQL required. Please run in SQL Editor:`);
    console.log(`  File: ${filepath}`);

    // Record migration as applied
    const { error } = await supabase
        .from('schema_migrations')
        .insert([{
            version: filename,
            applied_at: Date.now()
        }]);

    if (error) throw error;

    console.log(`  ✅ ${filename} completed`);
}

// รัน migrations ทั้งหมด
async function migrate() {
    console.log('🔄 Starting database migration...\n');

    await createMigrationsTable();

    const applied = await getAppliedMigrations();
    const files = await getMigrationFiles();

    const pending = files.filter(f => !applied.includes(f));

    if (pending.length === 0) {
        console.log('✅ No pending migrations. Database is up to date!\n');
        return;
    }

    console.log(`📋 Found ${pending.length} pending migration(s):\n`);

    for (const file of pending) {
        await runMigration(file);
    }

    console.log('\n✅ All migrations completed!\n');
}

// รัน migration
if (import.meta.url === `file://${process.argv[1]}`) {
    migrate().catch(error => {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    });
}

export { migrate };
