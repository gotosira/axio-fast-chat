# 🚀 Supabase Setup Guide for BaoBao

## ขั้นตอนการติดตั้ง Supabase

### 1. สร้าง Supabase Project

1. ไปที่ [supabase.com](https://supabase.com)
2. คลิก "Start your project"
3. สร้าง organization ใหม่ (ถ้ายังไม่มี)
4. คลิก "New project"
5. กรอกข้อมูล:
   - **Name**: baobao-chat
   - **Database Password**: สร้างรหัสผ่านที่ปลอดภัย (เก็บไว้ใช้งานภายหลัง)
   - **Region**: เลือก Southeast Asia (Singapore) เพื่อความเร็ว
6. คลิก "Create new project" และรอ 2-3 นาที

### 2. สร้าง Database Tables

1. ไปที่ **SQL Editor** (เมนูด้านซ้าย)
2. คัดลอกโค้ด SQL จาก `server/schema.sql`
3. Paste ลงใน SQL Editor
4. คลิก "Run" เพื่อสร้าง tables

### 3. ดึง API Credentials

1. ไปที่ **Settings** → **API**
2. คัดลอก:
   - **Project URL** (จะเป็น https://xxxxx.supabase.co)
   - **anon/public key** (คีย์ยาวๆ ที่ขึ้นต้นด้วย eyJ...)

### 4. อัพเดท .env File

เปิดไฟล์ `.env` และใส่ค่าที่คัดลอกมา:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 5. รันเซิร์ฟเวอร์

```bash
node server/baobaoAPI.js
```

## ✅ ข้อดีของ Supabase

- ✅ **ไม่ต้อง compile native modules** - ไม่มีปัญหา NODE_MODULE_VERSION
- ✅ **Postgres database** - Powerful และ scalable กว่า SQLite
- ✅ **Realtime subscriptions** - อัพเดทข้อมูลแบบ real-time
- ✅ **Built-in Auth** - เพิ่ม authentication ได้ง่าย
- ✅ **Cloud-hosted** - ไม่ต้องจัดการ database file
- ✅ **Free tier** - 500MB database, 2GB file storage, 50,000 monthly active users

## 🔧 การทำงาน

แอพจะใช้ Supabase แทน SQLite โดยโครงสร้างเหมือนเดิม:

- **conversations** table → เก็บรายการ conversations
- **messages** table → เก็บข้อความในแต่ละ conversation
- Auto-update `updated_at` เมื่อมีข้อความใหม่
- Auto-generate title จากข้อความแรก

## 🐛 Troubleshooting

หากเจอปัญหา:
1. ตรวจสอบว่า `.env` มี credentials ที่ถูกต้อง
2. ตรวจสอบว่ารัน SQL schema แล้ว
3. ดู RLS policies ใน Supabase dashboard
4. เช็ค console logs สำหรับ error messages
