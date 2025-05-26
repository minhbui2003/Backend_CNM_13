import express from 'express'
const router = express.Router()

import accountController from '../app/controllers/AccountController.js'

// router.post('/login', accountController.login) Web
router.post('/loginWeb', accountController.loginWeb)
// router.post('/login-phone', accountController.loginphone)
router.post('/loginPhoneWeb', accountController.loginPhoneWeb)
router.post('/addAccountWeb', accountController.registerWeb)
router.get('/check-phone', accountController.checkPhoneNumberExists);
router.post('/forgot-account', accountController.forgot)

// viết 1 router đổi mật khẩu
router.post('/changePasswordWeb', accountController.changePasswordWeb)

// mpobile
router.post('/login', accountController.login)
router.post('/add-account', accountController.register)
router.get('/find', accountController.findByID)
router.post('/create-account', accountController.createAccount)
router.get('/find-account-by-phone-number', accountController.findByPhoneNumber)
router.put('/updatePassword', accountController.updatePassword)
router.put(
    '/updatePasswordByPhone',
    accountController.updatePasswordByPhoneNumber
)
router.delete('/delete-account', accountController.deleteAccount)
router.put('/updateNewPhoneNumber', accountController.updatePhoneNumber)
// Mới
router.post('/registerMobile', accountController.registerMobile);
router.post('/loginMobile', accountController.loginMobile);
//----
export default router
