const express = require('express');
const serverless = require('serverless-http');
const app = express();

app.use(express.json());

// 1. ฐานข้อมูลนักศึกษาจำลอง
let mockStudentDatabase = [
    { studentId: "6510110001", name: "นายสมชาย รักดี", room: "412", lineUserId: null },
    { studentId: "6510110002", name: "นางสาวสมหญิง เรียนเก่ง", room: "412", lineUserId: null },
    { studentId: "6510110003", name: "นายคนดี พากเพียร", room: "412", lineUserId: null }
];

// 2. ฐานข้อมูลตั๋วแจ้งซ่อมจำลอง
let mockRepairTickets = [
    { ticketId: 101, room: "412", type: "ไฟฟ้า", detail: "หลอดไฟโต๊ะอ่านหนังสือดับ", status: "รอช่างตรวจสอบ" },
    { ticketId: 102, room: "412", type: "ประปา", detail: "สายชำระรั่วซึม", status: "ซ่อมเสร็จสิ้น" }
];

// Router สำหรับ Netlify Serverless
const router = express.Router();

router.get('/check-user', (req, res) => {
    const { lineId } = req.query;
    const student = mockStudentDatabase.find(s => s.lineUserId === lineId);
    if (student) {
        res.json({ isRegistered: true, studentName: student.name, room: student.room });
    } else {
        res.json({ isRegistered: false });
    }
});

router.post('/link-account', (req, res) => {
    const { lineId, studentId } = req.body;
    const studentIndex = mockStudentDatabase.findIndex(s => s.studentId === studentId);
    if (studentIndex !== -1) {
        mockStudentDatabase[studentIndex].lineUserId = lineId;
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "ไม่พบรหัสนักศึกษานี้ในระบบหอพัก" });
    }
});

router.get('/room-repairs', (req, res) => {
    const { room } = req.query;
    const roomTickets = mockRepairTickets.filter(t => t.room === room);
    res.json({ tickets: roomTickets });
});

// นำ Route ทั้งหมดไปต่อท้ายพาธ /.netlify/functions/api
app.use('/.netlify/functions/api', router);
app.use('/api', router); // เผื่อกรณีรัน Localhost

module.exports.handler = serverless(app);