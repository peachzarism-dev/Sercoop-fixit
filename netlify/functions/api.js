const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');
const app = express();

app.use(express.json());

// ดึงค่า URL และ Key มาจาก Environment Variables เพื่อความปลอดภัย
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const router = express.Router();

// 1. ตรวจสอบว่าเคยผูกบัญชี LINE หรือยัง
router.get('/check-user', async (req, res) => {
    const { lineId } = req.query;
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('line_user_id', lineId)
        .single(); // คาดหวังผลลัพธ์แค่ 1 รายการ

    if (data) {
        res.json({ isRegistered: true, studentName: data.full_name, room: data.room_number });
    } else {
        res.json({ isRegistered: false });
    }
});

// 2. ผูกบัญชี LINE กับ รหัสนักศึกษา
router.post('/link-account', async (req, res) => {
    const { lineId, studentId } = req.body;
    
    // ค้นหานักศึกษาจากรหัส
    const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('student_id', studentId)
        .single();

    if (student) {
        // ถ้าเจอ ให้อัปเดตใส่ line_user_id เข้าไป
        const { error: updateError } = await supabase
            .from('students')
            .update({ line_user_id: lineId })
            .eq('student_id', studentId);

        if (updateError) {
            res.json({ success: false, message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
        } else {
            res.json({ success: true });
        }
    } else {
        res.json({ success: false, message: "ไม่พบรหัสนักศึกษานี้ในระบบ" });
    }
});

// 3. ดึงรายการแจ้งซ่อมของห้องนั้นๆ
router.get('/room-repairs', async (req, res) => {
    const { room } = req.query;
    const { data, error } = await supabase
        .from('repair_tickets')
        .select('*')
        .eq('room_number', room)
        .order('created_at', { ascending: false }); // เรียงจากรายการใหม่สุดขึ้นก่อน

    if (error) return res.json({ tickets: [] });

    // แปลงรูปแบบข้อมูลให้ตรงกับที่หน้าบ้าน (Frontend) ต้องการ
    const formattedTickets = data.map(t => ({
        id: t.id,
        type: t.repair_type,
        detail: t.details,
        status: t.status
    }));
    res.json({ tickets: formattedTickets });
});

// 4. (เพิ่มเติม) API สำหรับบันทึกแจ้งซ่อมเรื่องใหม่ลงฐานข้อมูล
router.post('/submit-repair', async (req, res) => {
    const { room, type, detail } = req.body;
    const { data, error } = await supabase
        .from('repair_tickets')
        .insert([{ room_number: room, repair_type: type, details: detail, status: 'รอช่างตรวจสอบ' }]);

    if (error) {
        res.json({ success: false, message: error.message });
    } else {
        res.json({ success: true });
    }
});

app.use('/.netlify/functions/api', router);
app.use('/api', router);

module.exports.handler = serverless(app);