import Account from '../models/Account.js'
import { HTTP_STATUS_BAD_REQUEST } from '../../util/erorCode.js'
import User from '../models/User.js'
import { response } from 'express'



import jwt from 'jsonwebtoken'
const createToken = (accountId) => {
    const payload = { accountId: accountId }
    const token = jwt.sign(payload, 'Q$r2K6W8n!jCW%Zk', { expiresIn: '1h' })
    return token
}


class AccountController {
    // POST http://localhost:3001/account/login WEb
    async loginWeb(req, res) {
        console.log('Đang đăng nhập')

        const { phoneNumber, password } = req.body
        const account = await Account.findOne({ phoneNumber })

        if (!account) {
            return res.status(200).json({ message: 'Account not found!!!' })
        }

        if (account.password !== password) {
            return res.status(200).json({ message: 'Password not match!!!' })
        }

        const user = await User.findOne({ account_id: account._id });

        console.log('Đăng nhập thành công')
        return res.status(200).json({
            message: 'Login successfully!!!',
            account_id: account._id,
            user: user || null, // user có thể null nếu chưa tạo user
        })
    }

    // post /register



    async registerWeb(req, res) {
        const { phoneNumber, password, fullName, dateOfBirth, gender } = req.body;

        try {
            const existingAccount = await Account.findOne({ phoneNumber });
            if (existingAccount) {
                return res.status(400).json({ message: 'Số điện thoại đã được đăng ký!' });
            }

            const account = new Account({ phoneNumber, password });
            await account.save();

            // 👉 Split họ tên để lấy firstName, lastName
            const nameParts = fullName.trim().split(' ');
            const lastName = nameParts[0];
            const firstName = nameParts.slice(1).join(' ') || '';

            const user = new User({
                account_id: account._id,
                userName: fullName,
                firstName,
                lastName,
                phoneNumber,
                dateOfBirth,
                gender,
                avatar: 'https://i.imgur.com/0y0y0y0.png', // default avatar
                conversation_id: [],
                friend: [],
                deleteFriend: [],
            });

            await user.save();

            res.status(200).json({
                message: 'Đăng ký thành công!!!',
                account_id: account._id,
            });
        } catch (err) {
            console.error('❌ Lỗi khi đăng ký:', err);
            res.status(500).json({ message: 'Đăng ký thất bại!' });
        }
    }


    //get check phone 
    async checkPhoneNumberExists(req, res) {
        const { phoneNumber } = req.query;
        try {
            const account = await Account.findOne({ phoneNumber });
            if (account) {
                return res.status(200).json({ exists: true });
            }
            return res.status(200).json({ exists: false });
        } catch (error) {
            console.error('Lỗi kiểm tra số điện thoại:', error);
            return res.status(500).json({ message: 'Lỗi server' });
        }
    }


