# 📦 Database Migration System

## เกี่ยวกับ Migration System

ระบบ migration นี้ช่วยให้คุณจัดการการเปลี่ยนแปลง database schema ได้อย่างมีระเบียบ โดยเก็บประวัติการเปลี่ยนแปลงทั้งหมดไว้ในไฟล์ SQL

## 🚀 วิธีใช้งาน

### 1. สร้าง Migration ใหม่

สร้างไฟล์ใหม่ใน `server/migrations/` ตามรูปแบบนี้:

```
YYYYMMDD_HHMMSS_description.sql
```

ตัวอย่าง:
```
20251121_120000_add_user_profiles.sql
20251122_093000_add_file_uploads.sql
```

### 2. เขียน SQL Migration

เปิดไฟล์ที่สร้างและเขียน SQL สำหรับการเปลี่ยนแปลง:

```sql
-- เพิ่ม table ใหม่
CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at BIGINT NOT NULL
);

-- เพิ่ม index
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);

-- เพิ่ม column ใน table เดิม
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id TEXT;
```

### 3. รัน Migration

#### วิธีที่ 1: Manual (แนะนำสำหรับตอนนี้)

1. เปิด [Supabase SQL Editor](https://supabase.com/dashboard/project/uuohbvezhyosxpwxnunl/sql)
2. คัดลอก SQL จากไฟล์ migration
3. Paste และกด **Run**

#### วิธีที่ 2: Auto (สำหรับอนาคต)

```bash
node server/migrate.js
```

**หมายเหตุ**: ปัจจุบัน Supabase JS Client ไม่รองรับการรัน raw SQL โดยตรง จึงต้องรัน manual ครั้งแรก

## 📁 โครงสร้างไฟล์

```
server/
├── migrations/
│   ├── 20251121_000000_initial_schema.sql
│   ├── 20251121_010000_add_uploaded_files.sql.example (ตัวอย่าง)
│   └── ... (migrations อื่นๆ)
├── migrate.js (migration runner)
└── supabaseDB.js (database connection)
```

## 🎯 Best Practices

### 1. ตั้งชื่อให้ชัดเจน
```sql
-- ❌ ไม่ดี
20251121_update.sql

-- ✅ ดี
20251121_120000_add_user_authentication_table.sql
```

### 2. ใช้ IF NOT EXISTS
```sql
-- เสมอใช้ IF NOT EXISTS เพื่อไม่ให้ error ถ้ารันซ้ำ
CREATE TABLE IF NOT EXISTS ...
ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...
CREATE INDEX IF NOT EXISTS ...
```

### 3. เขียน Comment
```sql
-- Add user profiles table
-- This table stores additional user information
CREATE TABLE IF NOT EXISTS user_profiles (
    ...
);
```

### 4. ทดสอบก่อนใช้งานจริง
- ทดสอบ SQL ใน SQL Editor ก่อน
- ตรวจสอบว่าไม่ทำลายข้อมูลเก่า
- สร้าง backup ข้อมูลสำคัญก่อนรัน migration

## 📋 ตัวอย่าง Migration สำหรับอนาคต

### เพิ่ม Uploaded Files Table

ลบ `.example` ออกจากไฟล์นี้เพื่อใช้งาน:
```
server/migrations/20251121_010000_add_uploaded_files.sql.example
```

Migration นี้จะสร้าง:
- ✅ `uploaded_files` table เก็บข้อมูลไฟล์
- ✅ Indexes สำหรับ performance
- ✅ RLS policies
- ✅ Foreign key link กับ messages

### เพิ่ม User Authentication

```sql
-- 20251122_120000_add_user_auth.sql
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
```

## 🔧 Troubleshooting

### Migration ไม่รัน
- ตรวจสอบรูปแบบชื่อไฟล์
- ตรวจสอบ SQL syntax
- ดู error logs ใน Supabase Dashboard

### Table มีอยู่แล้ว
- ใช้ `IF NOT EXISTS` ทุกครั้ง
- หรือ drop table ก่อน (ระวัง: จะลบข้อมูล!)

### Permission Denied
- ตรวจสอบ RLS policies
- ตรวจสอบว่าใช้ `anon` key ที่ถูกต้อง

## 🎓 Learn More

- [Supabase Database Documentation](https://supabase.com/docs/guides/database)
- [PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html)
- [Database Migration Best Practices](https://www.prisma.io/dataguide/types/relational/what-are-database-migrations)
