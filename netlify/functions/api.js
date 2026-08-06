const express = require('express');
const serverless = require('serverless-http');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const sessionSecret = process.env.ADMIN_SESSION_SECRET || supabaseKey;

function getJwtRole(key) {
    try {
        const payload = key.split('.')[1];
        return payload ? JSON.parse(Buffer.from(payload, 'base64url').toString()).role : null;
    } catch {
        return null;
    }
}

const configuredKeyRole = supabaseKey ? getJwtRole(supabaseKey) : null;

function createAdminToken(user) {
    const payload = Buffer.from(JSON.stringify({ id: user.id, name: user.full_name, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
    const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function requireAdmin(req, res, next) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !sessionSecret) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบใหม่' });
    const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return res.status(401).json({ success: false, message: 'เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
    }
    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!session.exp || session.exp < Date.now()) return res.status(401).json({ success: false, message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
        req.admin = session;
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
    }
}

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
    if (configuredKeyRole === 'anon') {
        return res.status(500).json({
            success: false,
            isRegistered: false,
            message: 'Netlify ยังใช้ Supabase Anon Key กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY แล้ว Deploy ใหม่'
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
    try {
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }
        const { data, error } = await supabase
            .from('staff_users')
            .select('id, username, full_name, role')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();

        if (error) {
            console.error('Admin login database error:', error);
            return res.status(500).json({ success: false, message: `เชื่อมต่อฐานข้อมูลเจ้าหน้าที่ไม่ได้: ${error.message}` });
        }
        if (!data) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือยังไม่มีบัญชีเจ้าหน้าที่ในฐานข้อมูล' });
        }
        return res.json({ success: true, user: data, token: createAdminToken(data) });
    } catch (err) {
        console.error('Admin login crash:', err);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

router.use('/admin', requireAdmin);

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
    try {
        const { ticketId, status, acceptedBy } = req.body;
        if (!ticketId) {
            return res.status(400).json({ success: false, message: 'ไม่พบเลขที่งานซ่อม' });
        }

        const updatePayload = {};
        if (status) updatePayload.status = String(status).trim();
        if (acceptedBy) {
            updatePayload.accepted_by = String(acceptedBy).trim();
            updatePayload.accepted_at = new Date().toISOString();
            if (!status) updatePayload.status = 'รับเรื่องแล้ว';
        }
        if (Object.keys(updatePayload).length === 0) {
            return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลสำหรับอัปเดต' });
        }

        const { data, error } = await supabase
            .from('repair_tickets')
            .update(updatePayload)
            .eq('id', ticketId)
            .select('*')
            .maybeSingle();

        if (error) {
            console.error('Update repair error:', error);
            return res.status(500).json({
                success: false,
                message: 'อัปเดตงานไม่ได้ กรุณาตรวจสอบว่าได้เพิ่มคอลัมน์ผู้รับเรื่องในฐานข้อมูลแล้ว'
            });
        }
        if (!data) {
            return res.status(404).json({ success: false, message: 'ไม่พบงานแจ้งซ่อมนี้' });
        }
        return res.json({ success: true, message: 'อัปเดตสำเร็จ', updatedTicket: data });
    } catch (err) {
        console.error('Update repair crash:', err);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// ข้อมูลผู้เช่า / นักศึกษา
router.get('/admin/students', async (req, res) => {
    const { data, error } = await supabase
        .from('students')
        .select('student_id, full_name, phone, bank_name, bank_account_name, bank_account_number, room_number, line_user_id, created_at')
        .order('student_id');
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, students: data || [] });
});

router.post('/admin/students', async (req, res) => {
    const studentId = String(req.body.studentId || '').trim();
    const fullName = String(req.body.fullName || '').trim();
    const phone = String(req.body.phone || '').trim() || null;
    const bankName = String(req.body.bankName || '').trim() || null;
    const bankAccountName = String(req.body.bankAccountName || '').trim() || null;
    const bankAccountNumber = String(req.body.bankAccountNumber || '').replace(/[^0-9]/g, '') || null;
    const roomNumber = String(req.body.roomNumber || '').trim() || null;
    if (!studentId || !fullName) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสและชื่อผู้เช่า' });
    }
    if (bankAccountNumber && (bankAccountNumber.length < 8 || bankAccountNumber.length > 20)) {
        return res.status(400).json({ success: false, message: 'หมายเลขบัญชีธนาคารต้องมี 8–20 หลัก' });
    }

    if (roomNumber) {
        const { data: room, error: roomError } = await supabase
            .from('rooms').select('room_number').eq('room_number', roomNumber).maybeSingle();
        if (roomError) return res.status(500).json({ success: false, message: roomError.message });
        if (!room) return res.status(400).json({ success: false, message: 'ไม่พบห้องพักที่เลือก' });
    }

    const { data, error } = await supabase
        .from('students')
        .insert([{ student_id: studentId, full_name: fullName, phone, bank_name: bankName, bank_account_name: bankAccountName, bank_account_number: bankAccountNumber, room_number: roomNumber }])
        .select().single();
    if (error) {
        const message = error.code === '23505' ? 'รหัสผู้เช่านี้มีอยู่แล้ว' : error.message;
        return res.status(400).json({ success: false, message });
    }
    return res.status(201).json({ success: true, student: data });
});

router.put('/admin/students/:studentId', async (req, res) => {
    const fullName = String(req.body.fullName || '').trim();
    const phone = String(req.body.phone || '').trim() || null;
    const bankName = String(req.body.bankName || '').trim() || null;
    const bankAccountName = String(req.body.bankAccountName || '').trim() || null;
    const bankAccountNumber = String(req.body.bankAccountNumber || '').replace(/[^0-9]/g, '') || null;
    const roomNumber = String(req.body.roomNumber || '').trim() || null;
    if (!fullName) return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้เช่า' });
    if (bankAccountNumber && (bankAccountNumber.length < 8 || bankAccountNumber.length > 20)) {
        return res.status(400).json({ success: false, message: 'หมายเลขบัญชีธนาคารต้องมี 8–20 หลัก' });
    }

    const { data, error } = await supabase.from('students')
        .update({ full_name: fullName, phone, bank_name: bankName, bank_account_name: bankAccountName, bank_account_number: bankAccountNumber, room_number: roomNumber })
        .eq('student_id', req.params.studentId).select().maybeSingle();
    if (error) return res.status(400).json({ success: false, message: error.message });
    if (!data) return res.status(404).json({ success: false, message: 'ไม่พบผู้เช่านี้' });
    return res.json({ success: true, student: data });
});

// ตั้งค่าห้องพัก
router.get('/admin/rooms', async (req, res) => {
    const { data, error } = await supabase.from('rooms').select('*').order('room_number');
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, rooms: data || [] });
});

router.post('/admin/rooms', async (req, res) => {
    const roomNumber = String(req.body.roomNumber || '').trim();
    const roomType = req.body.roomType === 'shop' ? 'shop' : 'residential';
    const monthlyRent = Number(req.body.monthlyRent);
    const occupancyLimit = Number(req.body.occupancyLimit);
    if (!roomNumber || !Number.isFinite(monthlyRent) || monthlyRent < 0 || ![1, 2, 3].includes(occupancyLimit)) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกเลขห้องและค่าเช่าให้ถูกต้อง' });
    }
    const { data, error } = await supabase.from('rooms').insert([{
        room_number: roomNumber,
        room_type: roomType,
        monthly_rent: monthlyRent,
        occupancy_limit: occupancyLimit,
        status: 'available'
    }]).select().single();
    if (error) {
        const message = error.code === '23505' ? 'เลขห้องนี้มีอยู่แล้ว' : error.message;
        return res.status(400).json({ success: false, message });
    }
    return res.status(201).json({ success: true, room: data });
});