    // POST WEb
    async loginPhoneWeb(req, res) {
        const { phoneNumber } = req.body

        let phoneNumberFormat // Khai báo biến ở mức độ phạm vi toàn cục

        if (phoneNumber.startsWith('+84')) {
            // kiểm tra xem phoNumber đang là dạng này dạng +84367909181 hay là +840367909181 chuyển cả 2 dạng về 0367909181

            // Kiểm tra xem số điện thoại có đúng định dạng +84XXXXXXXXX không
            const regex = /^\+84\d{9}$/ // Biểu thức chính quy để kiểm tra
            if (regex.test(phoneNumber)) {
                phoneNumberFormat = phoneNumber.replace('+84', '0') // Thay thế +84 bằng 0
            } else {
                phoneNumberFormat = phoneNumber.replace('+840', '0') // Thay thế +840 bằng 0
            }

            const data = phoneNumberFormat
            console.log(data)
            // kiểm tra số điện thoại đã tồn tại trong db chưa , nếu rồi trả về số điện thoại lại trang đã nhận otp để load
            const account = await Account.findOne({
                phoneNumber: phoneNumberFormat,
            })
            console.log(account)
            if (!account) {
                console.log('Số điện thoại chưa được đăng ký!!!')
                return res.status(200).json({
                    message: 'Số điện thoại chưa được đăng ký!!!',
                })
            }
            // từ phoneNumber truyền vào tìm ra User trong db
            const user = await User.findOne({
                phoneNumber: phoneNumberFormat,
            })
            const user_id = user._id
            console.log('Đăng nhập thành công')
            res.status(200).json({
                message: 'Đăng nhập thành công!!!',
                phoneNumber: phoneNumberFormat,
                user_id: user_id,
            })
        } else if (phoneNumber.startsWith('0')) {
            const data = phoneNumber
            console.log(data)
            console.log('hello')
            // kiểm tra số điện thoại đã tồn tại trong db chưa , nếu rồi trả về số điện thoại lại trang đã nhận otp để load
            const account = await Account.findOne({ phoneNumber: phoneNumber })
            console.log(account)
            if (!account) {
                res.status(400).json({
                    message: 'Số điện thoại chưa được đăng ký!!!',
                })
            }
            const user = await User.findOne({
                phoneNumber: phoneNumber,
            })
            const user_id = user._id
            console.log('Đăng nhập thành công')
            res.status(200).json({
                message: 'Đăng nhập thành công!!!',
                phoneNumber: phoneNumberFormat,
                user_id: user_id,
            })
        } else {
            console.log('Số điện thoại không đúng định dạng')
            res.status(400).json({
                message: 'Số điện thoại không đúng định dạng',
            })
        }
    }
    // Createaccount mobile--------------------
    // login mobile
    async login(req, res) {
        const { phoneNumber, password } = req.body
        //check if phoneNumber and password are provided
        if (!phoneNumber || !password) {
            return res
                .status(404)
                .json('Please provide phone number and password')
        }
        //check account in db
        const account = await Account.findOne({ phoneNumber: phoneNumber })
            .then((account) => {
                if (!account) {
                    return res.status(404).json('Account not found')
                }
                if (account.password !== password) {
                    return res.status(404).json('Password is incorrect')
                }
                const token = createToken(account._id)
                return res.status(200).json({ token })
            })
            .catch((err) => {
                console.error(err)
                return res.status(500).json('Internal server error!!!')
            })
    }
    // register mobile
    // post /register
    async register(req, res) {
        const { phoneNumber, password } = req.body

        const account = new Account({ phoneNumber, password })
        await account
            .save()
            .then(() => {
                res.json('Register successfully!!!')
            })
            .catch((err) => {
                res.json('Register failure!!!')
            })
    }

    async createAccount(req, res) {
        const { phoneNumber, password } = req.body

        const account = new Account({ phoneNumber, password })
        await account
            .save()
            .then(() => {
                res.json(account)
            })
            .catch((err) => {
                res.json('Create account failure!!!')
            })
    }
    async findByPhoneNumber(req, res) {
        const phoneNumber = req.query.phoneNumber

        const account = await Account.findOne({ phoneNumber: phoneNumber })
        if (account) {
            res.json(account)
        } else {
            res.status(HTTP_STATUS_BAD_REQUEST).json('Account not found!!!')
        }
    }
    // put /updatePassword
    async updatePassword(req, res) {
        const id = req.query.account_id
        const password = req.body.password
        const account = await Account.findOne({ _id: id })
        if (account) {
            account.password = password
            await account
                .save()
                .then(() => {
                    res.json('Update password successfully!!!')
                })
                .catch((err) => {
                    res.json('Update password failure!!!')
                })
        } else {
            res.status(HTTP_STATUS_BAD_REQUEST).json('Account not found!!!')
        }
    }
    //update password by phone number
    async updatePasswordByPhoneNumber(req, res) {
        const phoneNumber = req.query.phoneNumber
        const password = req.body.password
        const account = await Account.findOne({ phoneNumber: phoneNumber })
        if (account) {
            account.password = password
            await account
                .save()
                .then(() => {
                    res.json('Update password successfully!!!')
                })
                .catch((err) => {
                    res.json('Update password failure!!!')
                })
        } else {
            res.status(HTTP_STATUS_BAD_REQUEST).json('Account not found!!!')
        }
    }

    //--------------------------------

    // viết 1 hàm post quên mật khẩu từ số điện thoại WEb
    async forgot(req, res) {
        // gọi lại hàm loginphone
        const { phoneNumber } = req.body
        const passwordnew = req.body.passwordnew
        // tìm từ số điện thoại ra account trong db có số điện thoại đó không
        const account = await Account.findOne({ phoneNumber: phoneNumber })
        // từ account đổi password thành passwordnew

        // kiểm tra mật khẩu mới có giống mật khẩu cũ không , nếu giống thì báo lỗi
        if (account.password === passwordnew) {
            console.log('Mật khẩu mới không được trùng mật khẩu cũ')
            res.status(200).json({
                message: 'Mật khẩu mới không được trùng mật khẩu cũ',
            })
        } else {
            // nếu giống thì thay đổi mật khẩu thành mật khẩu mới
            account.password = passwordnew
            await account.save()
            console.log('Mật khẩu đã được thay đổi thành công')
            res.status(200).json({
                message: 'Mật khẩu đã được thay đổi thành công!!!',
                account: account,
            })
        }
    }

