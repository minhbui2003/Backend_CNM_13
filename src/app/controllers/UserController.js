import User from '../models/User.js'
import Account from '../models/Account.js';
import Conversation from '../models/Conversation.js';
import { io } from '../../index.js';
import axios from 'axios';
import AWS from 'aws-sdk'
import path from 'path'
import multer from 'multer'
import dotenv from 'dotenv'
dotenv.config()
import uploadDefaultAvatar from '../../util/uploadDefaultAvatar.js'
import { v4 as uuidv4 } from 'uuid'

AWS.config.update({
    accessKeyId: process.env.Acces_Key,
    secretAccessKey: process.env.Secret_Acces_Key,
    region: process.env.Region,
})

const S3 = new AWS.S3()
const bucketname = process.env.s3_bucket

const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, '')
    },
})

export const upload = multer({
    storage: storage,
    limits: { fileSize: 2000000 },
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb)
    },
})

function checkFileType(file, callback) {
    const filetypes = /jpeg|jpg|png|gif/
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
const emitSocketEvent = async (room, event, payload) => {
    try {
        await axios.post('https://socket-cnm-13.onrender.com/api/emit-to-room', {
            room,
            event,
            payload
        });
    } catch (error) {
        console.error(`Lỗi khi emit sự kiện '${event}' tới phòng '${room}':`, error.message);
    }
};

function normalizePhoneNumberForSearch(phone) {
    if (typeof phone !== 'string') {
        return null;
    }
    let normalizedPhone = phone.trim();

    if (normalizedPhone.startsWith('0') && normalizedPhone.length === 10) {
        return '+84' + normalizedPhone.substring(1);
    }
    if (normalizedPhone.startsWith('84') && normalizedPhone.length === 11) {
        return '+' + normalizedPhone;
    }
    if (normalizedPhone.startsWith('+84') && normalizedPhone.length === 12) {
        return normalizedPhone;
    }
    return phone;
}

class UserController {
    async registerWeb(req, res) {
        const { account_id, firstName, lastName, phoneNumber: phoneNumberInput, dateOfBirth, gender } = req.body;

        const normalizedPhoneNumber = normalizePhoneNumberForSearch(phoneNumberInput);
        if (!normalizedPhoneNumber) {
            return res.status(400).json({ message: 'Số điện thoại không hợp lệ.' });
        }

        try {
            const existingUserByPhone = await User.findOne({ phoneNumber: normalizedPhoneNumber });
            if (existingUserByPhone) {
                return res.status(400).json({ message: 'Số điện thoại đã được đăng ký.' });
            }

            const userName = `${firstName} ${lastName}`;
            const avatar = uploadDefaultAvatar(lastName);

            const user = new User({
                account_id,
                userName,
                firstName,
                lastName,
                phoneNumber: normalizedPhoneNumber,
                dateOfBirth,
                gender,
                avatar,
            });

            await user.save();
            return res.status(200).json({
                message: 'Đăng ký User thành công!!!',
                phoneNumber: user.phoneNumber,
                user_id: user._id,
            });
        } catch (err) {
            console.error('Lỗi đăng ký User (Web):', err);
            if (err.code === 11000) {
                return res.status(400).json({ message: 'Thông tin (SĐT hoặc Account ID) đã được sử dụng.' });
            }
            return res.status(500).json({ message: 'Lỗi server khi đăng ký.' });
        }
    }

    async findUserByAccountIDWeb(req, res) {
        const { account_id } = req.body;
        try {
            const user = await User.findOne({ account_id: account_id });
            if (user) {
                return res.status(200).json({
                    message: 'Login successfully!!!',
                    user_id: user._id,
                });
            } else {
                return res.status(404).json({ message: 'User not found!!!' });
            }
        } catch (err) {
            console.error('Lỗi tìm user bằng Account ID (Web):', err);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    }

    async findUserByUserID(req, res) {
        const { user_id } = req.body;
        try {
            const user = await User.findById(user_id);
            if (user) {
                return res.status(200).json({
                    message: 'Tìm user thành công!!!',
                    user: user,
                });
            } else {
                return res.status(404).json({
                    message: 'Không tìm thấy user!!!',
                });
            }
        } catch (err) {
            console.error('Lỗi tìm user bằng User ID:', err);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    }

    async findAllUsersWeb(req, res) {
        try {
            const allUsers = await User.find();
            return res.status(200).json({ message: 'Tìm tất cả user thành công!!!', users: allUsers });
        } catch (err) {
            console.error('Lỗi tìm tất cả user (Web):', err);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    }

    async findUserByPhoneWeb(req, res) {
        const originalPhoneNumber = req.body.phoneNumber;
        if (!originalPhoneNumber) {
            return res.status(400).json({ message: 'Vui lòng cung cấp số điện thoại.' });
        }
        const normalizedPhone = normalizePhoneNumberForSearch(originalPhoneNumber);
        let user = null;
        try {
            if (normalizedPhone) {
                user = await User.findOne({ phoneNumber: normalizedPhone });
            }
            if (!user && originalPhoneNumber !== normalizedPhone) {
                user = await User.findOne({ phoneNumber: originalPhoneNumber });
            }
            if (user) {
                return res.status(200).json({
                    message: 'Tìm user thành công!!!',
                    user: user,
                });
            } else {
                return res.status(200).json({
                    message: 'Không tìm thấy user!!!',
                });
            }
        } catch (err) {
            console.error('Lỗi tìm user bằng SĐT (Web):', err);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    }

    async addFriendWeb(req, res) {
        const { user_id, friend_id } = req.body;
        try {
            const user = await User.findById(user_id);
            const friend = await User.findById(friend_id);

            if (!user || !friend) {
                return res.status(404).json({ message: 'User hoặc Friend không tồn tại.' });
            }

            if (user.friend.some(f => f.friend_id.toString() === friend_id.toString())) {
                return res.status(400).json({ message: 'Hai người đã là bạn bè.' });
            }

            user.friend.addToSet({ friend_id });
            friend.friend.addToSet({ friend_id: user_id });

            await user.save();
            await friend.save();
            return res.status(200).json({
                message: 'Thêm bạn bè thành công!!!',
                user: user,
                friend: friend,
            });
        } catch (err) {
            console.error('Lỗi thêm bạn bè (Web):', err);
            return res.status(500).json({ message: 'Không thể thêm bạn bè.' });
        }
    }

    async getUsersByIds(req, res) {
        const { userIds } = req.body; // Nhận mảng userIds từ body của request

        // Kiểm tra đầu vào
        if (!userIds || !Array.isArray(userIds)) {
            return res.status(400).json({ message: 'Đầu vào không hợp lệ, userIds phải là một mảng.' });
        }

        // Nếu mảng rỗng thì không cần truy vấn DB
        if (userIds.length === 0) {
            return res.status(200).json({
                message: 'Mảng ID rỗng.',
                users: []
            });
        }

        try {
            // Sử dụng toán tử $in của MongoDB để tìm tất cả user có _id nằm trong mảng userIds.
            // Đây là cách truy vấn rất hiệu quả.
            const users = await User.find({ '_id': { $in: userIds } })
                .select('-password -friend -friendRequests -sentFriendRequests -deleteFriend') // Loại bỏ các trường không cần thiết/nhạy cảm
                .lean(); // .lean() giúp truy vấn nhanh hơn và trả về object thuần túy

            // Trả về danh sách người dùng tìm được
            res.status(200).json({
                message: `Lấy thông tin của ${users.length} người dùng thành công!`,
                users: users,
            });

        } catch (error) {
            console.error('Lỗi khi lấy thông tin người dùng theo mảng ID:', error);
            res.status(500).json({ message: 'Lỗi máy chủ nội bộ', error: error.message });
        }
    }

    async deleteFriendWeb(req, res) {
        const { user_id, friend_id } = req.body;
        try {
            const user = await User.findById(user_id);
            const friend = await User.findById(friend_id);

            if (!user || !friend) {
                return res.status(404).json({ message: 'User hoặc Friend không tồn tại.' });
            }

            const deletedFriendInUser = user.friend.find(f => f.friend_id.toString() === friend_id.toString());
            const deletedUserInFriend = friend.friend.find(f => f.friend_id.toString() === user_id.toString());

            user.friend = user.friend.filter(f => f.friend_id.toString() !== friend_id.toString());
            if (deletedFriendInUser && !user.deleteFriend.some(df => df.friend_id.toString() === deletedFriendInUser.friend_id.toString())) {
                user.deleteFriend.push(deletedFriendInUser);
            }

            friend.friend = friend.friend.filter(f => f.friend_id.toString() !== user_id.toString());
            if (deletedUserInFriend && !friend.deleteFriend.some(df => df.friend_id.toString() === deletedUserInFriend.friend_id.toString())) {
                friend.deleteFriend.push(deletedUserInFriend);
            }

            await user.save();
            await friend.save();
            return res.status(200).json({
                message: 'Xóa bạn bè thành công!!!',
                user: user,
                friend: friend,
            });
        } catch (err) {
            console.error('Lỗi xóa bạn bè (Web):', err);
            return res.status(500).json({ message: 'Không thể xóa bạn bè.' });
        }
    }

    async showFriendRequests(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findById(userId)
                .populate('friendRequests', 'userName phoneNumber avatar')
                .lean();
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            return res.status(200).json(user.friendRequests || []);
        } catch (error) {
            console.error('Lỗi hiển thị lời mời đã nhận:', error);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    }

    async showSentFriendRequests(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findById(userId)
                .populate('sentFriendRequests', 'userName phoneNumber avatar')
                .lean();
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            return res.status(200).json(user.sentFriendRequests || []);
        } catch (error) {
            console.error('Lỗi hiển thị lời mời đã gửi:', error);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    }

    async getInfoFriendWeb(req, res) {
        const { friend_id } = req.body;
        try {
            const friend = await User.findById(friend_id).lean();
            if (friend) {
                const friendInfo = {
                    friend_id: friend._id,
                    friendName: friend.userName,
                    avatar: friend.avatar,
                    phoneNumber: friend.phoneNumber
                };
                return res.status(200).json({
                    message: 'Lấy thông tin friend thành công!!!',
                    friendInfo: friendInfo,
                });
            } else {
                return res.status(404).json({
                    message: 'Không tìm thấy friend!!!',
                });
            }
        } catch (err) {
            console.error('Lỗi lấy thông tin friend (Web):', err);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    }

    async ChangeImageAvatarWeb(req, res) {
        const user_id = req.body.user_id;
        if (!req.file) {
            return res.status(400).json({ message: 'Không có tệp nào được tải lên.' });
        }
        const image = req.file.originalname.split('.');
        const fileType = image[image.length - 1];
        const filePath = `${uuidv4() + Date.now().toString()}.${fileType}`;
        try {
            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
            }
            const params = {
                Bucket: bucketname, Key: filePath, Body: req.file.buffer, ContentType: req.file.mimetype,
            };
            S3.upload(params, async (err, data) => {
                if (err) {
                    console.error('Lỗi tải lên S3 (Avatar):', err);
                    return res.status(500).json({ message: 'Lỗi tải ảnh đại diện lên S3.' });
                }
                const ImageURL = data.Location;
                user.avatar = ImageURL;
                await user.save();
                return res.status(200).json({
                    message: 'Upload ảnh thành công!!!',
                    avatarURL: ImageURL,
                });
            });
        } catch (error) {
            console.error('Lỗi cập nhật ảnh đại diện (Web):', error);
            return res.status(500).json({ message: 'Lỗi server nội bộ.' });
        }
    }

    async changeImageCoverAvatarWeb(req, res) {
        try {
            const user_id = req.body.user_id;
            if (!req.file) {
                return res.status(400).json({ message: 'Không có tệp nào được tải lên.' });
            }
            const image = req.file.originalname.split('.');
            const fileType = image[image.length - 1];
            const filePath = `${uuidv4() + Date.now().toString()}.${fileType}`;
            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
            }
            const params = {
                Bucket: bucketname, Key: filePath, Body: req.file.buffer, ContentType: req.file.mimetype,
            };
            S3.upload(params, async (err, data) => {
                if (err) {
                    console.error('Lỗi khi tải tệp lên S3 (Cover):', err);
                    return res.status(500).json({ message: 'Tải ảnh bìa lên thất bại.' });
                }
                const imageURL = data.Location;
                user.coverImage = imageURL;
                await user.save();
                return res.status(200).json({
                    message: 'Cập nhật ảnh bìa thành công!',
                    coverPhotoURL: imageURL,
                });
            });
        } catch (error) {
            console.error('Lỗi trong hàm changeImageCoverWeb:', error);
            return res.status(500).json({ message: 'Lỗi server nội bộ.' });
        }
    }

    async updateUserWeb(req, res) {
        const user_id = req.body.user_id;
        const { userName, gender, dateOfBirth } = req.body;
        try {
            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng' });
            }
            const nameParts = userName.trim().split(' ');
            const lastName = nameParts.length > 1 ? nameParts.pop() : '';
            const firstName = nameParts.join(' ');

            user.userName = userName;
            user.firstName = firstName || user.firstName;
            user.lastName = lastName || user.lastName;
            if (gender) user.gender = gender;
            if (dateOfBirth) user.dateOfBirth = dateOfBirth;

            await user.save();
            return res.status(200).json({
                message: 'Cập nhật thông tin thành công!!!',
                user: user,
            });
        } catch (error) {
            console.error('Lỗi cập nhật thông tin (Web):', error);
            return res.status(500).json({ message: 'Lỗi server nội bộ' });
        }
    }

    async sendFriendRequestWeb(req, res) {
        const sender_id = req.body.user_id;
        const receiver_id = req.body.friend_id;
        try {
            const receiver = await User.findById(receiver_id);
            const sender = await User.findById(sender_id);

            if (!receiver || !sender) {
                return res.status(404).json({ message: 'Người dùng không tồn tại.' });
            }
            if (sender_id === receiver_id) {
                return res.status(400).json({ message: 'Bạn không thể tự gửi lời mời cho chính mình.' });
            }
            if (receiver.friend.some(f => f.friend_id.toString() === sender_id.toString())) {
                return res.status(400).json({ message: 'Hai người đã là bạn bè.' });
            }
            if (receiver.friendRequests.map(id => id.toString()).includes(sender_id.toString())) {
                return res.status(400).json({ message: 'Bạn đã gửi lời mời kết bạn cho người này rồi.' });
            }
            if (sender.friendRequests.map(id => id.toString()).includes(receiver_id.toString())) {
                return res.status(400).json({ message: 'Đối phương đã gửi lời mời kết bạn cho bạn. Hãy kiểm tra.' });
            }

            receiver.friendRequests.addToSet(sender_id);
            sender.sentFriendRequests.addToSet(receiver_id);

            await receiver.save();
            await sender.save();

            return res.status(200).json({
                message: 'Gửi yêu cầu kết bạn thành công!!!',
            });
        } catch (err) {
            console.error('Lỗi gửi lời mời kết bạn (Web):', err);
            return res.status(500).json({ message: 'Không thể gửi yêu cầu kết bạn.' });
        }
    }

    async cancelFriendRequestWeb(req, res) {
        const sender_id = req.body.user_id;
        const receiver_id = req.body.friend_id;
        try {
            const sender = await User.findById(sender_id);
            const receiver = await User.findById(receiver_id);
            if (!sender || !receiver) {
                return res.status(404).json({ message: 'Người dùng không tồn tại.' });
            }
            receiver.friendRequests = receiver.friendRequests.filter(
                (reqId) => reqId.toString() !== sender_id.toString()
            );
            sender.sentFriendRequests = sender.sentFriendRequests.filter(
                (reqId) => reqId.toString() !== receiver_id.toString()
            );
            await receiver.save();
            await sender.save();
            return res.status(200).json({
                message: 'Huỷ lời mời kết bạn thành công!!!',
            });
        } catch (err) {
            console.error('Lỗi hủy lời mời kết bạn (Web):', err);
            return res.status(500).json({ message: 'Không thể Huỷ lời mời kết bạn.' });
        }
    }

    async deleteFriendRequestWeb(req, res) {
        const decliner_id = req.body.user_id;
        const sender_id = req.body.friend_id;
        try {
            const decliner = await User.findById(decliner_id);
            const sender = await User.findById(sender_id);
            if (!decliner || !sender) {
                return res.status(404).json({ message: 'Người dùng không tồn tại.' });
            }
            decliner.friendRequests = decliner.friendRequests.filter(
                (reqId) => reqId.toString() !== sender_id.toString()
            );
            sender.sentFriendRequests = sender.sentFriendRequests.filter(
                (reqId) => reqId.toString() !== decliner_id.toString()
            );
            await decliner.save();
            await sender.save();
            return res.status(200).json({
                message: 'Từ chối lời mời kết bạn thành công!!!',
            });
        } catch (err) {
            console.error('Lỗi từ chối lời mời kết bạn (Web):', err);
            return res.status(500).json({ message: 'Không thể xóa lời mời kết bạn.' });
        }
    }

    async acceptFriendRequestWeb(req, res) {
        const acceptor_id = req.body.user_id;
        const sender_id = req.body.friend_id;
        try {
            const acceptor = await User.findById(acceptor_id);
            const sender = await User.findById(sender_id);
            if (!acceptor || !sender) {
                return res.status(404).json({ message: 'Người dùng không tồn tại.' });
            }

            if (acceptor.friend.some(f => f.friend_id.toString() === sender_id.toString())) {
                acceptor.friendRequests = acceptor.friendRequests.filter(reqId => reqId.toString() !== sender_id.toString());
                sender.sentFriendRequests = sender.sentFriendRequests.filter(reqId => reqId.toString() !== acceptor_id.toString());
                await acceptor.save();
                await sender.save();
                return res.status(400).json({ message: 'Hai người đã là bạn bè.' });
            }

            if (!acceptor.friendRequests.map(id => id.toString()).includes(sender_id.toString())) {
                return res.status(400).json({ message: 'Không có lời mời kết bạn nào từ người này để chấp nhận.' });
            }

            acceptor.friendRequests = acceptor.friendRequests.filter(
                (reqId) => reqId.toString() !== sender_id.toString()
            );
            sender.sentFriendRequests = sender.sentFriendRequests.filter(
                (reqId) => reqId.toString() !== acceptor_id.toString()
            );

            acceptor.friend.addToSet({ friend_id: sender_id });
            sender.friend.addToSet({ friend_id: acceptor_id });

            await acceptor.save();
            await sender.save();

            return res.status(200).json({
                message: 'Đã chấp nhận yêu cầu kết bạn!!!',
                user: acceptor,
                friend: sender,
            });
        } catch (err) {
            console.error('Lỗi chấp nhận lời mời kết bạn (Web):', err);
            return res.status(500).json({ message: 'Không thể chấp nhận yêu cầu kết bạn.' });
        }
    }

    async getInfoByUserIDWeb(req, res) {
        const user_id_to_find = req.body.sender_id;
        try {
            const user = await User.findById(user_id_to_find).lean();
            if (user) {
                return res.status(200).json({
                    message: 'Lấy thông tin thành công!!!',
                    avatar: user.avatar,
                    name: user.userName,
                });
            } else {
                return res.status(404).json({
                    message: 'Không tìm thấy user!!!',
                });
            }
        } catch (err) {
            console.error('Lỗi lấy thông tin user bằng ID (Web):', err);
            return res.status(500).json({ message: 'Lỗi server.' });
        }
    }

    async register(req, res) {
        const { account_id, conversation_id, userName, firstName, lastName, phoneNumber, dateOfBirth, gender, avatar, coverImage } = req.body;
        const normalizedPhoneNumber = normalizePhoneNumberForSearch(phoneNumber);
        try {
            const existingUser = await User.findOne({ phoneNumber: normalizedPhoneNumber });
            if (existingUser) {
                return res.status(400).json({ message: 'Số điện thoại đã được đăng ký' });
            }
            const user = new User({
                account_id, conversation_id, userName, firstName, lastName,
                phoneNumber: normalizedPhoneNumber,
                dateOfBirth, gender, avatar, coverImage,
            });
            await user.save();
            return res.status(200).json({ message: 'Register successfully!!!', user_id: user._id });
        } catch (err) {
            console.error('Lỗi đăng ký (Mobile):', err);
            return res.status(500).json(err);
        }
    }

    async findAllUsers(req, res) {
        try {
            const users = await User.find().lean();
            return res.json(users);
        } catch (err) {
            console.error('Lỗi tìm tất cả user (Mobile):', err);
            return res.status(500).json(err);
        }
    }

    async findUserByAccountID(req, res) {
        const { account_id } = req.query;
        try {
            const user = await User.findOne({ account_id: account_id }).lean();
            if (user) {
                return res.json(user);
            } else {
                return res.status(404).json({ message: 'User not found!!!' });
            }
        } catch (err) {
            console.error('Lỗi tìm user bằng Account ID (Mobile):', err);
            return res.status(500).json(err);
        }
    }

    async addFriend(req, res) {
        const { user_id } = req.query; // ID của người thực hiện
        const { friend_id } = req.body; // ID của người muốn kết bạn trực tiếp (trong model là account_id)
        // Sửa lại để dùng friend_id thay vì account_id cho nhất quán
        try {
            const user = await User.findById(user_id);
            const friendToAdd = await User.findById(friend_id); // Tìm người bạn bằng _id
            if (!user || !friendToAdd) {
                return res.status(404).json({ message: 'User hoặc người muốn kết bạn không tồn tại.' });
            }
            if (user.friend.some(f => f.friend_id.toString() === friend_id.toString())) {
                return res.status(400).json({ message: 'Hai người đã là bạn bè.' });
            }
            user.friend.addToSet({ friend_id: friend_id });
            friendToAdd.friend.addToSet({ friend_id: user_id });
            await user.save();
            await friendToAdd.save();
            return res.json('Add friend successfully!!!');
        } catch (err) {
            console.error('Lỗi thêm bạn (Mobile):', err);
            return res.status(500).json(err);
        }
    }

    async getInfoFriend(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findById(userId).lean();
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            const friendIds = user.friend.map((friend) => friend.friend_id);
            const friends = await User.find(
                { _id: { $in: friendIds } },
                'userName phoneNumber avatar lastName'
            ).lean();
            return res.status(200).json(friends);
        } catch (error) {
            console.error('Lỗi lấy danh sách bạn bè (Mobile):', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    async GetAllUsers(req, res) {
        const { currentUserId } = req.query; // Sửa account_id thành currentUserId cho rõ ràng
        try {
            if (!currentUserId) {
                return res.status(400).json({ message: 'Thiếu currentUserId' });
            }
            const users = await User.find({ _id: { $ne: currentUserId } }).lean(); // Tìm tất cả user khác currentUserId
            return res.status(200).json(users);
        } catch (err) {
            console.error('Lỗi lấy tất cả user (Mobile):', err);
            return res.status(500).json('Error retrieving users');
        }
    }

    async updateInfo(req, res) {
        const { user_id } = req.query; // Nên dùng user_id thay vì account_id để cập nhật
        const { gender, firstName, lastName, dateOfBirth } = req.body;
        try {
            const user = await User.findById(user_id);
            if (user) {
                if (gender) user.gender = gender;
                if (firstName) user.firstName = firstName;
                if (lastName) user.lastName = lastName;
                if (firstName && lastName) user.userName = `${firstName} ${lastName}`;
                else if (firstName) user.userName = `${firstName} ${user.lastName}`;
                else if (lastName) user.userName = `${user.firstName} ${lastName}`;
                if (dateOfBirth) user.dateOfBirth = dateOfBirth;

                await user.save();
                return res.json('Update info successfully!!!');
            } else {
                return res.status(404).json('User doesn`t exits !!!');
            }
        } catch (err) {
            console.error('Lỗi cập nhật thông tin (Mobile):', err);
            return res.status(500).json(err);
        }
    }

    async updateAvatar(req, res) { // Giả sử API này nhận user_id và URL avatar mới
        const { user_id } = req.query;
        const { avatarUrl } = req.body; // Giả sử client gửi avatarUrl
        try {
            const user = await User.findById(user_id);
            if (user) {
                user.avatar = avatarUrl;
                await user.save();
                return res.json('Update avatar successfully!!!');
            } else {
                return res.status(404).json('User doesn`t exits !!!');
            }
        } catch (err) {
            console.error('Lỗi cập nhật avatar (Mobile):', err);
            return res.status(500).json(err);
        }
    }

    async updateCoverImage(req, res) { // Giả sử API này nhận user_id và URL coverImage mới
        const { user_id } = req.query;
        const { coverImageUrl } = req.body; // Giả sử client gửi coverImageUrl
        try {
            const user = await User.findById(user_id);
            if (user) {
                user.coverImage = coverImageUrl;
                await user.save();
                return res.json('Update cover image successfully!!!');
            } else {
                return res.status(404).json('User doesn`t exits !!!');
            }
        } catch (err) {
            console.error('Lỗi cập nhật ảnh bìa (Mobile):', err);
            return res.status(500).json(err);
        }
    }

    async findUserByUserIDMobile(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findById(userId)
                .select('userName phoneNumber avatar')
                .lean();
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng' });
            }
            return res.status(200).json(user);
        } catch (err) {
            console.error('Lỗi tìm người dùng bằng ID (Mobile):', err);
            return res.status(500).json({ message: 'Internal server error', error: err.message });
        }
    }

    async findUserByPhoneNumber(req, res) {
        const { phoneNumber } = req.params;
        const normalizedPhone = normalizePhoneNumberForSearch(phoneNumber);
        try {
            const user = await User.findOne({ phoneNumber: normalizedPhone }).lean();
            if (user) {
                return res.status(200).json(user);
            } else {
                return res.status(404).json({ message: 'User not found' });
            }
        } catch (err) {
            console.error('Lỗi tìm user bằng SĐT (Mobile/Params):', err);
            return res.status(500).json({ message: 'Error retrieving user' });
        }
    }

    async acceptFriendRequest(req, res) {
        try {
            const acceptor_id = req.body.user_id;
            const sender_id = req.body.friend_id;

            const acceptor = await User.findById(acceptor_id);
            const sender = await User.findById(sender_id);

            if (!acceptor || !sender) {
                return res.status(404).json({ message: 'Người dùng không tồn tại' });
            }

            // Kiểm tra đã là bạn bè chưa
            if (acceptor.friend.some(f => f.friend_id.toString() === sender_id)) {
                acceptor.friendRequests = acceptor.friendRequests.filter(id => id.toString() !== sender_id);
                sender.sentFriendRequests = sender.sentFriendRequests.filter(id => id.toString() !== acceptor_id);
                await acceptor.save();
                await sender.save();
                return res.status(400).json({ message: 'Hai người đã là bạn bè.' });
            }

            // Kiểm tra lời mời có tồn tại không
            if (!acceptor.friendRequests.map(id => id.toString()).includes(sender_id)) {
                return res.status(400).json({ message: 'Không có lời mời kết bạn nào từ người này.' });
            }

            // Xóa lời mời
            acceptor.friendRequests = acceptor.friendRequests.filter(id => id.toString() !== sender_id);
            sender.sentFriendRequests = sender.sentFriendRequests.filter(id => id.toString() !== acceptor_id);

            // Cập nhật danh sách bạn bè
            acceptor.friend.push({ friend_id: sender_id });
            sender.friend.push({ friend_id: acceptor_id });

            // Tạo hội thoại nếu chưa có
            let conversation = await Conversation.findOne({
                members: { $all: [acceptor_id, sender_id] },
                $expr: { $eq: [{ $size: "$members" }, 2] }
            });

            if (!conversation) {
                conversation = new Conversation({ members: [acceptor_id, sender_id] });
                await conversation.save();
            }

            const conversation_id = conversation._id;

            // Cập nhật conversation_id cho người dùng
            if (!acceptor.conversation_id.some(c => c.conversation_id.toString() === conversation_id.toString())) {
                acceptor.conversation_id.push({ conversation_id });
            }

            if (!sender.conversation_id.some(c => c.conversation_id.toString() === conversation_id.toString())) {
                sender.conversation_id.push({ conversation_id });
            }

            await acceptor.save();
            await sender.save();

            // Gửi socket event
            io.to(acceptor_id.toString()).emit('friend_accepted', { friend: sender, conversationId: conversation_id });
            io.to(sender_id.toString()).emit('friend_accepted', { friend: acceptor, conversationId: conversation_id });

            io.to(acceptor_id.toString()).emit('new_conversation', conversation);
            io.to(sender_id.toString()).emit('new_conversation', conversation);

            return res.status(200).json({
                message: 'Đã chấp nhận yêu cầu kết bạn!',
                user: acceptor,
                friend: sender,
                conversation,
            });

        } catch (err) {
            console.error('Lỗi chấp nhận yêu cầu kết bạn:', err);
            return res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }


    async rejectFriendRequest(req, res) {
        try {
            const decliner_id = req.body.user_id;
            const sender_id = req.body.friend_id;
            const decliner = await User.findById(decliner_id);
            const sender = await User.findById(sender_id);

            if (!decliner || !sender) {
                return res.status(404).json({ message: 'Người dùng không tồn tại.' });
            }
            decliner.friendRequests = decliner.friendRequests.filter(
                (reqId) => reqId.toString() !== sender_id.toString()
            );
            sender.sentFriendRequests = sender.sentFriendRequests.filter(
                (reqId) => reqId.toString() !== decliner_id.toString()
            );
            await decliner.save();
            await sender.save();
            return res.status(200).json({
                message: 'Từ chối lời mời kết bạn thành công!!!',
            });
        } catch (err) {
            console.error('Lỗi từ chối yêu cầu kết bạn (Mobile):', err);
            return res.status(500).json({ message: 'Internal server error', error: err.message });
        }
    }

    async cancelFriendRequest(req, res) {
        const sender_id = req.body.user_id;
        const receiver_id = req.body.friend_id;
        try {
            const sender = await User.findById(sender_id);
            const receiver = await User.findById(receiver_id);
            if (!sender || !receiver) {
                return res.status(404).json({ message: 'Người dùng không tồn tại.' });
            }
            receiver.friendRequests = receiver.friendRequests.filter(
                (reqId) => reqId.toString() !== sender_id.toString()
            );
            sender.sentFriendRequests = sender.sentFriendRequests.filter(
                (reqId) => reqId.toString() !== receiver_id.toString()
            );
            await receiver.save();
            await sender.save();
            return res.status(200).json({
                message: 'Huỷ lời mời kết bạn thành công!!!',
            });
        } catch (err) {
            console.error('Lỗi hủy lời mời kết bạn (Mobile):', err);
            return res.status(500).json({ message: 'Không thể Huỷ lời mời kết bạn.' });
        }
    }

    async deleteFriend(req, res) {
        const { userId, friendId } = req.body;
        try {
            const user = await User.findById(userId);
            const friend = await User.findById(friendId);
            if (!user || !friend) {
                return res.status(404).json({ message: 'Người dùng không tồn tại' });
            }
            user.friend = user.friend.filter(f => f.friend_id.toString() !== friendId.toString());
            friend.friend = friend.friend.filter(f => f.friend_id.toString() !== userId.toString());
            await user.save();
            await friend.save();
            return res.status(200).json({ message: 'Đã xóa bạn bè thành công' });
        } catch (err) {
            console.error('Lỗi xóa bạn bè (Mobile):', err);
            return res.status(500).json({ message: 'Internal server error', error: err.message });
        }
    }

    async deleteAccount(req, res) {
        const { account_id } = req.query; // Sửa lại để nhất quán với các hàm khác
        try {
            const user = await User.findOne({ account_id: account_id });
            if (!user) return res.status(404).json({ message: 'User not found' });
            user.deleted = true;
            user.deletedAt = Date.now();
            await user.save();
            return res.status(200).json({ message: 'Delete account successfully' });
        } catch (error) {
            console.error('Lỗi xóa tài khoản:', error);
            return res.status(500).json({ message: 'Error deleting account' });
        }
    }

    async undoDeleteAccount(req, res) {
        const { account_id } = req.query;
        try {
            const user = await User.findOne({ account_id: account_id });
            if (!user) return res.status(404).json({ message: 'User not found' });
            user.deleted = false;
            user.deletedAt = null;
            await user.save();
            return res.status(200).json({ message: 'Undo delete account successfully' });
        } catch (error) {
            console.error('Lỗi hoàn tác xóa tài khoản:', error);
            return res.status(500).json({ message: 'Error undo delete account' });
        }
    }

    async deleteAccountAfter30Days(req, res) {
        const { account_id } = req.query;
        try {
            const user = await User.findOne({ account_id: account_id });
            if (!user) return res.status(404).json({ message: 'User not found' });

            user.phoneNumber = `${user.phoneNumber}_deleted_${Date.now()}`;
            user.avatar = 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1716562765/zfooawvf7n83qtkhh0by.jpg';
            user.userName = 'Tài khoản người dùng';
            user.account_id = `${user.account_id}_deleted_${Date.now()}`;
            await user.save();
            return res.status(200).json({ message: 'Delete account permanently successfully' });
        } catch (error) {
            console.error('Lỗi xóa tài khoản vĩnh viễn:', error);
            return res.status(500).json({ message: 'Error deleting account permanently' });
        }
    }

    async changeNewPhoneNumber(req, res) {
        const { account_id, newPhoneNumber: newPhoneNumberInput } = req.body;
        const normalizedNewPhoneNumber = normalizePhoneNumberForSearch(newPhoneNumberInput);
        if (!normalizedNewPhoneNumber) {
            return res.status(400).json({ message: 'Số điện thoại mới không hợp lệ.' });
        }
        try {
            const user = await User.findOne({ account_id: account_id });
            if (user) {
                if (user.phoneNumber === normalizedNewPhoneNumber) {
                    return res.status(400).json({ message: "Số điện thoại mới phải khác số điện thoại hiện tại." });
                }
                const existingUserWithNewPhone = await User.findOne({ phoneNumber: normalizedNewPhoneNumber });
                if (existingUserWithNewPhone && existingUserWithNewPhone._id.toString() !== user._id.toString()) {
                    return res.status(400).json({ message: "Số điện thoại mới đã được người khác sử dụng." });
                }
                user.phoneNumber = normalizedNewPhoneNumber;
                await user.save();
                return res.json({ message: 'Change new phone number successfully!!!' });
            } else {
                return res.status(404).json({ message: 'User doesn`t exits !!!' });
            }
        } catch (err) {
            console.error('Lỗi đổi SĐT:', err);
            return res.status(500).json(err);
        }
    }

    async friendRequest(req, res) { // This is a generic mobile function, distinct from sendFriendRequestWeb
        const { currentUserId, selectedUserId } = req.body;
        try {
            const currentUser = await User.findById(currentUserId);
            const selectedUser = await User.findById(selectedUserId);

            if (!currentUser || !selectedUser) {
                return res.status(404).json({ message: 'User not found' });
            }
            if (currentUserId === selectedUserId) {
                return res.status(400).json({ message: 'Không thể tự gửi lời mời cho chính mình.' });
            }
            if (currentUser.friend.some(f => f.friend_id.toString() === selectedUserId.toString())) {
                return res.status(400).json({ message: 'Hai người đã là bạn bè.' });
            }
            if (selectedUser.friendRequests.map(id => id.toString()).includes(currentUserId.toString())) {
                return res.status(400).json({ message: 'Yêu cầu đã được gửi trước đó.' });
            }
            if (currentUser.friendRequests.map(id => id.toString()).includes(selectedUserId.toString())) {
                return res.status(400).json({ message: 'Đối phương đã gửi lời mời cho bạn. Hãy kiểm tra.' });
            }

            await User.findByIdAndUpdate(selectedUserId, {
                $addToSet: { friendRequests: currentUserId },
            });
            await User.findByIdAndUpdate(currentUserId, {
                $addToSet: { sentFriendRequests: selectedUserId },
            });
            return res.sendStatus(200);
        } catch (err) {
            console.error('Lỗi friendRequest (Mobile):', err);
            return res.sendStatus(500);
        }
    }

    async registerMobile(req, res) {
        const { account_id, userName, firstName, lastName, phoneNumber, dateOfBirth, gender, avatar, coverImage } = req.body;
        const normalizedPhoneNumber = normalizePhoneNumberForSearch(phoneNumber);
        if (!normalizedPhoneNumber) {
            return res.status(400).json({ message: 'Số điện thoại không hợp lệ.' });
        }
        try {
            const existingUser = await User.findOne({ phoneNumber: normalizedPhoneNumber });
            if (existingUser) {
                return res.status(400).json({ message: 'Số điện thoại đã được đăng ký' });
            }
            const account = await Account.findById(account_id);
            if (!account) {
                return res.status(400).json({ message: 'Tài khoản không tồn tại' });
            }
            const defaultAvatar = (!avatar || avatar === 'https://via.placeholder.com/150') ? uploadDefaultAvatar(lastName) : avatar;
            const user = new User({
                account_id, userName, firstName, lastName,
                phoneNumber: normalizedPhoneNumber,
                dateOfBirth, gender, avatar: defaultAvatar, coverImage: coverImage || null,
            });
            await user.save();
            return res.status(200).json({
                message: 'Đăng ký hồ sơ người dùng thành công!!!',
                user_id: user._id,
                phoneNumber: user.phoneNumber,
            });
        } catch (err) {
            console.error('Lỗi đăng ký hồ sơ người dùng mobile:', err);
            if (err.code === 11000) {
                return res.status(400).json({ message: 'Thông tin (SĐT hoặc Account ID) đã được sử dụng.' });
            }
            return res.status(500).json({ message: 'Đăng ký hồ sơ người dùng thất bại', error: err.message });
        }
    }

    async friendRequestMobile(req, res) {
        const { currentUserId, selectedUserId } = req.body;
        try {
            const currentUser = await User.findById(currentUserId);
            const selectedUser = await User.findById(selectedUserId);
            if (!currentUser || !selectedUser) {
                return res.status(404).json({ message: 'User not found' });
            }
            if (currentUserId === selectedUserId) {
                return res.status(400).json({ message: 'Không thể tự gửi lời mời cho chính mình.' });
            }
            const isFriend = currentUser.friend.some(f => f.friend_id.toString() === selectedUserId.toString());
            if (isFriend) {
                return res.status(400).json({ message: 'Đã là bạn bè' });
            }
            if (selectedUser.friendRequests.map(id => id.toString()).includes(currentUserId.toString())) {
                return res.status(400).json({ message: 'Yêu cầu đã được gửi trước đó' });
            }
            if (currentUser.friendRequests.map(id => id.toString()).includes(selectedUserId.toString())) {
                return res.status(400).json({ message: 'Đối phương đã gửi lời mời cho bạn. Hãy kiểm tra.' });
            }

            selectedUser.friendRequests.addToSet(currentUserId);
            currentUser.sentFriendRequests.addToSet(selectedUserId);
            await selectedUser.save();
            await currentUser.save();
            return res.status(200).json({ message: 'Gửi yêu cầu kết bạn thành công' });
        } catch (err) {
            console.error('Lỗi gửi yêu cầu kết bạn (Mobile):', err);
            return res.status(500).json({ message: 'Internal server error', error: err.message });
        }
    }

    async showFriendRequestsMobile(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findOne({ $or: [{ _id: userId }, { account_id: userId }] })
                .populate('friendRequests', 'userName phoneNumber avatar')
                .lean();
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            return res.status(200).json(user.friendRequests || []);
        } catch (error) {
            console.error('Lỗi hiển thị yêu cầu kết bạn (Mobile):', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    async showSentFriendRequestsMobile(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findOne({ $or: [{ _id: userId }, { account_id: userId }] })
                .populate('sentFriendRequests', 'userName phoneNumber avatar')
                .lean();
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            return res.status(200).json(user.sentFriendRequests || []);
        } catch (error) {
            console.error('Lỗi hiển thị yêu cầu đã gửi (Mobile):', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }

    async findAllExceptCurrentUser(req, res) {
        try {
            const { currentUserId } = req.query;
            if (!currentUserId) {
                return res.status(400).json({ message: 'Thiếu currentUserId trong query' });
            }
            const currentUser = await User.findById(currentUserId).lean();
            if (!currentUser) {
                return res.status(404).json({ message: 'User not found' });
            }
            const users = await User.find({
                _id: { $ne: currentUserId },
                'friend.friend_id': { $ne: currentUserId }
            })
                .select('userName phoneNumber avatar')
                .lean();
            return res.status(200).json(users);
        } catch (err) {
            console.error('Lỗi tìm tất cả người dùng (Mobile):', err);
            return res.status(500).json({ message: 'Internal server error', error: err.message });
        }
    }
}

export default new UserController();