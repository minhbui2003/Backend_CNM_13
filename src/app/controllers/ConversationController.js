import Conversation from '../models/Conversation.js'
import User from '../models/User.js'
import Message from '../models/Message.js';
import axios from 'axios';
import { emitGroupEvent } from '../../util/socketClient.js';
import { v4 as uuidv4 } from 'uuid'
import AWS from 'aws-sdk'
import path from 'path'
import multer from 'multer'
import dotenv from 'dotenv'
dotenv.config()
import mongoose from 'mongoose';
import { io } from '../../../src/index.js';
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
        await axios.post('https://77bc-171-250-162-139.ngrok-free.app', {
            room,
            event,
            payload
        });
    } catch (error) {
        console.error(`Lỗi khi emit sự kiện '${event}' tới phòng '${room}':`, error.message);
    }
};

async function createSystemNotification(conversationId, actorUserId, contentText) {
    try {
        const actor = await User.findById(actorUserId).lean();
        const fullContent = actor ? `${actor.userName} ${contentText}` : contentText;
        const notificationMessage = new Message({
            conversation_id: conversationId,
            senderId: actorUserId,
            contentType: 'notify',
            content: fullContent,
        });
        await notificationMessage.save();
        emitGroupEvent(conversationId, 'receive-message', notificationMessage.toObject());
    } catch (error) {
        console.error("Lỗi tạo tin nhắn thông báo hệ thống:", error);
    }
}

