const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

// อย่าให้ Serverless Function ล่มตั้งแต่โหลดไฟล์ หากยังตั้งค่า env ไม่ครบ
const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

function requireSupabase(req, res, next) {
    if (!supabase) {
        return res.status(500).json({
            success: false,
            message: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_URL และ SUPABASE_KEY'
        });
    }
    next();
}

router.use(requireSupabase);

// ==================== USER / FRONTEND ROUTES ====================

// 1. ตรวจสอบว่า LINE ID นี้เคยผูกกับนักศึกษาแล้วหรือยัง
router.get('/check-user', async (req, res) => {
    try {
        const lineId = String(req.query.lineId || '').trim();
        if (!lineId) {
            return res.status(400).json({
                isRegistered: false,
                message: 'ไม่พบ LINE ID'
            });
        }

        const { data, error } = await supabase
            .from('students')
            .select('student_id, full_name, room_number')
            .eq('line_user_id', lineId)
            .maybeSingle();

        if (error) {
            console.error('Check user error:', error);
            return res.status(500).json({
                isRegistered: false,
                message: 'ไม่สามารถตรวจสอบข้อมูลสมาชิกได้'
            });
        }

        if (!data) {
            return res.json({ isRegistered: false });
        }

        return res.json({
            isRegistered: true,
            studentId: data.student_id,
            studentName: data.full_name,
            room: data.room_number
        });
    } catch (err) {
        console.error('Check user crash:', err);
        return res.status(500).json({
            isRegistered: false,
            message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
        });
    }
});

// 2. ผูก LINE ID กับรหัสนักศึกษา
router.post('/link-account', async (req, res) => {
    try {
        const lineId = String(req.body.lineId || '').trim();
        const studentId = String(req.body.studentId || '').trim();

        if (!studentId || !lineId) {
            return res.status(400).json({ 
                success: false, 
                message: 'กรุณากรอกรหัสนักศึกษาและเปิดผ่าน LINE'
            });
        }

        const { data: existingLineUser, error: lineLookupError } = await supabase
            .from('students')
            .select('student_id')
            .eq('line_user_id', lineId)
            .maybeSingle();

        if (lineLookupError) {
            console.error('LINE lookup error:', lineLookupError);
            return res.status(500).json({
                success: false,
                message: 'ไม่สามารถตรวจสอบบัญชี LINE ได้'
            });
        }

        if (existingLineUser && String(existingLineUser.student_id) !== studentId) {
            return res.status(409).json({
                success: false,
                message: 'บัญชี LINE นี้ผูกกับนักศึกษาคนอื่นแล้ว'
            });
        }

        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('student_id, full_name, room_number, line_user_id')
            .eq('student_id', studentId)
            .maybeSingle();

        if (studentError) {
            console.error('Student lookup error:', studentError);
            return res.status(500).json({
                success: false,
                message: 'ไม่สามารถตรวจสอบรหัสนักศึกษาได้'
            });
        }

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'ไม่พบรหัสนักศึกษานี้ในระบบ'
            });
        }

        if (student.line_user_id && student.line_user_id !== lineId) {
            return res.status(409).json({
                success: false,
                message: 'รหัสนักศึกษานี้ผูกกับบัญชี LINE อื่นแล้ว'
            });
        }

        const { data: updatedStudent, error: updateError } = await supabase
            .from('students')
            .update({ line_user_id: lineId })
            .eq('student_id', studentId)
            .select('student_id, full_name, room_number')
            .single();

        if (updateError) {
            console.error('Link account error:', updateError);
            return res.status(500).json({
                success: false,
                message: 'ไม่สามารถบันทึกการผูกบัญชีได้'
            });
        }

        return res.json({
            success: true,
            message: 'ผูกบัญชีสำเร็จ',
            user: {
                studentId: updatedStudent.student_id,
                studentName: updatedStudent.full_name,
                room: updatedStudent.room_number
            }
        });

    } catch (err) {
        console.error('Link account crash:', err);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// 3. ดึงรายการแจ้งซ่อมของห้อง
router.get('/room-repairs', async (req, res) => {
    try {
        const room = String(req.query.room || '').trim();
        if (!room) {
            return res.status(400).json({
                success: false,
                tickets: [],
                message: 'ไม่พบเลขห้อง'
            });
        }

        const { data, error } = await supabase
            .from('repair_tickets')
            .select('*')
            .eq('room_number', room)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Room repairs error:', error);
            return res.status(500).json({
                success: false,
                tickets: [],
                message: 'ไม่สามารถโหลดรายการแจ้งซ่อมได้'
            });
        }

        const tickets = (data || []).map(t => ({
            id: t.id,
            room: t.room_number,
            type: t.repair_type,
            detail: t.details,
            status: t.status,
            createdAt: t.created_at,
            acceptedBy: t.accepted_by,
            acceptedAt: t.accepted_at
        }));

        return res.json({ success: true, tickets });
    } catch (err) {
        console.error('Room repairs crash:', err);
        return res.status(500).json({
            success: false,
            tickets: [],
            message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
        });
    }
});

