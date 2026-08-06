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
- `SUPABASE_SERVICE_ROLE_KEY` — Service Role Key จาก Supabase และเก็บไว้เฉพาะใน Netlify เพื่อให้ API เข้าถึงข้อมูลที่ปิดจากผู้ใช้ทั่วไปได้
- `ADMIN_SESSION_SECRET` — ข้อความสุ่มยาวอย่างน้อย 32 ตัวอักษร สำหรับป้องกันข้อมูลเจ้าหน้าที่และบัญชีธนาคาร

อย่าใส่ Service Role Key ในไฟล์ HTML หรือ JavaScript ฝั่งหน้าเว็บ เนื่องจากข้อมูลผู้เช่ามีหมายเลขบัญชีธนาคาร

หลังตั้งค่าหรือเปลี่ยน Environment Variables ให้ Deploy เว็บไซต์ใหม่หนึ่งครั้ง

## หน้าใช้งาน

- `/` — LIFF สำหรับนักศึกษา
- `/admin.html` — ระบบเจ้าหน้าที่
