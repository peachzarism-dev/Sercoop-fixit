const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

// Initialize Supabase
// ดึงค่าจาก Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// ตรวจสอบว่ามีค่าหรือเปล่า ก่อนเริ่มสร้าง Client
if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase Environment Variables!");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

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