// 4. บันทึกรายการแจ้งซ่อมใหม่
router.post('/submit-repair', async (req, res) => {
    try {
        const room = String(req.body.room || '').trim();
        const type = String(req.body.type || '').trim();
        const detail = String(req.body.detail || '').trim();

        if (!room || !type || !detail) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกข้อมูลแจ้งซ่อมให้ครบถ้วน'
            });
        }

        const { data, error } = await supabase
            .from('repair_tickets')
            .insert([{
                room_number: room,
                repair_type: type,
                details: detail,
                status: 'รอช่างตรวจสอบ'
            }])
            .select()
            .single();

        if (error) {
            console.error('Submit repair error:', error);
            return res.status(500).json({
                success: false,
                message: 'ไม่สามารถบันทึกรายการแจ้งซ่อมได้'
            });
        }

        return res.status(201).json({
            success: true,
            message: 'ส่งข้อมูลแจ้งซ่อมเรียบร้อย',
            ticketId: data.id
        });
    } catch (err) {
        console.error('Submit repair crash:', err);
        return res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
        });
    }
});

// ==================== ADMIN ROUTES ====================

// 1. API Login
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

// 2. API ดึงรายการแจ้งซ่อม Admin
router.get('/admin/repairs', async (req, res) => {
    const { status } = req.query;
    let query = supabase.from('repair_tickets').select('*').order('created_at', { ascending: false });

    if (status && status !== 'ALL') {
        query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, message: error.message });

    const formattedData = data.map(t => ({
        id: t.id,
        room: t.room_number,
        type: t.repair_type,
        detail: t.details,
        status: t.status,
        createdAt: t.created_at,
        acceptedBy: t.accepted_by,
        acceptedAt: t.accepted_at
    }));

    res.json({ success: true, tickets: formattedData });
});

// 3. API อัปเดตสถานะ / รับเรื่อง
router.post('/admin/update-repair', async (req, res) => {
    const { ticketId, status, acceptedBy } = req.body;
    const updatePayload = {};

    if (status) updatePayload.status = status;
    if (acceptedBy) {
        updatePayload.accepted_by = acceptedBy;
        updatePayload.accepted_at = new Date().toISOString();
        if (!status) updatePayload.status = "รับเรื่องแล้ว";
    }

    const { data, error } = await supabase
        .from('repair_tickets')
        .update(updatePayload)
        .eq('id', ticketId)
        .select();

    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, message: "อัปเดตสำเร็จ", updatedTicket: data[0] });
});

// 🟢 จุดสำคัญ: บอก Express ให้ครอบคลุม Base Path ของ Netlify
app.use('/.netlify/functions/api', router);
app.use('/api', router); 
app.use('/', router);

module.exports.handler = serverless(app);