    // thay đổi mật khẩu http://localhost:3001/account/changePasswordWeb
    async changePasswordWeb(req, res) {
        const { phoneNumber, password, passwordnew } = req.body

        // tìm account từ số điện thoại
        const account = await Account.findOne({ phoneNumber: phoneNumber })
        console.log(account)

        // kiểm tra mật khẩu cũ có đúng không
        if (account.password !== password) {
            console.log('Mật khẩu cũ không đúng')
            return res.status(200).json({
                message: 'Mật khẩu cũ không đúng',
            })
        }
        // kiểm tra mật khẩu mới có giống mật khẩu cũ không
        if (account.password === passwordnew) {
            console.log('Mật khẩu mới không được trùng mật khẩu cũ')
            return res.status(200).json({
                message: 'Mật khẩu mới không được trùng mật khẩu cũ',
            })
        }
        // thay đổi mật khẩu thành mật khẩu mới
        account.password = passwordnew
        await account.save()
        console.log('Mật khẩu đã được thay đổi thành công')
        res.status(200).json({
            message: 'Mật khẩu đã được thay đổi thành công',
            account: account,
        })
    }



    async findByID(req, res) {
        const id = req.query.account_id

        const account = await Account.findOne({ _id: id })
        if (account) {
            res.json(account)
        } else {
            res.status(HTTP_STATUS_BAD_REQUEST).json('Account not found!!!')
        }
    }
    //delete account
    async deleteAccount(req, res) {
        const id = req.query.account_id

        const account = await Account.findOne({ _id: id })
        if (account) {
            account.phoneNumber = account.phoneNumber + '_deleted' + Date.now()
            res.json('Delete account successfully!!!')
        } else {
            res.status(HTTP_STATUS_BAD_REQUEST).json('Account not found!!!')
        }
    }
    //put /updatePhoneNumber
    async updatePhoneNumber(req, res) {
        const id = req.body.account_id
        const phoneNumber = req.body.newPhoneNumber
        const account = await Account.findOne({ _id: id })
        if (account) {
            account.phoneNumber = phoneNumber
            await account
                .save()
                .then(() => {
                    res.json('Update phone number successfully!!!')
                })
                .catch((err) => {
                    res.json('Update phone number failure!!!')
                })
        } else {
            res.status(HTTP_STATUS_BAD_REQUEST).json('Account not found!!!')
        }
    }

    //MOBILE Update
    async registerMobile(req, res) {
        const { phoneNumber, password } = req.body;

        try {
            // Kiểm tra số điện thoại đã tồn tại
            const existingAccount = await Account.findOne({ phoneNumber });
            if (existingAccount) {
                return res.status(400).json({ message: 'Số điện thoại đã được đăng ký' });
            }

            const account = new Account({ phoneNumber, password });
            await account.save();
            res.status(200).json({
                message: 'Đăng ký tài khoản thành công!!!',
                account_id: account._id,
            });
        } catch (err) {
            console.error('Lỗi đăng ký tài khoản mobile:', err);
            res.status(500).json({ message: 'Đăng ký tài khoản thất bại', error: err.message });
        }
    }

    async loginMobile(req, res) {
        const { phoneNumber, password } = req.body;

        // Kiểm tra đầu vào
        if (!phoneNumber || !password) {
            return res.status(400).json({ message: 'Vui lòng cung cấp số điện thoại và mật khẩu' });
        }

        try {
            // Tìm tài khoản
            const account = await Account.findOne({ phoneNumber });
            if (!account) {
                return res.status(404).json({ message: 'Tài khoản không tồn tại' });
            }

            // Kiểm tra mật khẩu
            if (account.password !== password) {
                return res.status(401).json({ message: 'Mật khẩu không đúng' });
            }

            // Tạo token
            const token = createToken(account._id);

            // Trả về phản hồi
            return res.status(200).json({
                message: 'Đăng nhập thành công',
                token,
                account_id: account._id.toString(), // Đảm bảo trả account_id
            });
        } catch (err) {
            console.error('Lỗi đăng nhập mobile:', err);
            return res.status(500).json({ message: 'Lỗi server nội bộ' });
        }
    }
}

export default new AccountController()