class ConversationController {
    async updateConversationAvatarWeb(req, res) {
        try {
            const { conversation_id, user_id } = req.body;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ message: 'Không có file được gửi lên.' });
            }

            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm.' });
            }

            // Kiểm tra quyền cập nhật avatar
            if (
                conversation.groupLeader.toString() !== user_id &&
                !(conversation.deputyLeader || []).includes(user_id)
            ) {
                return res.status(403).json({ message: 'Bạn không có quyền cập nhật avatar nhóm.' });
            }

            // Upload file lên S3
            const params = {
                Bucket: bucketname,
                Key: `conversationAvatars/${Date.now()}_${file.originalname}`,
                Body: file.buffer,
                ContentType: file.mimetype,
                ACL: 'public-read',
            };

            const uploadResult = await S3.upload(params).promise();
            conversation.avatar = uploadResult.Location;
            await conversation.save();

            const message = new Message({
                conversation_id,
                senderId: user_id,
                contentType: 'notify',
                content: `đã cập nhật avatar nhóm.`,
            });
            await message.save();

            emitGroupEvent(conversation_id, 'avatar-updated', {
                conversationId: conversation_id,
                avatar: uploadResult.Location,
            });

            return res.status(200).json({
                message: 'Cập nhật avatar thành công',
                avatarUrl: uploadResult.Location,
                conversation,
            });
        } catch (err) {
            console.error('Lỗi updateConversationAvatarWeb:', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }

    // post createConversationsWeb http://localhost:3001/conversation/createConversationsWeb
    async createConversationsWeb(req, res) {
        const user_id = req.body.user_id
        const friend_id = req.body.friend_id
        if (!user_id || !friend_id) {
            console.log('Không tìm thấy user_id hoặc friend_id!!!')
            return res.status(200).json({
                message: 'Không tìm thấy user_id hoặc friend_id!!!',
            })
        }

        const members = [user_id, friend_id] // sửa từ member thành members

        const conversation = new Conversation({
            members, // sửa từ member thành members
        })
        // kiểm tra trong database xem đã tồn tại conversation nào chứa 2 giá trị trong members chưa
        const checkConversation = await Conversation.find({
            members: { $all: members }, // sửa từ member thành members
        })
        if (checkConversation.length > 0) {
            // console.log('Conversation đã tồn tại!!!')
            return res.status(200).json({
                message: 'Conversation đã tồn tại!!!',
                conversation: checkConversation[0],
            })
        }
        await conversation
            .save()
            .then(() => {
                console.log('Tạo conversation thành công!!!')
                emitGroupEvent(conversation._id, 'new-conversation', { conversation });
                return res.status(200).json({
                    message: 'Tạo conversation thành công!!!',
                    conversation: conversation,
                })
            })
            .catch((err) => {
                console.error(err) // log lỗi
                return res.status(200).json({
                    message: 'Lỗi khi tạo conversation!!!',
                    error: err.message, // thêm chi tiết lỗi
                })
            })
    }

    // api get all conversations từ user_id
    async getConversationsByUserIDWeb(req, res) {
        const user_id = req.body.user_id
        try {
            const conversation = await Conversation.find({
                members: { $all: [user_id] },
            })
            const list_conversation = conversation.map(
                (conversation) => conversation._id
            )
            res.status(200).json({
                message: 'Lấy all conversation thành công!!!',
                conversation: list_conversation,
            })
        } catch (err) {
            res.status(500).json(err)
        }
    }

    // api xây dựng 1 conversation chỉ có 1 thành viên là bản thân giống như cloud của tôi
    async createMyCloudConversationWeb(req, res) {
        //console.log('đã vào createMyCloudConversationWeb')
        const user_id = req.body.user_id
        const conversationName = 'Cloud của tôi'
        const avatar =
            'https://res-zalo.zadn.vn/upload/media/2021/6/4/2_1622800570007_369788.jpg'
        // kiểm tra xem đã có conversation nào có member là user_id và conversationName tên là 'Cloud của tôi' chưa nếu có thì trả về thông báo
        const checkConversation = await Conversation.find({
            members: { $all: [user_id] },
            conversationName: conversationName,
        })
        if (checkConversation.length > 0) {
            return res.status(200).json({
                message: 'ConversationCloud đã tồn tại!!!',
                conversation: checkConversation[0],
            })
        } else {
            const conversation = new Conversation({
                members: [user_id],
                conversationName,
                avatar,
            })
            await conversation
                .save()
                .then(() => {
                    console.log('Tạo conversation thành công!!!')
                    emitGroupEvent(conversation._id, 'new-cloud-conversation', { conversation });

                    return res.status(200).json({
                        message: 'Tạo ConversationCloud thành công!!!',
                        conversation: conversation,
                    })
                })
                .catch((err) => {
                    console.error(err) // log lỗi
                    return res.status(200).json({
                        message: 'Lỗi khi tạo conversation!!!',
                        error: err.message, // thêm chi tiết lỗi
                    })
                })
        }
    }

    //api tạo nhóm trò chuyện
    async createConversationsGroupWeb(req, res) {
        const user_id_creator = req.body.user_id; // ID của người tạo, cũng là trưởng nhóm
        const friend_ids = req.body.friend_ids;
        const conversationName = req.body.conversationName;

        if (!user_id_creator || !friend_ids || !Array.isArray(friend_ids) || friend_ids.length === 0) {
            console.log('Không tìm thấy user_id hoặc friend_ids không hợp lệ!!!');
            return res.status(400).json({ // Nên dùng 400 Bad Request cho lỗi đầu vào
                message: 'Không tìm thấy user_id hoặc friend_ids không hợp lệ!!!',
            });
        }
        if (!conversationName || conversationName.trim() === '') {
            return res.status(400).json({ message: 'Tên nhóm không được để trống.' });
        }
        // Giả sử nhóm cần ít nhất 3 người (1 người tạo + 2 người bạn)
        if (friend_ids.length < 2) {
            return res.status(400).json({ message: 'Nhóm phải có ít nhất 3 thành viên (bao gồm bạn).' });
        }


        const members = [user_id_creator, ...friend_ids];

        try {
            const creator = await User.findById(user_id_creator).lean();
            if (!creator) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng tạo nhóm.' });
            }
            const actualGroupLeaderName = creator.userName; // Lấy userName của người tạo

            const conversation = new Conversation({
                members,
                groupLeader: user_id_creator,
                conversationName,
            });

            await conversation.save();

            console.log('Tạo conversationGroup thành công!!!');
            if (typeof emitGroupEvent === 'function') {
                emitGroupEvent(conversation._id.toString(), 'group-created', {
                    conversationId: conversation._id.toString(),
                    conversationName: conversation.conversationName,
                    creatorName: actualGroupLeaderName, // SỬA Ở ĐÂY
                    members: conversation.members,
                    groupLeader: conversation.groupLeader
                });
            } else {
                console.warn("emitGroupEvent is not a function or not available.");
            }

            return res.status(200).json({
                message: 'Tạo conversationGroup thành công!!!',
                conversation: conversation,
            });

        } catch (err) {
            console.error('Lỗi khi tạo conversationGroup:', err);
            return res.status(500).json({ // Dùng 500 Internal Server Error cho lỗi server
                message: 'Lỗi khi tạo conversation!!!',
                error: err.message,
            });
        }
    }

    // xây dựng 1 api thêm thành viên nhóm addMemberToConversationGroupWeb
    async addMemberToConversationGroupWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const friend_ids = req.body.friend_ids; // Mảng các ID người dùng cần thêm
        const actor_user_id = req.body.user_id; // ID của người thực hiện hành động (nên là req.user.id từ JWT)

        try {
            let conversation = await Conversation.findOne({ _id: conversation_id });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }

            // Logic kiểm tra quyền thêm thành viên của bạn (ví dụ: chỉ trưởng/phó nhóm)
            // Ví dụ: if (conversation.groupLeader.toString() !== actor_user_id && !conversation.deputyLeader.includes(actor_user_id)) {
            //     return res.status(403).json({ message: 'Bạn không có quyền thêm thành viên' });
            // }

            const checkMembers = conversation.members.filter((member) =>
                friend_ids.includes(member.toString())
            );
            if (checkMembers.length > 0) {
                const alreadyInGroupNames = (await User.find({ _id: { $in: checkMembers } }).select('userName').lean()).map(u => u.userName).join(', ');
                return res.status(200).json({
                    message: `Thành viên: ${alreadyInGroupNames} đã có trong nhóm!!!`,
                });
            }

            const updatedConversation = await Conversation.findOneAndUpdate(
                { _id: conversation_id },
                { $addToSet: { members: { $each: friend_ids } } }, // $addToSet để tránh trùng lặp
                { new: true }
            ).populate('members', 'userName _id avatar');

            if (!updatedConversation) { // Kiểm tra lại sau khi update
                return res.status(404).json({ message: 'Conversation not found after update' });
            }

            // 💬 Tạo thông báo hệ thống
            const addedUsers = await User.find({ _id: { $in: friend_ids } }).select('userName').lean();
            const addedUserNames = addedUsers.map(u => u.userName).join(', ');
            await createSystemNotification(conversation_id, actor_user_id, `đã thêm ${addedUserNames} vào nhóm.`);

            // 📢 SOCKET: Thông báo cập nhật metadata nhóm và thành viên mới được thêm
            emitSocketEvent(conversation_id, 'group-metadata-updated', {
                conversationId: conversation_id,
                updatedData: { members: updatedConversation.members },
                actionTaker: { id: actor_user_id, name: (await User.findById(actor_user_id).lean())?.userName },
                addedMembersInfo: addedUsers.map(u => ({ _id: u._id, userName: u.userName }))
            });

            return res.status(200).json({
                message: 'Thêm thành viên vào nhóm thành công!!!',
                conversation: updatedConversation,
            });
        } catch (error) {
            console.error("Lỗi thêm thành viên:", error);
            res.status(500).json({ message: error.message });
        }
    }

    // api xoá thành viên nhóm trong member , nếu
    async removeMemberFromConversationGroupWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const user_id_performing_action = req.body.user_id; // Người thực hiện (nên là req.user.id)
        const friend_id_to_remove = req.body.friend_id; // Người bị xóa

        try {
            const conversation = await Conversation.findOne({ _id: conversation_id });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }

            // Logic kiểm tra quyền xóa của bạn
            if (conversation.groupLeader.toString() !== user_id_performing_action &&
                !(conversation.deputyLeader && conversation.deputyLeader.map(id => id.toString()).includes(user_id_performing_action))
            ) {
                return res.status(200).json({ // Nên là 403 Forbidden
                    message: 'Bạn không có quyền xóa thành viên khỏi nhóm!!!',
                });
            }
            if (conversation.groupLeader.toString() === friend_id_to_remove) {
                return res.status(200).json({ // Nên là 400 Bad Request
                    message: 'Trưởng nhóm không thể bị xóa khỏi nhóm!!!',
                });
            }
            // Phó nhóm không thể xóa phó nhóm khác hoặc trưởng nhóm (bạn có thể thêm logic này)
            if (conversation.deputyLeader && conversation.deputyLeader.map(id => id.toString()).includes(user_id_performing_action) &&
                conversation.deputyLeader.map(id => id.toString()).includes(friend_id_to_remove)
            ) {
                return res.status(200).json({ message: 'Phó nhóm không có quyền xóa phó nhóm khác.' });
            }


            const updatedConversation = await Conversation.findOneAndUpdate(
                { _id: conversation_id },
                {
                    $pull: {
                        members: friend_id_to_remove,
                        deputyLeader: friend_id_to_remove // Cũng xóa khỏi phó nhóm nếu là phó nhóm
                    }
                },
                { new: true }
            ).populate('members', 'userName _id avatar').populate('deputyLeaders', 'userName _id avatar'); //Sửa: deputyLeaders

            if (!updatedConversation) {
                return res.status(404).json({ message: 'Conversation not found after update' });
            }

            // 💬 Tạo thông báo hệ thống
            const removedUser = await User.findById(friend_id_to_remove).lean();
            await createSystemNotification(conversation_id, user_id_performing_action, `đã xóa ${removedUser ? removedUser.userName : 'một thành viên'} khỏi nhóm.`);

            // 📢 SOCKET: Thông báo cập nhật metadata và thành viên bị xóa
            emitGroupEvent(conversation_id, 'group-metadata-updated', {
                conversationId: conversation_id,
                updatedData: {
                    members: updatedConversation.members,
                    deputyLeaders: updatedConversation.deputyLeader //Sửa: deputyLeaders
                },
                actionTaker: { id: user_id_performing_action, name: (await User.findById(user_id_performing_action).lean())?.userName },
                removedMemberInfo: { _id: friend_id_to_remove, userName: removedUser?.userName }
            });

            return res.status(200).json({
                message: 'Xóa thành viên khỏi nhóm thành công!!!',
                conversation: updatedConversation,
            });
        } catch (error) {
            console.error("Lỗi xóa thành viên:", error);
            res.status(500).json({ message: error.message });
        }
    }
    // api gán quyền phó nhóm cho các thành viên khác
    async authorizeDeputyLeaderWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const user_id_promoter = req.body.user_id; // Người gán quyền (nên là req.user.id)
        const friend_id_promoted = req.body.friend_id; // Người được gán

        try {
            const conversation = await Conversation.findOne({ _id: conversation_id });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }

            if (conversation.groupLeader.toString() !== user_id_promoter) {
                return res.status(200).json({ message: 'Bạn không có quyền gán phó nhóm!!!' }); // Nên là 403
            }
            if (conversation.deputyLeader && conversation.deputyLeader.map(id => id.toString()).includes(friend_id_promoted)) {
                return res.status(200).json({ message: 'Thành viên đã là phó nhóm rồi!!!' }); // Nên là 400
            }
            if (conversation.groupLeader.toString() === friend_id_promoted) {
                return res.status(200).json({ message: 'Thành viên đã là trưởng nhóm rồi!!!' }); // Nên là 400
            }
            if (!conversation.members.map(id => id.toString()).includes(friend_id_promoted)) {
                return res.status(400).json({ message: 'Người được bổ nhiệm phải là thành viên của nhóm.' });
            }

            const updatedConversation = await Conversation.findOneAndUpdate(
                { _id: conversation_id },
                { $addToSet: { deputyLeader: friend_id_promoted } }, // $addToSet để tránh trùng lặp
                { new: true }
            ).populate('deputyLeaders', 'userName _id avatar'); //Sửa: deputyLeaders

            if (!updatedConversation) return res.status(404).json({ message: "Không tìm thấy conversation sau khi cập nhật" });

            // 💬 Tạo thông báo hệ thống
            const promotedUser = await User.findById(friend_id_promoted).lean();
            await createSystemNotification(conversation_id, user_id_promoter, `đã bổ nhiệm ${promotedUser ? promotedUser.userName : 'một thành viên'} làm phó nhóm.`);

            // 📢 SOCKET
            emitGroupEvent(conversation_id, 'group-metadata-updated', {
                conversationId: conversation_id,
                updatedData: { deputyLeaders: updatedConversation.deputyLeader }, //Sửa: deputyLeaders
                actionTaker: { id: user_id_promoter, name: (await User.findById(user_id_promoter).lean())?.userName },
                promotedDeputy: { _id: friend_id_promoted, userName: promotedUser?.userName }
            });

            return res.status(200).json({
                message: 'Gán quyền phó nhóm thành công!!!',
                conversation: updatedConversation,
            });
        } catch (error) {
            console.error("Lỗi gán phó nhóm:", error);
            res.status(500).json({ message: error.message });
        }
    }
    // api gán quyền trưởng nhóm cho 1 thành viên khác
    async authorizeGroupLeaderWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const current_leader_id = req.body.user_id; // Trưởng nhóm hiện tại (nên là req.user.id)
        const new_leader_id = req.body.friend_id; // Người được gán làm trưởng nhóm mới

        try {
            let conversation = await Conversation.findOne({ _id: conversation_id });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }

            if (conversation.groupLeader.toString() !== current_leader_id) {
                return res.status(200).json({ message: 'Bạn không có quyền gán trưởng nhóm!!!' }); // Nên là 403
            }
            if (current_leader_id === new_leader_id) {
                return res.status(400).json({ message: "Người này đã là trưởng nhóm." })
            }
            if (!conversation.members.map(id => id.toString()).includes(new_leader_id)) {
                return res.status(400).json({ message: 'Người được chuyển quyền phải là thành viên của nhóm.' });
            }


            const oldLeaderId = conversation.groupLeader;
            conversation.groupLeader = new_leader_id;
            // Nếu người mới là phó nhóm, xóa khỏi danh sách phó nhóm
            if (conversation.deputyLeader && conversation.deputyLeader.map(id => id.toString()).includes(new_leader_id)) {
                conversation.deputyLeader = conversation.deputyLeader.filter(
                    (id) => id.toString() !== new_leader_id
                );
            }
            // (Tùy chọn) Thêm trưởng nhóm cũ vào danh sách thành viên nếu họ không có, hoặc vào phó nhóm
            // if (!conversation.members.map(id=>id.toString()).includes(oldLeaderId.toString())) {
            //     conversation.members.push(oldLeaderId);
            // }

            await conversation.save();
            const updatedConversationPopulated = await Conversation.findById(conversation_id).populate('groupLeader', 'userName _id avatar').populate('deputyLeaders', 'userName _id avatar');


            // 💬 Tạo thông báo hệ thống
            const oldLeaderUser = await User.findById(oldLeaderId).lean();
            const newLeaderUser = await User.findById(new_leader_id).lean();
            await createSystemNotification(conversation_id, current_leader_id, `đã chuyển quyền trưởng nhóm cho ${newLeaderUser ? newLeaderUser.userName : 'thành viên mới'}.`);

            // 📢 SOCKET
            emitSocketEvent(conversation_id, 'group-metadata-updated', {
                conversationId: conversation_id,
                updatedData: {
                    groupLeader: updatedConversationPopulated.groupLeader,
                    deputyLeaders: updatedConversationPopulated.deputyLeader // Sửa: deputyLeaders
                },
                actionTaker: { id: current_leader_id, name: oldLeaderUser?.userName },
                newLeader: { _id: new_leader_id, userName: newLeaderUser?.userName }
            });

            return res.status(200).json({
                message: 'Gán quyền trưởng nhóm thành công!!!',
                conversation: updatedConversationPopulated,
            });
        } catch (error) {
            console.error("Lỗi gán trưởng nhóm:", error);
            res.status(500).json({ message: error.message });
        }
    }
    // api gỡ quyền phó nhóm deleteDeputyLeaderWeb chỉ dành cho groupLeader
    async deleteDeputyLeaderWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const user_id_demoter = req.body.user_id; // Người gỡ quyền (nên là req.user.id)
        const friend_id_demoted = req.body.friend_id; // Người bị gỡ quyền

        try {
            const conversation = await Conversation.findOne({ _id: conversation_id });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }

            if (conversation.groupLeader.toString() !== user_id_demoter) {
                return res.status(200).json({ message: 'Bạn không có quyền gỡ quyền phó nhóm!!!' }); // Nên là 403
            }
            if (!(conversation.deputyLeader && conversation.deputyLeader.map(id => id.toString()).includes(friend_id_demoted))) {
                return res.status(400).json({ message: 'Người này không phải là phó nhóm.' });
            }

            const updatedConversation = await Conversation.findOneAndUpdate(
                { _id: conversation_id },
                { $pull: { deputyLeader: friend_id_demoted } },
                { new: true }
            ).populate('deputyLeaders', 'userName _id avatar'); //Sửa: deputyLeaders

            if (!updatedConversation) return res.status(404).json({ message: "Không tìm thấy conversation sau khi cập nhật" });

            // 💬 Tạo thông báo hệ thống
            const demotedUser = await User.findById(friend_id_demoted).lean();
            await createSystemNotification(conversation_id, user_id_demoter, `đã gỡ quyền phó nhóm của ${demotedUser ? demotedUser.userName : 'một thành viên'}.`);

            // 📢 SOCKET
            // Tên sự kiện 'deputy-assigned' bạn dùng có vẻ không đúng, nên là 'deputy-removed' hoặc 'metadata-updated'
            emitSocketEvent(conversation_id, 'group-metadata-updated', { // Sửa tên sự kiện cho nhất quán
                conversationId: conversation_id,
                updatedData: { deputyLeaders: updatedConversation.deputyLeader }, //Sửa: deputyLeaders
                actionTaker: { id: user_id_demoter, name: (await User.findById(user_id_demoter).lean())?.userName },
                demotedDeputy: { _id: friend_id_demoted, userName: demotedUser?.userName }
            });

            return res.status(200).json({
                message: 'Gỡ quyền phó nhóm thành công!!!',
                conversation: updatedConversation,
            });
        } catch (error) {
            console.error("Lỗi gỡ quyền phó nhóm:", error);
            res.status(500).json({ message: error.message });
        }
    }

    // api rời khỏi nhóm cho tât cả thành viên
    async leaveGroupWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const user_id_leaving = req.body.user_id; // Người rời nhóm (nên là req.user.id)

        try {
            let conversation = await Conversation.findOne({ _id: conversation_id });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }

            if (conversation.groupLeader.toString() === user_id_leaving) {
                return res.status(200).json({ message: 'Trưởng nhóm không thể rời khỏi nhóm!!! Phải chuyển quyền hoặc giải tán.' }); // Nên là 403
            }
            if (!conversation.members.map(id => id.toString()).includes(user_id_leaving)) {
                return res.status(400).json({ message: 'Bạn không phải là thành viên của nhóm này.' });
            }


            let updatedConversation = await Conversation.findOneAndUpdate(
                { _id: conversation_id },
                {
                    $pull: {
                        members: user_id_leaving,
                        deputyLeader: user_id_leaving // Cũng xóa khỏi phó nhóm nếu là phó nhóm
                    }
                },
                { new: true }
            ).populate('members', 'userName _id avatar').populate('deputyLeaders', 'userName _id avatar'); //Sửa: deputyLeaders

            if (!updatedConversation) {
                return res.status(404).json({ message: 'Conversation not found after update' });
            }

            // 💬 Tạo thông báo hệ thống
            const leavingUser = await User.findById(user_id_leaving).lean();
            await createSystemNotification(conversation_id, user_id_leaving, `đã rời khỏi nhóm.`);

            // 📢 SOCKET
            emitSocketEvent(conversation_id, 'member-left', { // Sự kiện này bạn đã có
                conversationId: conversation_id,
                userId: user_id_leaving,
                userName: leavingUser?.userName,
                // Gửi kèm metadata để client có thể cập nhật danh sách
                updatedMembers: updatedConversation.members,
                updatedDeputyLeaders: updatedConversation.deputyLeader //Sửa: deputyLeaders
            });
            // Cũng có thể emit 'group-metadata-updated' nếu frontend chỉ nghe 1 sự kiện
            emitGroupEvent(conversation_id, 'group-metadata-updated', {
                conversationId: conversation_id,
                updatedData: {
                    members: updatedConversation.members,
                    deputyLeaders: updatedConversation.deputyLeader //Sửa: deputyLeaders
                }
            });


            return res.status(200).json({
                message: 'Rời khỏi nhóm thành công!!!',
                conversation: updatedConversation,
            });
        } catch (error) {
            console.error("Lỗi rời nhóm:", error);
            res.status(500).json({ message: error.message });
        }
    }
    // api giản tán nhóm chỉ dành cho groupLeader
    async disbandGroupWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const user_id_disbanding = req.body.user_id; // Người giải tán (nên là req.user.id)

        try {
            const conversation = await Conversation.findOne({ _id: conversation_id });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }

            if (conversation.groupLeader.toString() !== user_id_disbanding) {
                return res.status(200).json({ message: 'Bạn không có quyền giải tán nhóm!!!' }); // Nên là 403
            }

            await Conversation.deleteOne({ _id: conversation_id });
            await Message.deleteMany({ conversation_id: conversation_id }); // Xóa các tin nhắn của nhóm

            // 💬 Tạo thông báo hệ thống (Gửi TRƯỚC KHI xóa, hoặc không cần thiết nếu nhóm biến mất hoàn toàn)
            // const disbandingUser = await User.findById(user_id_disbanding).lean();
            // await createSystemNotification(conversation_id, user_id_disbanding, `đã giải tán nhóm.`);
            // Tuy nhiên, vì nhóm bị xóa, tin nhắn này có thể không có chỗ để hiển thị.

            // 📢 SOCKET: Thông báo nhóm đã bị giải tán
            emitSocketEvent(conversation_id, 'group-disbanded', {
                conversationId: conversation_id,
                disbandedBy: { id: user_id_disbanding, name: (await User.findById(user_id_disbanding).lean())?.userName }
            });

            return res.status(200).json({
                message: 'Giải tán nhóm thành công!!!',
            });
        } catch (error) {
            console.error("Lỗi giải tán nhóm:", error);
            res.status(500).json({ message: error.message });
        }
    }
    // api lấy tất cả conversation mảng members chứa user_id và members có từ 3 phần tử trở lên
    async getConversationGroupByUserIDWeb(req, res) {
        const user_id = req.body.user_id
        try {
            const conversation = await Conversation.find({
                members: { $all: [user_id] },
            })
            // lọc ra những conversation có thuộc tính là groupLeader với avatar thì mới chọn
            // const conversationGroup = conversation.filter(
            //     (conversation) => conversation.groupLeader
            // )

            // lọc ra những conversation có thuộc tính là groupLeader với avatar và có thuộc tính deleted = null thì mới chọn
            const conversationGroup = conversation.filter(
                (conversation) =>
                    conversation.groupLeader && !conversation.deleted
            )

            res.status(200).json({
                message: 'Lấy conversationGroup thành công!!!',
                conversationGroup: conversationGroup,
            })
        } catch (err) {
            res.status(500).json(err)
        }
    }

    async getConversationIDWeb(req, res) {
        const friend_id = req.body.friend_id
        const user_id = req.body.user_id

        try {
            const conversation = await Conversation.findOne({
                members: { $all: [user_id, friend_id] },
            })

            if (!conversation) {
                return res
                    .status(404)
                    .json({ message: 'Conversation not found' })
            }

            return res.status(200).json({
                thongbao: 'Tìm conversation_id thành công!!!',
                conversation_id: conversation._id,
            })
        } catch (error) {
            res.status(500).json({ message: error.message })
        }
    }

    // api lấy danh sách member từ conversation_id
    async getMemberFromConversationIDWeb(req, res) {
        const conversation_id = req.body.conversation_id
        try {
            const conversation = await Conversation.findOne({
                _id: conversation_id,
            })
            if (!conversation) {
                return res
                    .status(404)
                    .json({ message: 'Conversation not found' })
            }
            return res.status(200).json({
                message: 'Lấy danh sách thành viên thành công!!!',
                members: conversation.members,
            })
        } catch (error) {
            res.status(200).json({ message: error.message })
        }
    }
    // api lấy id của GroupLeader và lấy mảng danh sách các id của DeputyLeader
    async getGroupLeaderAndDeputyLeaderWeb(req, res) {
        const conversation_id = req.body.conversation_id
        try {
            const conversation = await Conversation.findOne({
                _id: conversation_id,
            })
            if (!conversation) {
                return res
                    .status(404)
                    .json({ message: 'Conversation not found' })
            }
            return res.status(200).json({
                message: 'Lấy GroupLeader và DeputyLeader thành công!!!',
                groupLeaderId: conversation.groupLeader,
                deputyLeaderIds: conversation.deputyLeader,
            })
        } catch (error) {
            res.status(200).json({ message: error.message })
        }
    }
    async changeConversationNameWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const user_id_changing_name = req.body.user_id; // Người đổi tên (nên là req.user.id)
        const new_conversation_name = req.body.conversationName;

        if (!new_conversation_name || new_conversation_name.trim() === "") {
            return res.status(400).json({ message: "Tên nhóm không được để trống." });
        }

        try {
            let conversation = await Conversation.findOne({ _id: conversation_id });
            if (!conversation) {
                return res.status(404).json({ message: 'Conversation not found' });
            }

            // Logic kiểm tra quyền đổi tên của bạn (ví dụ: trưởng/phó nhóm)
            if (conversation.groupLeader.toString() !== user_id_changing_name &&
                !(conversation.deputyLeader && conversation.deputyLeader.map(id => id.toString()).includes(user_id_changing_name))
            ) {
                return res.status(200).json({ message: 'Bạn không có quyền đổi tên nhóm!!!' }); // Nên là 403
            }

            const oldName = conversation.conversationName;
            conversation.conversationName = new_conversation_name.trim();
            await conversation.save();

            // 💬 Tạo thông báo hệ thống
            const changingUser = await User.findById(user_id_changing_name).lean();
            await createSystemNotification(conversation_id, user_id_changing_name, `đã đổi tên nhóm thành "${new_conversation_name.trim()}".`);

            // 📢 SOCKET
            // Bạn đã có 'group-renamed', có thể dùng nó hoặc 'group-metadata-updated'
            emitSocketEvent(conversation_id, 'group-metadata-updated', {
                conversationId: conversation_id,
                updatedData: { conversationName: conversation.conversationName },
                actionTaker: { id: user_id_changing_name, name: changingUser?.userName }
            });
            // Hoặc giữ lại event cũ của bạn:
            // emitGroupEvent(conversation_id, 'group-renamed', { conversationName: conversation.conversationName, userName: changingUser?.userName });


            return res.status(200).json({
                message: 'Đổi tên nhóm thành công!!!',
                userChangeName: changingUser?.userName, // Giữ lại nếu client cần
                conversation: conversation
            });
        } catch (error) {
            console.error("Lỗi đổi tên nhóm:", error);
            res.status(500).json({ message: error.message });
        }
    }


    // adđ mobile-------------------------
    async createConversation(req, res) {
        const newConversation = new Conversation({
            members: [req.body.senderId, req.body.receiverId],
        })
        try {
            const result = await newConversation.save()
            //res.status(200).json(result)
        } catch (err) {
            res.status(500).json(err)
        }
    }
    async userConversations(req, res) {
        try {
            const conversation = await Conversation.find({
                members: { $in: [req.params.userId] },
            })
            res.status(200).json(conversation)
        } catch (err) {
            res.status(500).json(err)
        }
    }
    async findConversations(req, res) {
        try {
            const conversation = await Conversation.findOne({
                members: { $all: [req.params.firstId, req.params.secondId] },
            })
            res.status(200).json(conversation)
        } catch (err) {
            res.status(500).json(err)
        }
    }
    //find conversation by conversation_id mobile
    async findConversationById(req, res) {
        try {
            const conversation = await Conversation.findOne({
                _id: req.params.conversationId,
            })
            res.status(200).json(conversation)
        } catch (err) {
            res.status(500).json(err)
        }
    }
    //api tạo nhóm trò chuyện
    async createConversationsGroupMobile(req, res) {
        try {
            const { members, conversationName, avatar, groupLeader } = req.body;

            // Kiểm tra dữ liệu đầu vào
            if (!members || !Array.isArray(members) || members.length < 3) {
                return res.status(400).json({ message: 'Nhóm phải có ít nhất 3 thành viên' });
            }
            if (!conversationName || conversationName.trim().length === 0 || conversationName.length > 100) {
                return res.status(400).json({ message: 'Tên nhóm không hợp lệ (phải từ 1-100 ký tự)' });
            }
            if (!groupLeader || !mongoose.Types.ObjectId.isValid(groupLeader)) {
                return res.status(400).json({ message: 'ID trưởng nhóm không hợp lệ' });
            }
            const uniqueMembers = [...new Set(members)];
            if (uniqueMembers.length !== members.length) {
                return res.status(400).json({ message: 'Danh sách thành viên chứa ID trùng lặp' });
            }
            if (!members.includes(groupLeader)) {
                return res.status(400).json({ message: 'Trưởng nhóm phải là một thành viên' });
            }
            if (!members.every(id => mongoose.Types.ObjectId.isValid(id))) {
                return res.status(400).json({ message: 'Một hoặc nhiều ID thành viên không hợp lệ' });
            }

            // Kiểm tra thành viên tồn tại
            let users;
            try {
                users = await User.find({ _id: { $in: members } });
            } catch (dbErr) {
                console.error('Lỗi truy vấn User:', dbErr);
                return res.status(500).json({ message: 'Lỗi cơ sở dữ liệu', error: dbErr.message });
            }
            if (users.length !== members.length) {
                const missingIds = members.filter(id => !users.some(user => user._id.toString() === id));
                return res.status(400).json({ message: `Các ID không tồn tại: ${missingIds.join(', ')}` });
            }
            const leader = users.find(user => user._id.toString() === groupLeader);
            if (!leader) {
                return res.status(400).json({ message: 'Trưởng nhóm không tồn tại trong danh sách thành viên' });
            }

            // Tạo nhóm
            const conversation = new Conversation({
                members,
                conversationName: conversationName.trim(),
                avatar: avatar || 'https://via.placeholder.com/50',
                groupLeader,
                deputyLeader: [],
            });

            try {
                console.log('Saving conversation:', { members, conversationName, avatar, groupLeader });
                await conversation.save();
            } catch (saveErr) {
                console.error('Lỗi lưu Conversation:', saveErr);
                return res.status(400).json({ message: 'Lỗi lưu nhóm', error: saveErr.message });
            }

            // Cập nhật conversation_id cho thành viên
            try {
                const updateResult = await User.updateMany(
                    { _id: { $in: members } },
                    { $push: { conversation_id: { conversation_id: conversation._id } } }
                );
                console.log('Updated users:', updateResult);
            } catch (updateErr) {
                console.error('Lỗi cập nhật conversation_id:', updateErr);
                return res.status(500).json({ message: 'Lỗi cập nhật thành viên', error: updateErr.message });
            }

            // Tạo thông báo hệ thống
            try {
                const message = new Message({
                    conversation_id: conversation._id,
                    senderId: groupLeader,
                    contentType: 'notify',
                    content: `Nhóm "${conversationName}" đã được tạo bởi ${leader.userName}`,
                });
                await message.save();
            } catch (msgErr) {
                console.error('Lỗi tạo thông báo:', msgErr);
            }

            // Phát sự kiện Socket.IO
            if (io) {
                io.to(conversation._id.toString()).emit('group-event', {
                    conversation_id: conversation._id,
                    event: 'group-created',
                    data: { conversationName, userName: leader.userName },
                });
            } else {
                console.warn('Socket.IO không được khởi tạo');
            }

            res.status(200).json({
                message: 'Tạo nhóm thành công',
                conversation: {
                    _id: conversation._id,
                    conversationName: conversation.conversationName,
                    members: conversation.members,
                    avatar: conversation.avatar,
                    groupLeader: conversation.groupLeader
                }
            });
        } catch (err) {
            console.error('Lỗi tạo nhóm (Mobile):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }

    async addMemberToConversationGroupMobile(req, res) {
        try {
            const { conversation_id, member_ids, user_id } = req.body;
            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người thực hiện hành động' });
            }

            // Kiểm tra danh sách member_ids
            const newMembers = await User.find({ _id: { $in: member_ids } });
            if (newMembers.length !== member_ids.length) {
                return res.status(404).json({ message: 'Một hoặc nhiều thành viên không tồn tại' });
            }

            // Kiểm tra thành viên đã có trong nhóm
            const alreadyMembers = member_ids.filter(id => conversation.members.includes(id));
            if (alreadyMembers.length > 0) {
                return res.status(400).json({ message: 'Một số người dùng đã là thành viên' });
            }

            if (
                conversation.groupLeader.toString() !== user_id &&
                !conversation.deputyLeader.includes(user_id)
            ) {
                return res.status(403).json({ message: 'Bạn không có quyền thêm thành viên' });
            }

            // Thêm tất cả member_ids vào nhóm
            conversation.members.push(...member_ids);
            await conversation.save();

            // Cập nhật conversation_id cho các thành viên mới
            await User.updateMany(
                { _id: { $in: member_ids } },
                { $push: { conversation_id: { conversation_id: conversation._id } } }
            );

            // Tạo thông báo cho từng thành viên
            for (const member_id of member_ids) {
                const newMember = await User.findById(member_id);
                const message = new Message({
                    conversation_id,
                    senderId: user_id,
                    contentType: 'notify',
                    content: `${newMember.userName} đã được ${user.userName} thêm vào nhóm`,
                });
                await message.save();
            }

            emitGroupEvent(conversation_id, 'member-added', { member_ids });


            res.status(200).json({ message: 'Thêm thành viên thành công', conversation });
        } catch (err) {
            console.error('Lỗi thêm thành viên (Mobile):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }

    async removeMemberFromConversationGroupMobile(req, res) {
        try {
            const { conversation_id, member_id, user_id } = req.body;
            if (!user_id) {
                return res.status(400).json({ message: 'Thiếu user_id của người thực hiện hành động' });
            }

            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người thực hiện hành động' });
            }

            const removedMember = await User.findById(member_id);
            if (!removedMember) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng cần xóa' });
            }

            if (!conversation.members.includes(member_id)) {
                return res.status(400).json({ message: 'Người dùng không phải thành viên' });
            }

            if (conversation.groupLeader.toString() === member_id) {
                return res.status(400).json({ message: 'Không thể xóa trưởng nhóm' });
            }

            if (
                conversation.groupLeader.toString() !== user_id &&
                !conversation.deputyLeader.includes(user_id)
            ) {
                return res.status(403).json({ message: 'Bạn không có quyền xóa thành viên' });
            }

            conversation.members = conversation.members.filter((id) => id.toString() !== member_id);
            conversation.deputyLeader = conversation.deputyLeader.filter((id) => id.toString() !== member_id);
            await conversation.save();

            // Xóa conversation_id khỏi user bị xóa
            await User.updateOne(
                { _id: member_id },
                { $pull: { conversation_id: { conversation_id: conversation._id } } }
            );

            const message = new Message({
                conversation_id,
                senderId: user_id,
                contentType: 'notify',
                content: `${removedMember.userName} đã bị ${user.userName} xóa khỏi nhóm`,
            });
            await message.save();

            emitGroupEvent(conversation_id, 'member-removed', {
                userId: member_id,
                userName: removedMember.userName,
            });


            res.status(200).json({ message: 'Xóa thành viên thành công', conversation });
        } catch (err) {
            console.error('Lỗi xóa thành viên (Mobile):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }

    async authorizeDeputyLeader(req, res) {
        try {
            const { conversation_id, member_id, user_id } = req.body; // Thêm user_id để kiểm tra quyền
            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người thực hiện hành động' });
            }

            const newDeputy = await User.findById(member_id);
            if (!newDeputy) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng cần gán quyền' });
            }

            if (!conversation.members.includes(member_id)) {
                return res.status(400).json({ message: 'Người dùng không phải thành viên' });
            }

            if (conversation.deputyLeader.includes(member_id)) {
                return res.status(400).json({ message: 'Người dùng đã là phó nhóm' });
            }

            if (conversation.groupLeader.toString() === member_id) {
                return res.status(400).json({ message: 'Người dùng đã là trưởng nhóm' });
            }

            if (conversation.groupLeader.toString() !== user_id) {
                return res.status(403).json({ message: 'Bạn không có quyền gán phó nhóm' });
            }

            conversation.deputyLeader.push(member_id);
            await conversation.save();

            const message = new Message({
                conversation_id,
                senderId: user_id,
                contentType: 'notify',
                content: `${newDeputy.userName} đã được ${user.userName} bổ nhiệm làm Phó nhóm`,
            });
            await message.save();

            emitGroupEvent(conversation_id, 'deputy-assigned', {
                userId: member_id,
                userName: newDeputy.userName,
            });


            res.status(200).json({ message: 'Gán quyền phó nhóm thành công', conversation });
        } catch (err) {
            console.error('Lỗi gán quyền phó nhóm:', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }
    // api hủy quyền phó nhóm cho các thành viên khác
    async unauthorizeDeputyLeader(req, res) {
        try {
            const { conversation_id, member_id, user_id } = req.body; // Thêm user_id để kiểm tra quyền
            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người thực hiện hành động' });
            }

            const removedDeputy = await User.findById(member_id);
            if (!removedDeputy) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng cần gỡ quyền' });
            }

            if (!conversation.deputyLeader.includes(member_id)) {
                return res.status(400).json({ message: 'Người dùng không phải phó nhóm' });
            }

            if (conversation.groupLeader.toString() !== user_id) {
                return res.status(403).json({ message: 'Bạn không có quyền gỡ quyền phó nhóm' });
            }

            conversation.deputyLeader = conversation.deputyLeader.filter((id) => id.toString() !== member_id);
            await conversation.save();

            const message = new Message({
                conversation_id,
                senderId: user_id,
                contentType: 'notify',
                content: `${removedDeputy.userName} đã bị ${user.userName} gỡ quyền phó nhóm`,
            });
            await message.save();

            emitGroupEvent(conversation_id, 'deleteDeputyLeader', { userName: removedDeputy.userName });


            res.status(200).json({ message: 'Gỡ quyền phó nhóm thành công', conversation });
        } catch (err) {
            console.error('Lỗi gỡ quyền phó nhóm:', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }

    async authorizeGroupLeader(req, res) {
        try {
            const { conversation_id, member_id, user_id } = req.body; // Thêm user_id để kiểm tra quyền
            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người thực hiện hành động' });
            }

            const newLeader = await User.findById(member_id);
            if (!newLeader) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng cần gán quyền' });
            }

            if (!conversation.members.includes(member_id)) {
                return res.status(400).json({ message: 'Người dùng không phải thành viên' });
            }

            if (conversation.groupLeader.toString() !== user_id) {
                return res.status(403).json({ message: 'Bạn không có quyền gán trưởng nhóm' });
            }

            conversation.groupLeader = member_id;
            conversation.deputyLeader = conversation.deputyLeader.filter((id) => id.toString() !== member_id);
            await conversation.save();

            const message = new Message({
                conversation_id,
                senderId: user_id,
                contentType: 'notify',
                content: `${newLeader.userName} đã được ${user.userName} chuyển quyền trưởng nhóm`,
            });
            await message.save();

            emitGroupEvent(conversation_id, 'leader-assigned', {
                userId: member_id,
                userName: newLeader.userName,
            });


            res.status(200).json({ message: 'Gán quyền trưởng nhóm thành công', conversation });
        } catch (err) {
            console.error('Lỗi gán quyền trưởng nhóm:', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }

    async disbandGroupMobile(req, res) {
        try {
            const { conversation_id, user_id } = req.body;
            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người thực hiện hành động' });
            }

            if (conversation.groupLeader.toString() !== user_id) {
                return res.status(403).json({ message: 'Bạn không có quyền giải tán nhóm' });
            }

            await conversation.delete();
            await Message.deleteMany({ conversation_id });

            emitGroupEvent(conversation_id, 'group-disbanded', {});


            res.status(200).json({ message: 'Giải tán nhóm thành công' });
        } catch (err) {
            console.error('Lỗi giải tán nhóm (Mobile):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }
    async leaveGroupMobile(req, res) {
        try {
            const { conversation_id, user_id } = req.body;
            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng' });
            }

            if (conversation.groupLeader.toString() === user_id) {
                return res.status(400).json({ message: 'Trưởng nhóm không thể rời khỏi nhóm' });
            }

            if (!conversation.members.includes(user_id)) {
                return res.status(400).json({ message: 'Bạn không phải thành viên của nhóm' });
            }

            conversation.members = conversation.members.filter((id) => id.toString() !== user_id);
            conversation.deputyLeader = conversation.deputyLeader.filter((id) => id.toString() !== user_id);
            await conversation.save();

            const message = new Message({
                conversation_id,
                senderId: user_id,
                contentType: 'notify',
                content: `${user.userName} đã rời khỏi nhóm`,
            });
            await message.save();

            emitGroupEvent(conversation_id, 'exit', { userName: user.userName });


            res.status(200).json({ message: 'Rời khỏi nhóm thành công', conversation });
        } catch (err) {
            console.error('Lỗi rời nhóm (Mobile):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }

    async changeGroupNameMobile(req, res) {
        try {
            const { conversation_id, conversationName, user_id } = req.body;
            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng' });
            }

            if (
                conversation.groupLeader.toString() !== user_id &&
                !conversation.deputyLeader.includes(user_id)
            ) {
                return res.status(403).json({ message: 'Bạn không có quyền đổi tên nhóm' });
            }

            conversation.conversationName = conversationName;
            await conversation.save();

            const message = new Message({
                conversation_id,
                senderId: user_id,
                contentType: 'notify',
                content: `Tên nhóm đã được ${user.userName} thay đổi thành ${conversationName}`,
            });
            await message.save();

            emitGroupEvent(conversation_id, 'rename', { userName: user.userName, conversationName });


            res.status(200).json({ message: 'Đổi tên nhóm thành công', conversation });
        } catch (err) {
            console.error('Lỗi đổi tên nhóm (Mobile):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }

    async updateConversationAvatarMobile(req, res) {
        try {
            const { conversation_id, avatar, user_id } = req.body;
            const conversation = await Conversation.findById(conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy nhóm' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng' });
            }

            if (
                conversation.groupLeader.toString() !== user_id &&
                !conversation.deputyLeader.includes(user_id)
            ) {
                return res.status(403).json({ message: 'Bạn không có quyền cập nhật avatar nhóm' });
            }

            conversation.avatar = avatar;
            await conversation.save();

            const message = new Message({
                conversation_id,
                senderId: user_id,
                contentType: 'notify',
                content: `${user.userName} đã cập nhật avatar nhóm`,
            });
            await message.save();

            emitGroupEvent(conversation_id, 'avatar-updated', { userName: user.userName, avatar });


            res.status(200).json({ message: 'Cập nhật avatar nhóm thành công', conversation });
        } catch (err) {
            console.error('Lỗi cập nhật avatar nhóm (Mobile):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }
    async getConversationsByUserIDMobile(req, res) {
        try {
            const user_id = req.body.user_id;
            if (!user_id) {
                return res.status(400).json({ message: 'Thiếu user_id trong body' });
            }

            const user = await User.findById(user_id);
            if (!user) {
                return res.status(404).json({ message: 'Không tìm thấy người dùng' });
            }

            const conversationIds = user.conversation_id?.map(conv => conv.conversation_id) || [];
            if (!conversationIds.length) {
                return res.status(200).json({
                    message: 'Lấy all conversation thành công!!!',
                    conversation: [],
                });
            }

            const conversations = await Conversation.find({
                _id: { $in: conversationIds },
                deleted: false,
            }).lean();

            res.status(200).json({
                message: 'Lấy all conversation thành công!!!',
                conversation: conversations.map(conv => conv._id),
            });
        } catch (error) {
            console.error('Lỗi lấy danh sách cuộc trò chuyện (Mobile):', error);
            res.status(500).json({ message: 'Internal server error', error: error.message });
        }
    }

    async getConversationById(req, res) {
        try {
            const conversation = await Conversation.findById(req.params.conversation_id);
            if (!conversation) {
                return res.status(404).json({ message: 'Không tìm thấy cuộc trò chuyện' });
            }
            res.status(200).json({ conversation });
        } catch (err) {
            console.error('Lỗi lấy thông tin cuộc trò chuyện:', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }
    //-------------------

    // api check conversation có phải là nhóm  hay chưa dựa vào conversation đó có thuộc tính groupLeader hay không hoặc có conversationName hay không
    async checkGroupWeb(req, res) {
        const conversation_id = req.body.conversation_id
        try {
            const conversation = await Conversation.findOne({
                _id: conversation_id,
            })
            if (!conversation) {
                return res
                    .status(404)
                    .json({ message: 'Conversation not found' })
            }
            if (
                conversation.groupLeader ||
                (conversation.conversationName &&
                    conversation.conversationName !== 'Cloud của tôi')
            ) {
                return res.status(200).json({
                    message: 'Conversation là nhóm!!!',
                })
            } else {
                return res.status(200).json({
                    message: 'Conversation không phải là nhóm!!!',
                })
            }
        } catch (error) {
            res.status(500).json({ message: error.message })
        }
    }
    // viết 1 api lấy tin nhắn cuối cùng của conversation nếu mà là của user mình nhắn sẽ hiện àlaf "Bạn : message" còn néu của người khác thì hiện là "userName : message"

    // viết 1 api check nhóm chung giữa user_id và friend_id ta sẽ check xem 2 user_id và friend_id có chung 1 nhóm nào không nếu có thì trả về số lượng nhóm chung và tên nhóm cùng với avatar của nhóm
    async checkGroupCommonWeb(req, res) {
        const user_id = req.body.user_id
        const friend_id = req.body.friend_id

        // chỉ check conversation có thuộc tính groupLeader và conversationName và thuộc tính deleted = false
        const conversation = await Conversation.find({
            members: { $all: [user_id, friend_id] },
            groupLeader: { $ne: null },
            conversationName: { $ne: null },
            deleted: false,
        })
        if (conversation.length === 0) {
            return res.status(200).json({
                message: 'Không có nhóm chung!!!',
            })
        }
        return res.status(200).json({
            message: 'Có nhóm chung!!!',

            conversation: conversation,
            // trả về số lượng nhóm chung
            conversationCount: conversation.length,
        })
    }
}


export default new ConversationController()
