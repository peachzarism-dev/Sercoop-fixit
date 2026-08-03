# PSU Dorm LIFF

ระบบผูกบัญชี LINE, แจ้งซ่อม และหน้าบริหารหอพักบน Netlify + Supabase

## ตั้งค่าฐานข้อมูล

1. เปิด Supabase Dashboard ของโปรเจกต์
2. ไปที่ **SQL Editor** แล้วเปิดไฟล์ `supabase/schema.sql`
3. คัดลอก SQL ทั้งหมด กด **Run** หนึ่งครั้ง (สามารถรันซ้ำได้และไม่ลบข้อมูลเดิม)
4. ตรวจสอบว่ามีตาราง `students`, `rooms`, `repair_tickets`, `utility_rates` และ `staff_users`

สคริปต์จะเพิ่ม `accepted_by` และ `accepted_at` ให้ตารางงานซ่อมเดิม ซึ่งจำเป็นสำหรับปุ่ม **รับเรื่อง**

## Environment Variables บน Netlify

- `SUPABASE_URL` — Project URL จาก Supabase
- `SUPABASE_KEY` — แนะนำให้ใช้ Service Role Key และเก็บไว้เฉพาะใน Netlify

ระบบยังรองรับชื่อเดิม `SUPABASE_ANON_KEY` แต่ Service Role Key เหมาะกับ API ฝั่งเซิร์ฟเวอร์มากกว่า อย่าใส่ Service Role Key ในไฟล์ HTML หรือ JavaScript ฝั่งหน้าเว็บ

หลังตั้งค่าหรือเปลี่ยน Environment Variables ให้ Deploy เว็บไซต์ใหม่หนึ่งครั้ง

## หน้าใช้งาน

- `/` — LIFF สำหรับนักศึกษา
- `/admin.html` — ระบบเจ้าหน้าที่
