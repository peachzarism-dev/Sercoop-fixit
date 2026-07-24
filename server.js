const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. ฐานข้อมูลนักศึกษาจำลอง (ผูกเลขห้องเดียวกันไว้ทดสอบ Dashboard)
let mockStudentDatabase = [
    { studentId: "6510110001", name: "นายสมชาย รักดี", room: "412", lineUserId: null },
    { studentId: "6510110002", name: "นางสาวสมหญิง เรียนเก่ง", room: "412", lineUserId: null }, // อยู่ห้อง 412 เหมือนสมชาย
    { studentId: "6510110003", name: "นายคนดี พากเพียร", room: "412", lineUserId: null }    // อยู่ห้อง 412 เหมือนสมชาย
];

// 2. ฐานข้อมูลตั๋วแจ้งซ่อมจำลองของแต่ละห้อง
let mockRepairTickets = [
    { ticketId: 101, room: "412", type: "ไฟฟ้า", detail: "หลอดไฟโต๊ะอ่านหนังสือดับ", status: "รอช่างตรวจสอบ" },
    { ticketId: 102, room: "412", type: "ประปา", detail: "สายชำระรั่วซึม", status: "ซ่อมเสร็จสิ้น" }
];

// API: เช็คสถานะการลงทะเบียนจาก LINE ID
app.get('/api/check-user', (req, res) => {
    const { lineId } = req.query;
    const student = mockStudentDatabase.find(s => s.lineUserId === lineId);
    
    if (student) {
        res.json({ isRegistered: true, studentName: student.name, room: student.room });
    } else {
        res.json({ isRegistered: false });
    }
});

// API: ผูกบัญชีนักศึกษากับ LINE ID
app.post('/api/link-account', (req, res) => {
    const { lineId, studentId } = req.body;
    const studentIndex = mockStudentDatabase.findIndex(s => s.studentId === studentId);
    
    if (studentIndex !== -1) {
        mockStudentDatabase[studentIndex].lineUserId = lineId;
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "ไม่พบรหัสนักศึกษานี้ในระบบหอพัก" });
    }
});

// API: ดึงข้อมูลรายการแจ้งซ่อมของห้องนั้นๆ (แก้ไขวงเล็บปิดเรียบร้อยแล้ว)
app.get('/api/room-repairs', (req, res) => {
    const { room } = req.query;
    const roomTickets = mockRepairTickets.filter(t => t.room === room);
    res.json({ tickets: roomTickets });
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});