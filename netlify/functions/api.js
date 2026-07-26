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
// ดึงรายการแจ้งซ่อมของห้องนั้นๆ (อัปเดตส่งวันเวลาและผู้รับเรื่อง)
router.get('/room-repairs', async (req, res) => {
    const { room } = req.query;
    const { data, error } = await supabase
        .from('repair_tickets')
        .select('*')
        .eq('room_number', room)
        .order('created_at', { ascending: false });

    if (error) return res.json({ tickets: [] });

    const formattedTickets = data.map(t => ({
        id: t.id,
        type: t.repair_type,
        detail: t.details,
        status: t.status,
        createdAt: t.created_at,        // วันเวลาที่แจ้งซ่อม
        acceptedBy: t.accepted_by,      // ชื่อช่าง/เจ้าหน้าที่ที่รับเรื่อง
        acceptedAt: t.accepted_at       // วันเวลาที่รับเรื่อง
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

// ==================== STAFF AUTH & ADMIN API ====================

// 1. API สำหรับ Login เจ้าหน้าที่/ช่างซ่อม
router.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    const { data, error } = await supabase
        .from('staff_users')
        .select('id, username, full_name, role')
        .eq('username', username)
        .eq('password', password)
        .single();

    if (error || !data) {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    res.json({ success: true, user: data });
});

// 2. อัปเดตสถานะ / กดรับเรื่อง (รับชื่อผู้รับเรื่องจาก Session หน้าบ้าน)
router.post('/admin/update-repair', async (req, res) => {
    const { ticketId, status, acceptedBy } = req.body;

    if (!ticketId) {
        return res.status(400).json({ success: false, message: "กรุณาระบุ ticketId" });
    }

    const updatePayload = {};

    if (status) {
        updatePayload.status = status;
    }

    // หากมีการส่งชื่อคนกดรับเรื่องมา (ดึงจากคนที่ Login อยู่)
    if (acceptedBy) {
        updatePayload.accepted_by = acceptedBy;
        updatePayload.accepted_at = new Date().toISOString();
        if (!status) {
            updatePayload.status = "รับเรื่องแล้ว";
        }
    }

    const { data, error } = await supabase
        .from('repair_tickets')
        .update(updatePayload)
        .eq('id', ticketId)
        .select();

    if (error) {
        return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ", updatedTicket: data[0] });
});

app.use('/.netlify/functions/api', router);
app.use('/api', router);

module.exports.handler = serverless(app);