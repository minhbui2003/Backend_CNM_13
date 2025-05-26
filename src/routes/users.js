import express from 'express'
import path from 'path'
const router = express.Router()
import multer from 'multer'
import userController from '../app/controllers/UserController.js'

const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, '')
    },
})
const upload = multer({
    storage: storage,
    limits: { fileSize: 2000000 }, // giới hạn file 2MB
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb)
    },
})
function checkFileType(file, callback) {
    const filetypes = /jpeg|jpg|png|jfif|gif/
    const extname = filetypes.test(
        path.extname(file.originalname).toLowerCase()
    )
    const mimetype = filetypes.test(file.mimetype)
    if (mimetype && extname) {
        return callback(null, true)
    } else {
        callback('Error: Images Only!')
    }
}

// router.post('/register', userController.register)

router.post('/registerWeb', userController.registerWeb)

router.get('/findAllUsers', userController.findAllUsers)

// router.post('/findUser', userController.findUserByAccountID)

router.put('/addFriend', userController.addFriend)



// router.post('/findUserWeb', userController.findUserByAccountIDWeb)

router.post('/findAllUsersWeb', userController.findAllUsersWeb)
// web findUser by số điện thoại
router.post('/findUserByPhoneWeb', userController.findUserByPhoneWeb)

router.post('/addFriendWeb', userController.addFriendWeb)
// tìm kiếm user theo account_id
router.post('/findUserByAccountIDWeb', userController.findUserByAccountIDWeb)
// ở trang dashboard tìm kiếm user theo user_id
router.post('/findUserByUserID', userController.findUserByUserID)

// updateUserWeb
router.post(
    '/updateUserWeb',
    upload.single('image'),
    userController.updateUserWeb
)
router.post(
    '/changeImageAvatarWeb',
    upload.single('image'),
    userController.ChangeImageAvatarWeb
)
router.post(
    '/changeImageCoverAvatarWeb',
    upload.single('image'),
    userController.changeImageCoverAvatarWeb
)
router.post('/sendFriendRequestWeb', userController.sendFriendRequestWeb)
router.post('/acceptFriendRequestWeb', userController.acceptFriendRequestWeb)
router.post('/cancelFriendRequestWeb', userController.cancelFriendRequestWeb)
router.post('/deleteFriendRequestWeb', userController.deleteFriendRequestWeb)


router.post('/get-users-by-ids', userController.getUsersByIds)

// old
// router.post('/addFriendWeb', userController.addFriendWeb)

router.post('/addFriendWeb', userController.addFriendWeb)
router.post('/deleteFriendWeb', userController.deleteFriendWeb)
router.post('/getInfoFriendWeb', userController.getInfoFriendWeb)

// lấy avatar của user từ user_id
router.post('/getInfoByUserIDWeb', userController.getInfoByUserIDWeb)

// Mobile
// Mobile
router.post('/register', userController.register)
router.get('/findAllExceptCurrentUser', userController.GetAllUsers)

router.get('/findAllUsers', userController.findAllUsers)

router.get('/findUser', userController.findUserByAccountID)

router.put('/updateAvatar', userController.updateAvatar)

router.put('/updateCoverImage', userController.updateCoverImage)

router.put('/updateInfo', userController.updateInfo)

router.get('/findUserByUserId/:userId', userController.findUserByUserIDMobile)
router.post('/friend-request', userController.friendRequest)
router.get('/getFriends/:userId', userController.getInfoFriend)
router.get(
    '/findUserByPhoneNumber/:phoneNumber',
    userController.findUserByPhoneNumber
)
router.get('/friend-request/:userId', userController.showFriendRequests)
router.post('/friend-request/accept', userController.acceptFriendRequest)
router.get('/getFriends/:userId', userController.getInfoFriend)
router.get(
    '/getSentFriendRequests/:userId',
    userController.showSentFriendRequests
)
router.post('/recallsentRequest', userController.cancelFriendRequest)
router.post('/friend-request/reject', userController.rejectFriendRequest)

router.delete('/deleteAccount', userController.deleteAccount)
router.put('/undoDeleteAccount', userController.undoDeleteAccount)
router.delete(
    '/deleteAccountAfter30Days',
    userController.deleteAccountAfter30Days
)
router.put('/updateNewPhoneNumber', userController.changeNewPhoneNumber)
// Thêm Mobile
router.post('/registerMobile', userController.registerMobile);
router.post('/friend-request-mobile', userController.friendRequestMobile);
router.get('/friend-request-mobile/:userId', userController.showFriendRequestsMobile);
router.get('/sent-friend-request-mobile/:userId', userController.showSentFriendRequestsMobile);
router.get('/friend-request-mobile/:userId', userController.showFriendRequestsMobile);
router.post('/deleteFriend', userController.deleteFriend);
router.get('/findUserByUserIDMobile/:userId', userController.findUserByUserIDMobile);
export default router