router.put('/admin/rooms/:roomNumber', async (req, res) => {
    const roomType = req.body.roomType === 'shop' ? 'shop' : 'residential';
    const monthlyRent = Number(req.body.monthlyRent);
    const occupancyLimit = Number(req.body.occupancyLimit);
    const status = ['available', 'occupied', 'maintenance'].includes(req.body.status)
        ? req.body.status : 'available';
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0 || ![1, 2, 3].includes(occupancyLimit)) {
        return res.status(400).json({ success: false, message: 'ค่าเช่าหรือจำนวนผู้เข้าพักไม่ถูกต้อง' });
    }
    const { data, error } = await supabase.from('rooms')
        .update({ room_type: roomType, monthly_rent: monthlyRent, occupancy_limit: occupancyLimit, status })
        .eq('room_number', req.params.roomNumber).select().maybeSingle();
    if (error) return res.status(400).json({ success: false, message: error.message });
    if (!data) return res.status(404).json({ success: false, message: 'ไม่พบห้องพักนี้' });
    return res.json({ success: true, room: data });
});

// ตั้งค่าอัตราค่าน้ำและค่าไฟ แยกห้องพัก / ร้านเช่า
router.get('/admin/utility-rates', async (req, res) => {
    const { data, error } = await supabase.from('utility_rates').select('*').order('property_type');
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, rates: data || [] });
});

router.put('/admin/utility-rates/:propertyType', async (req, res) => {
    const propertyType = req.params.propertyType;
    const waterRate = Number(req.body.waterRate);
    const electricityRate = Number(req.body.electricityRate);
    if (!['residential', 'shop'].includes(propertyType)) {
        return res.status(400).json({ success: false, message: 'ประเภทพื้นที่ไม่ถูกต้อง' });
    }
    if (![waterRate, electricityRate].every(value => Number.isFinite(value) && value >= 0)) {
        return res.status(400).json({ success: false, message: 'อัตราค่าน้ำหรือค่าไฟไม่ถูกต้อง' });
    }
    const { data, error } = await supabase.from('utility_rates').upsert({
        property_type: propertyType,
        water_rate: waterRate,
        electricity_rate: electricityRate,
        updated_at: new Date().toISOString()
    }, { onConflict: 'property_type' }).select().single();
    if (error) return res.status(400).json({ success: false, message: error.message });
    return res.json({ success: true, rate: data });
});

// 🟢 จุดสำคัญ: บอก Express ให้ครอบคลุม Base Path ของ Netlify
app.use('/.netlify/functions/api', router);
app.use('/api', router); 
app.use('/', router);

module.exports.handler = serverless(app);
