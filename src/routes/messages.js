import express from 'express'
const router = express.Router()

import messageController from '../app/controllers/MessageController.js'
import AWS from 'aws-sdk'
import path from 'path'
import multer from 'multer'

const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, '')
    },
})
const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // giới hạn file 100MB
    fileFilter: function (req, file, cb) {
        checkFileTypeMedia(file, cb)
    },
})
function checkFileTypeMedia(file, callback) {
    const extTypes = /\.(jpeg|jpg|png|gif|doc|docx|pdf|txt|ppt|pptx|xlsx|mp4|m4a|mp3|wav)$/i;
    const mimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf', 'text/plain',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'video/mp4',
        'audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/mp3', 'audio/wav',
        'application/octet-stream'
    ];

    const extname = extTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = mimeTypes.includes(file.mimetype);

    if (extname && mimetype) {
        return callback(null, true);
    } else {
        console.error('❌ MIME:', file.mimetype, '| EXT:', path.extname(file.originalname));
        callback('Error: Invalid File Type 0!');
    }
}


router.post(
    '/createMessagesWeb',
    upload.array('image', 10),
    messageController.createMessagesWeb
)
router.post('/findAllMessagesWeb', messageController.findAllMessagesWeb)
// thu hồi tin nhắn
router.post('/recallMessageWeb', messageController.recallMessageWeb)
// viết 1 hàm lấy các message có recalled = true
router.post(
    '/findAllRecallMessagesWeb',
    messageController.findAllRecallMessagesWeb
)
// 1 hàm xoá tin nhắn chỉ Ở phias tooi
router.post('/deleteMyMessageWeb', messageController.deleteMyMessageWeb)
// viết 1 hàm lấy các message có trường deleteBy có giá trị
router.post(
    '/findAllDeleteMyMessageWeb',
    messageController.findAllDeleteMyMessageWeb
)
// viết 1 hàm tạo 1 bản sao tin nhắn tới conversation_id
router.post('/forwardMessageWeb', messageController.forwardMessageWeb)
// viết 1 hàm test up file media
router.post(
    '/uploadMediaWeb',
    upload.array('media', 10),
    messageController.uploadMediaWeb
)
// tạo notification
router.post('/createNotificationWeb', messageController.createNotificationWeb)
// get all media
router.post('/getAllMediaWeb', messageController.getAllMediaWeb)
// get all File
router.post('/getAllFileWeb', messageController.getAllFileWeb)
// get getMessageReplyContentWeb
router.post(
    '/getMessageReplyContentWeb',
    messageController.getMessageReplyContentWeb
)
router.post('/getLastMessageWeb', messageController.getLastMessageWeb)
// //add mobile
router.get('/:conversation_id', messageController.getMessagesByConversationID)
router.post(
    '/findNewestMessage/:conversation_id',
    messageController.findNewestMessage
)
//mobile thêm
router.post('/getLastMessageMobile', messageController.getLastMessageMobile);
router.post('/createMessagesMobile',
    upload.single('file'), // Đơn file từ mobile
    messageController.createMessagesMobile
);
router.post('/sendFileMobile', upload.array('file', 10), messageController.createMessagesMobile);

// group message
router.post('/createNotificationMobile', messageController.createNotificationMobile);
router.post('/forwardMessageMobile', messageController.forwardMessageMobile);
router.post('/getAllMediaMobile', messageController.getAllMediaMobile);
router.post('/getAllFileMobile', messageController.getAllFileMobile);

export default router
