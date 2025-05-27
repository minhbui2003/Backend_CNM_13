import Message from '../models/Message.js'
import Conversation from '../models/Conversation.js'
import User from '../models/User.js'
import AWS from 'aws-sdk'
import path from 'path'
import multer from 'multer'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
dotenv.config()
import { v4 as uuidv4 } from 'uuid'
import uploadDefaultAvatar from '../../util/uploadDefaultAvatar.js'
import { error } from 'console'
// require('dotenv').config()
import { io } from '../../index.js'
import axios from 'axios';
AWS.config.update({
    accessKeyId: process.env.Acces_Key,
    secretAccessKey: process.env.Secret_Acces_Key,
    region: process.env.Region,
})

const S3 = new AWS.S3()
const bucketname = process.env.s3_bucket
// console.log('bucketname nhận là : ', bucketname)

const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, '')
    },
})

function checkFileTypeMedia(file, callback) {
    console.log('📎 MIME Type nhận được:', file.mimetype);
    console.log('📄 Tên file nhận được:', file.originalname);

    const extTypes = /\.(jpeg|jpg|png|gif|doc|docx|pdf|txt|ppt|pptx|xlsx|3gp|mp4|m4a|mp3|wav)$/i;
    const mimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf', 'text/plain',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'video/mp4', 'audio/3gpp', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/mpeg', 'audio/wav',
        'audio/x-mpeg-3', 'application/octet-stream'
    ];

    const extnameValid = extTypes.test(file.originalname.toLowerCase());
    const mimetypeValid = mimeTypes.includes(file.mimetype);

    if (extnameValid && mimetypeValid) {
        return callback(null, true);
    } else {
        console.error(`❌ File bị từ chối: ${file.originalname} - ${file.mimetype}`);
        callback('Error: Invalid File Type!');
    }
}

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: checkFileTypeMedia, // 👈 Đây là đủ
});


class MessageController {
    async findAllMessages(req, res) {
        const messages = await Message.find()
        res.json(messages)
    }
    // gửi tin nhắn
    async createMessagesWeb(req, res) {
        const { conversation_id, user_id: senderId, content, contentType, replyTo } = req.body;
        const files = req.files;
        let savedMessage = null; // Khai báo savedMessage ở đây và khởi tạo là null

        try {
            // TH1 : Chỉ có gửi text message
            if ((!files || files.length === 0) && contentType === 'text' && content) {
                let message = new Message({
                    conversation_id,
                    senderId,
                    content,
                    contentType,
                    ...(mongoose.Types.ObjectId.isValid(replyTo) && { replyTo }),
                });
                await message.save();
                await message.populate('senderId', 'userName avatar');
                savedMessage = message; // Gán giá trị cho savedMessage

                if (io) {
                    io.to(conversation_id.toString()).emit('receive-message', savedMessage);
                }
                return res.status(200).json({ thongbao: 'Tạo tin nhắn text thành công!', message: savedMessage });
            }
            // TH2 : Chỉ gửi ảnh/gallery (không có text content đi kèm)
            else if (files && files.length > 0 && !content && (contentType === 'image' || contentType === 'image_gallery')) {
                const imagesToUpload = files;
                const finalContentType = imagesToUpload.length > 1 ? 'image_gallery' : 'image';

                const uploadPromises = imagesToUpload.map((singleImageFile) => {
                    const imageParts = singleImageFile.originalname.split('.');
                    const fileType = imageParts[imageParts.length - 1];
                    const filePath = `${uuidv4() + Date.now().toString()}.${fileType}`;
                    const params = {
                        Bucket: bucketname, Key: filePath, Body: singleImageFile.buffer, ContentType: singleImageFile.mimetype,
                    };
                    return S3.upload(params).promise();
                });

                const s3UploadResults = await Promise.all(uploadPromises);
                const imageUrls = s3UploadResults.map((result) => result.Location);

                const messageData = {
                    conversation_id, senderId, content: imageUrls, contentType: finalContentType,
                    ...(mongoose.Types.ObjectId.isValid(replyTo) && { replyTo }),
                };
                const galleryMessage = new Message(messageData);
                await galleryMessage.save();
                await galleryMessage.populate('senderId', 'userName avatar');
                savedMessage = galleryMessage; // Gán giá trị cho savedMessage

                if (io) {
                    io.to(conversation_id.toString()).emit('receive-message', savedMessage);
                }
                return res.status(200).json({ thongbao: 'Tạo tin nhắn gallery thành công!', message: savedMessage });
            }
            // TH3 : Gửi cả text message và ảnh/gallery
            else if (files && files.length > 0 && content && contentType === 'text') {
                let textMessage = new Message({
                    conversation_id, senderId, content, contentType: 'text',
                    ...(mongoose.Types.ObjectId.isValid(replyTo) && { replyTo }),
                });
                await textMessage.save();
                await textMessage.populate('senderId', 'userName avatar');
                if (io) {
                    io.to(conversation_id.toString()).emit('receive-message', textMessage);
                }
                await Conversation.findByIdAndUpdate(conversation_id, { lastMessage: textMessage._id, updatedAt: textMessage.createdAt });

                const imagesToUpload = files;
                const imgContentType = imagesToUpload.length > 1 ? 'image_gallery' : 'image';

                const imgUploadPromises = imagesToUpload.map((img) => {
                    const imgParts = img.originalname.split('.');
                    const imgFileType = imgParts[imgParts.length - 1];
                    const imgFilePath = `${uuidv4() + Date.now().toString()}.${imgFileType}`;
                    const params = { Bucket: bucketname, Key: imgFilePath, Body: img.buffer, ContentType: img.mimetype };
                    return S3.upload(params).promise();
                });

                const s3ImgResults = await Promise.all(imgUploadPromises);
                const imgUrls = s3ImgResults.map(result => result.Location);

                const imageMessageInstance = new Message({
                    conversation_id, senderId, content: imgUrls, contentType: imgContentType,
                });
                await imageMessageInstance.save();
                await imageMessageInstance.populate('senderId', 'userName avatar');
                savedMessage = imageMessageInstance; // Gán giá trị cho savedMessage (tin nhắn ảnh là tin nhắn cuối trong flow này)

                if (io) {
                    io.to(conversation_id.toString()).emit('receive-message', savedMessage);
                }

                return res.status(200).json({
                    thongbao: 'Tạo tin nhắn text và ảnh thành công!',
                    textMessage: textMessage,
                    imageMessage: savedMessage
                });
            } else {
                return res.status(400).json({ message: 'Yêu cầu không hợp lệ hoặc thiếu thông tin (cần content cho text, hoặc files cho media).' });
            }
        } catch (err) {
            console.error("Lỗi trong createMessagesWeb: ", err);
            return res.status(500).json({ message: 'Lỗi server khi tạo message!!!', error: err.message });
        } finally {
            // Khối finally sẽ luôn được thực thi
            // savedMessage giờ đã có thể truy cập được ở đây
            if (savedMessage && savedMessage._id && conversation_id) {
                try {
                    await Conversation.findByIdAndUpdate(conversation_id, {
                        lastMessage: savedMessage._id,
                        updatedAt: savedMessage.createdAt
                    });
                } catch (convUpdateError) {
                    console.error("Lỗi cập nhật conversation sau khi gửi tin nhắn:", convUpdateError);
                }
            }
        }
    }

    async forwardMessageWeb(req, res) {
        try {
            const { message_id, conversation_id, forwarded_by, forwarded_at, original_sender } = req.body;

            if (!mongoose.Types.ObjectId.isValid(message_id) || !mongoose.Types.ObjectId.isValid(conversation_id) || !mongoose.Types.ObjectId.isValid(forwarded_by)) {
                return res.status(400).json({ thongbao: 'ID không hợp lệ!' });
            }
            const originalMessage = await Message.findById(message_id);
            if (!originalMessage) {
                return res.status(404).json({ thongbao: 'Không tìm thấy tin nhắn gốc!' });
            }

            const forwardedMessage = new Message({
                conversation_id,
                senderId: forwarded_by,
                content: originalMessage.content,
                contentType: originalMessage.contentType,
                isForwarded: true,
                originalMessage: message_id,
                forwardedBy: forwarded_by,
                forwardedAt: forwarded_at || new Date(),
                originalSender: mongoose.Types.ObjectId.isValid(original_sender) ? original_sender : originalMessage.senderId, // Đảm bảo originalSender hợp lệ
            });
            await forwardedMessage.save();
            await forwardedMessage.populate([
                { path: 'senderId', select: 'userName avatar' },
                { path: 'originalSender', select: 'userName avatar' },
                { path: 'forwardedBy', select: 'userName avatar' }
            ]);

            await Conversation.findByIdAndUpdate(conversation_id, {
                lastMessage: forwardedMessage._id,
                updatedAt: forwardedMessage.createdAt
            });

            if (io) {
                io.to(conversation_id.toString()).emit('receive-message', forwardedMessage);
            }
            return res.status(200).json({
                thongbao: 'Chuyển tiếp tin nhắn thành công!',
                message: forwardedMessage,
            });
        } catch (error) {
            console.error('Lỗi chuyển tiếp tin nhắn web:', error);
            return res.status(500).json({ thongbao: 'Lỗi server khi chuyển tiếp tin nhắn!', error: error.message });
        }
    }

    async getLastMessageWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        const user_id = req.body.user_id;

        try {
            // Bỏ qua kiểm tra conversation, trực tiếp tìm lastMessage
            // const conversation = await Conversation.findOne({ _id: conversation_id });
            // if (!conversation) {
            //     return res.status(404).json({ thongbao: 'Conversation not found', retrievedLastMessage: null });
            // }

            const lastMessage = await Message.findOne({ conversation_id: conversation_id })
                .sort({ createdAt: -1 })
                .populate('senderId', 'userName avatar');

            if (!lastMessage) {
                return res.status(200).json({
                    thongbao: 'No messages found in this conversation',
                    retrievedLastMessage: null
                });
            }

            let displayContentSummary = '';
            if (lastMessage.recalled) {
                displayContentSummary = 'Tin nhắn đã bị thu hồi';
            } else {
                switch (lastMessage.contentType) {
                    case 'image': case 'image_gallery': displayContentSummary = '[Hình ảnh]'; break;
                    case 'video': displayContentSummary = '[Video]'; break;
                    case 'audio': displayContentSummary = '[Audio]'; break;
                    case 'file':
                        const fileName = (typeof lastMessage.content === 'string' && lastMessage.content.includes('/')) ? lastMessage.content.split('/').pop() : "Tệp";
                        displayContentSummary = `[Tệp]`;
                        break;
                    case 'notify': displayContentSummary = lastMessage.content; break;
                    default: displayContentSummary = String(lastMessage.content || "").substring(0, 50) + (String(lastMessage.content || "").length > 50 ? "..." : ""); // Rút gọn text
                }
            }

            let messageStringForSidebar = "";
            if (lastMessage.senderId && lastMessage.senderId._id) { // Đảm bảo senderId và _id tồn tại
                if (lastMessage.senderId._id.toString() === user_id) {
                    messageStringForSidebar = "Bạn: " + displayContentSummary;
                } else {
                    messageStringForSidebar = `${lastMessage.senderId.userName || "Một người"}: ${displayContentSummary}`;
                }
            } else {
                messageStringForSidebar = displayContentSummary;
            }

            return res.status(200).json({
                thongbao: 'Tìm thấy tin nhắn!!!',
                retrievedLastMessage: {
                    _id: lastMessage._id,
                    messageString: messageStringForSidebar,
                    rawContent: lastMessage.content, // Nội dung gốc
                    contentType: lastMessage.contentType,
                    sender: lastMessage.senderId,
                    createdAt: lastMessage.createdAt,
                    recalled: lastMessage.recalled,
                }
            });

        } catch (error) {
            console.error("Lỗi trong getLastMessageWeb:", error);
            res.status(500).json({ thongbao: 'Lỗi server!', retrievedLastMessage: null, error: error.message });
        }
    }

    // api lấy content tin nhắn dựa vào replyTo có nội dung là message_id
    async getMessageReplyContentWeb(req, res) {
        const replyTo = req.body.replyTo
        const message = await Message.findOne({
            _id: replyTo,
        })
        if (!message) {
            return res.status(404).json({
                thongbao: 'Không tìm thấy tin nhắn!!!',
            })
        }
        return res.status(200).json({
            thongbao: 'Tìm thấy tin nhắn!!!',
            message: message.content,
        })
    }

    async findAllMessagesWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        try {
            const messages = await Message.find({ conversation_id: conversation_id })
                .populate('senderId', 'userName avatar')
                .populate({
                    path: 'replyTo',
                    populate: {
                        path: 'senderId',
                        select: 'userName avatar'
                    }
                })
                .sort({ createdAt: 'asc' });

            if (messages.length > 0) {
                return res.status(200).json({ thongbao: 'Tìm thấy tin nhắn!!!', message: messages });
            } else {
                return res.status(200).json({ thongbao: 'Không tìm thấy tin nhắn!!!', message: [] });
            }
        } catch (error) {
            console.error("Lỗi findAllMessagesWeb:", error);
            return res.status(500).json({ thongbao: 'Lỗi server!', error: error.message });
        }
    }
    // post thu hồi tin nhắn cả 2 bên recallMessageWeb http://localhost:3001/message/recallMessageWeb
    async recallMessageWeb(req, res) {
        const message_id = req.body.message_id;

        const message = await Message.findOne({ _id: message_id });
        if (!message) {
            return res.status(404).json({ thongbao: 'Không tìm thấy tin nhắn!!!' });
        }

        // Cập nhật tin nhắn
        message.recalled = true;
        message.content = 'Tin nhắn đã được thu hồi';
        const recalledMessage = await message.save(); // Lưu và lấy object tin nhắn đã cập nhật
        await recalledMessage.populate('senderId', 'userName avatar');

        const conversationIdStr = recalledMessage.conversation_id.toString();

        // ✅ BỎ CHÚ THÍCH (UNCOMMENT) KHỐI NÀY
        try {
            // Gọi đến Socket Server (đang chạy ở port 3005)
            await axios.post('https://socket-cnm-13.onrender.com/api/emit-to-room', {
                room: conversationIdStr,
                event: 'message-recalled',
                payload: recalledMessage // Gửi object tin nhắn đã cập nhật
            });
            console.log(`[RECALL_MSG_CTRL] Đã gửi yêu cầu emit tới Socket Server thành công.`);
        } catch (error) {
            console.error('[RECALL_MSG_CTRL] Lỗi khi gọi Socket Server:', error.message);
            // Có thể không cần trả về lỗi cho client ở đây, chỉ cần log lại ở server
        }
        return res.status(200).json({
            thongbao: 'Thu hồi tin nhắn thành công!!!',
            message: recalledMessage, // Trả về tin nhắn đã được cập nhật
        });
    }
    // post tìm tất cả tin nhắn đã bị thu hồi findAllRecallMessagesWeb http://localhost:3001/message/findAllRecallMessagesWeb
    async findAllRecallMessagesWeb(req, res) {
        const conversation_id = req.body.conversation_id
        // tìm tất cả tin nhắn trong conversation_id
        const messages = await Message.find({
            conversation_id: conversation_id,
            recalled: true,
        })
        if (messages.length > 0) {
            console.log('Tìm thấy tin nhắn đã thu hồi!!!')
            return res.status(200).json({
                thongbao: 'Tìm thấy tin nhắn đã thu hồi!!!',
                message: messages,
            })
        } else {
            console.log('Không tìm thấy tin nhắn đã thu hồi!!!')
            return res.status(200).json({
                thongbao: 'Không tìm thấy tin nhắn đã thu hồi!!!',
            })
        }
    }

    // post deleteMyMessageWeb xoá tin nhắc ở phía tôi http://localhost:3001/message/deleteMyMessageWeb
    async deleteMyMessageWeb(req, res) {
        const { message_id, user_id } = req.body

        try {
            const message = await Message.findById(message_id)
            if (!message) {
                return res.status(200).json({ error: 'Tin nhắn không tồn tại' })
            }

            // kiểm tra xem user đã xoá tin nhắn này chưa nếu chưa thì thêm vào mảng deletedBy
            if (!message.deletedBy.includes(user_id)) {
                message.deletedBy.push(user_id)
                await message.save()
                // emit a 'message-deleted' event to the user who deleted the message
                if (io) {
                    io.to(message.conversation_id.toString()).emit(
                        'message-deleted',
                        message_id
                    )
                }
            }

            return res.status(200).json({
                thongbao: 'Xoá chỉ ở phía tôi thành công!!!',
                message: message,
            })
        } catch (error) {
            res.status(500).json({ error: 'Lỗi' })
        }
    }
    // post findAllDeleteMyMessageWeb lấy tất cả tin nhắn đã bị xoá ở phía tôi http://localhost:3001/message/findAllDeleteMyMessageWeb
    async findAllDeleteMyMessageWeb(req, res) {
        const conversation_id = req.body.conversation_id
        // tìm tất cả tin nhắn trong conversation_id
        const messages = await Message.find({
            conversation_id: conversation_id,
            deletedBy: { $ne: [] },
        })

        if (messages.length > 0) {
            console.log('Tìm thấy tin nhắn đã bị xoá ở phía tôi!!!')
            return res.status(200).json({
                thongbao: 'Tìm thấy tin nhắn đã bị xoá ở phía tôi!!!',
                message: messages,
            })
        } else {
            console.log('Không tìm thấy tin nhắn đã bị xoá ở phía tôi!!!')
            return res.status(200).json({
                thongbao: 'Không tìm thấy tin nhắn đã bị xoá ở phía tôi!!!',
            })
        }
    }

    async uploadMediaWeb(req, res) {
        console.log('Đã vào hàm uploadMediaWeb ở server!!!')
        const conversation_id = req.body.conversation_id
        const senderId = req.body.user_id
        const content = req.body.content
        const contentType = req.body.contentType
        const media = req.files
        console.log(
            'Các giá trị bên server là: ',
            conversation_id,
            senderId,
            content,
            contentType,
            media
        )
        const uploadPromises = media.map((media) => {
            const mediaParts = media.originalname.split('.')
            const fileType = mediaParts[mediaParts.length - 1]
            const filePath = `${mediaParts[0]}.${fileType}`
            const params = {
                Bucket: bucketname,
                Key: filePath,
                Body: media.buffer,
                ContentType: media.mimetype,
            }
            return new Promise((resolve, reject) => {
                S3.upload(params, async (err, data) => {
                    if (err) {
                        console.log('Lỗi khi tải ảnh lên S3!!!', err)
                        reject(err)
                    } else {
                        const mediaURL = data.Location
                        const MediaMessage = new Message({
                            conversation_id,
                            senderId,
                            content: mediaURL,
                            contentType,
                        })
                        await MediaMessage.save()
                        console.log(MediaMessage)
                        resolve(MediaMessage)
                    }
                })
            })
        })
        Promise.all(uploadPromises)
            .then((MediaMessage) => {
                console.log('Tải media lên thành công!!!')
                return res.status(200).json({
                    thongbao: 'Tải media lên thành công!!!',
                    MediaMessage: MediaMessage,
                })
            })
            .catch((err) => {
                return res.status(200).json({
                    message: 'Lỗi khi tải media lên!!!',
                    error: err.message, // thêm chi tiết lỗi
                })
            })
    }

    async createNotificationWeb(req, res) {
        const {
            conversation_id,
            sender_id,
            action,
            receiver_id,
            conversationNameNew,
        } = req.body
        let receiverName
        const senderName = await getUserName(sender_id)
        // néu action là add,remove,exit thì tạp targetName
        if (
            action === 'add' ||
            action === 'remove' ||
            action === 'exit' ||
            action === 'addDeputyLeader' ||
            action === 'changeGroupLeader' ||
            action === 'deleteDeputyLeader'
        ) {
            receiverName = await getUserName(receiver_id)
        }

        // Tạo nội dung thông báo dựa trên hành động
        let content
        switch (action) {
            case 'add':
                content = `${receiverName} đã được ${senderName} thêm vào nhóm.`
                break
            case 'remove':
                content = `${receiverName} đã được ${senderName}  xóa khỏi nhóm.`
                break
            case 'exit':
                content = ` ${senderName} đã rời khỏi nhóm.`
                break
            case 'rename':
                content = `Tên nhóm đã được ${senderName} thay đổi thành ${conversationNameNew}.`
                break
            // Thêm các trường hợp khác nếu cần
            // thêm trường hợp thêm phó nhóm
            case 'addDeputyLeader':
                content = `${receiverName} đã được ${senderName} bổ nhiệm làm Phó nhóm.`
                break
            // thêm trường hợp chuyển quyền trưởng nhóm
            case 'changeGroupLeader':
                content = `${receiverName} đã được ${senderName} chuyển quyền trưởng nhóm.`
                break
            // xoá phó nhóm
            case 'deleteDeputyLeader':
                content = `${receiverName} đã bị ${senderName} gỡ quyền phó nhóm.`
                break
            default:
                content = ''
        }

        // Tạo thông báo
        const notification = new Message({
            conversation_id,
            sender_id,
            contentType: 'notify',
            content,
        })

        // Lưu thông báo vào cơ sở dữ liệu
        try {
            await notification.save()
            res.status(200).send({
                message: 'Tạo thông báo thành công',
                notification: notification.content,
                noti: notification,
            })
        } catch (err) {
            res.status(500).send({ message: 'Lỗi khi tạo thông báo.' })
        }
    }
    //viết 1 api lấy toàn bộ image và video dựa vào conversation_id trong message
    async getAllMediaWeb(req, res) {
        const conversation_id = req.body.conversation_id;
        console.log(`[getAllMediaWeb] Nhận yêu cầu cho conversation_id: ${conversation_id}`); // Log conversation_id
        try {
            const messagesWithMedia = await Message.find({
                conversation_id: conversation_id,
                contentType: { $in: ['image', 'image_gallery'] },
            }).sort({ createdAt: -1 });

            console.log(`[getAllMediaWeb] Số lượng tin nhắn media tìm thấy: ${messagesWithMedia.length}`); // Log số lượng
            // console.log('[getAllMediaWeb] Chi tiết messagesWithMedia:', JSON.stringify(messagesWithMedia, null, 2)); // Log chi tiết (có thể rất dài)

            if (messagesWithMedia.length === 0) {
                return res.status(200).json({
                    thongbao: 'Không tìm thấy media nào trong cuộc trò chuyện này.',
                    media: [],
                });
            }

            let allImageUrls = [];
            messagesWithMedia.forEach(msg => {
                console.log(`[getAllMediaWeb] Đang xử lý msg ID: ${msg._id}, contentType: ${msg.contentType}, isForwarded: ${msg.isForwarded}`); // Log từng tin nhắn
                if (msg.contentType === 'image_gallery' && Array.isArray(msg.content)) {
                    allImageUrls = allImageUrls.concat(msg.content);
                } else if (msg.contentType === 'image' && typeof msg.content === 'string') {
                    allImageUrls.push(msg.content);
                }
            });
            allImageUrls = allImageUrls.filter(url => typeof url === 'string' && url.trim() !== '');

            console.log(`[getAllMediaWeb] Tổng số URL ảnh thu được: ${allImageUrls.length}`); // Log số URL cuối cùng
            // console.log('[getAllMediaWeb] Danh sách allImageUrls:', allImageUrls);

            return res.status(200).json({
                thongbao: 'Tìm thấy media!',
                media: allImageUrls,
            });

        } catch (error) { // ... (phần catch giữ nguyên)
            console.error("[getAllMediaWeb] Lỗi:", error);
            return res.status(500).json({
                thongbao: 'Lỗi server khi lấy media.',
                error: error.message,
            });
        }
    }
    // viết 1 api lấy toàn bộ file dựa vào conversation_id trong message
    async getAllFileWeb(req, res) {
        const conversation_id = req.body.conversation_id
        const files = await Message.find({
            conversation_id: conversation_id,
            contentType: { $in: ['file', 'video'] },
        })
        if (files.length === 0) {
            return res.status(200).json({
                thongbao: 'Không tìm thấy file!!!',
            })
        }
        if (files.length > 0) {
            const fileLinks = files.map((f) => f.content) // Extract the content links
            // return res.status(200).json({
            //     thongbao: 'Tìm thấy file!!!',
            //     files: fileLinks, // Return the links instead of the full media objects
            // })
            // trả về 1 danh sách files bao gồm tên file ở cuối link và link
            return res.status(200).json({
                thongbao: 'Tìm thấy file!!!',
                files: files.map((f) => {
                    const fileParts = f.content.split('/')
                    const fileName = fileParts[fileParts.length - 1]
                    return { fileName, fileLink: f.content }
                }),
            })
        }
    }

    /// mobile --------------

    async getMessagesByConversationID(req, res) {
        try {
            const messages = await Message.find({
                conversation_id: req.params.conversation_id,
            })
                .populate('senderId', 'userName avatar') // nếu cần
                .sort({ createdAt: 1 });

            res.status(200).json(messages); // ✅ TRẢ VỀ MẢNG
        } catch (error) {
            res.status(500).json({ message: 'Lỗi khi lấy tin nhắn', error: error.message });
        }
    }

    async findNewestMessage(req, res) {
        try {
            let index = 0
            let message = await Message.findOne(
                { conversation_id: req.params.conversation_id },
                null,
                { sort: { createdAt: -1 }, limit: 1, skip: index }
            )
            while (message && message.deletedBy.includes(req.body.userId)) {
                index++
                message = await Message.findOne(
                    { conversation_id: req.params.conversation_id },
                    null,
                    { sort: { createdAt: -1 }, limit: 1, skip: index }
                )
            }
            console.log('message', message)
            res.status(200).json(message)
        } catch (err) {
            res.status(500).json(err)
        }
    }

    async getLastMessageMobile(req, res) {
        const conversation_id = req.body.conversation_id
        const user_id = req.body.user_id

        try {
            const conversation = await Conversation.findById(conversation_id)
            if (!conversation) {
                return res
                    .status(404)
                    .json({ message: 'Conversation not found' })
            }

            const message = await Message.findOne({ conversation_id })
                .sort({ createdAt: -1 })
                .populate('senderId', 'userName avatar')

            if (!message) {
                return res.status(200).json({
                    message: 'Chưa có tin nhắn',
                    message: null,
                })
            }

            return res.status(200).json({
                message: 'Tìm thấy tin nhắn cuối cùng!!!',
                message: message,
            })
        } catch (error) {
            console.error(error)
            return res
                .status(500)
                .json({
                    message: 'Internal server error',
                    error: error.message,
                })
        }
    }

    async createMessagesMobile(req, res) {
        const { conversation_id, user_id: senderId, contentType, replyTo, content } = req.body;
        let files = req.files;

        if (!files && req.file) {
            files = [req.file]; // Trường hợp chỉ có 1 file
        }

        console.log('📥 Mobile input:', {
            conversation_id,
            senderId,
            contentType,
            files: files?.map(f => f.originalname),
            replyTo,
            content,
        });

        if (!senderId || !contentType || (!content && (!files || files.length === 0))) {
            return res.status(400).json({ message: 'Thiếu dữ liệu: senderId, contentType hoặc file/content' });
        }

        try {
            // ✅ Trường hợp gửi văn bản
            if (contentType === 'text' && content) {
                const message = new Message({
                    conversation_id,
                    senderId,
                    content,
                    contentType,
                    ...(replyTo && mongoose.Types.ObjectId.isValid(replyTo) && { replyTo }),
                });

                await message.save();
                await message.populate('senderId', 'userName avatar'); // <<-- CẦN CÓ
                console.log('✅ Populated senderId:', message.senderId);
                io.to(conversation_id).emit('receive-message', message);

                return res.status(200).json({
                    thongbao: 'Tạo tin nhắn văn bản thành công',
                    message,
                });
            }

            // ✅ Gửi nhiều ảnh (image_gallery)
            if (contentType === 'image_gallery' && files?.length > 0) {
                const uploadResults = await Promise.all(
                    files.map((file) => {
                        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
                        const filePath = `zola_image_${Date.now()}_${cleanName}`;
                        const params = {
                            Bucket: bucketname,
                            Key: filePath,
                            Body: file.buffer,
                            ContentType: file.mimetype || 'application/octet-stream',
                            ACL: 'public-read',
                        };
                        return S3.upload(params).promise();
                    })
                );

                const imageUrls = uploadResults.map(res => res.Location);

                const message = new Message({
                    conversation_id,
                    senderId,
                    content: imageUrls,
                    contentType: 'image_gallery',
                    ...(replyTo && mongoose.Types.ObjectId.isValid(replyTo) && { replyTo }),
                });

                await message.save();
                await message.populate('senderId', 'userName avatar'); // <<-- CẦN CÓ
                console.log('✅ Populated senderId:', message.senderId);
                io.to(conversation_id).emit('receive-message', message);

                return res.status(200).json({
                    thongbao: 'Tạo tin nhắn ảnh gallery thành công',
                    message,
                });
            }

            // ✅ Gửi 1 file (image, video, file, audio)
            if (['image', 'video', 'file', 'audio'].includes(contentType) && files?.length === 1) {
                const file = files[0];
                const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
                const filePath = `zola_${contentType}_${Date.now()}_${cleanName}`;
                const params = {
                    Bucket: bucketname,
                    Key: filePath,
                    Body: file.buffer,
                    ContentType: file.mimetype || 'application/octet-stream',
                    ACL: 'public-read',
                };

                const uploadResult = await S3.upload(params).promise();
                const fileURL = uploadResult.Location;

                const message = new Message({
                    conversation_id,
                    senderId,
                    content: fileURL,
                    contentType,
                    ...(replyTo && mongoose.Types.ObjectId.isValid(replyTo) && { replyTo }),
                });

                await message.save();
                await message.populate('senderId', 'userName avatar'); // <<-- CẦN CÓ
                console.log('✅ Populated senderId:', message.senderId);
                io.to(conversation_id).emit('receive-message', message);

                return res.status(200).json({
                    thongbao: 'Tạo tin nhắn media thành công',
                    message,
                });
            }

            return res.status(400).json({
                message: 'Yêu cầu không hợp lệ: kiểm tra contentType và file(s)',
            });

        } catch (err) {
            console.error('❌ Lỗi tạo tin nhắn mobile:', err);
            return res.status(500).json({
                message: 'Lỗi server khi tạo tin nhắn',
                error: err.message,
            });
        }
    }


    // Hàm Mobile mới: Tạo thông báo cho sự kiện nhóm
    async createNotificationMobile(req, res) {
        const {
            conversation_id,
            sender_id,
            action,
            receiver_id,
            conversationNameNew,
        } = req.body
        let receiverName
        const senderName = await getUserName(sender_id)
        if (
            [
                'add',
                'remove',
                'exit',
                'addDeputyLeader',
                'changeGroupLeader',
                'deleteDeputyLeader',
            ].includes(action)
        ) {
            receiverName = await getUserName(receiver_id)
        }

        let content
        switch (action) {
            case 'add':
                content = `${receiverName} đã được ${senderName} thêm vào nhóm.`
                break
            case 'remove':
                content = `${receiverName} đã được ${senderName} xóa khỏi nhóm.`
                break
            case 'exit':
                content = `${senderName} đã rời khỏi nhóm.`
                break
            case 'rename':
                content = `Tên nhóm đã được ${senderName} thay đổi thành ${conversationNameNew}.`
                break
            case 'addDeputyLeader':
                content = `${receiverName} đã được ${senderName} bổ nhiệm làm Phó nhóm.`
                break
            case 'changeGroupLeader':
                content = `${receiverName} đã được ${senderName} chuyển quyền trưởng nhóm.`
                break
            case 'deleteDeputyLeader':
                content = `${receiverName} đã bị ${senderName} gỡ quyền phó nhóm.`
                break
            default:
                content = ''
        }

        const notification = new Message({
            conversation_id,
            senderId: sender_id,
            contentType: 'notify',
            content,
        })

        try {
            await notification.save()
            emitGroupEvent(conversation_id, action, {
                userName: receiverName || senderName,
                conversationName: conversationNameNew,
            })

            res.status(200).send({
                message: 'Tạo thông báo thành công',
                notification: notification.content,
                noti: notification,
            })
        } catch (err) {
            console.error('Lỗi tạo thông báo mobile:', err)
            res.status(500).send({
                message: 'Lỗi khi tạo thông báo.',
                error: err.message,
            })
        }
    }

    // Hàm Mobile mới: Chuyển tiếp tin nhắn
    async forwardMessageMobile(req, res) {
        const { message_id, conversation_id, user_id } = req.body

        try {
            const message = await Message.findById(message_id)
            if (!message) {
                return res
                    .status(404)
                    .json({ thongbao: 'Không tìm thấy tin nhắn!!!' })
            }

            const conversation = await Conversation.findById(conversation_id)
            if (!conversation) {
                return res
                    .status(404)
                    .json({ message: 'Không tìm thấy cuộc trò chuyện' })
            }
            if (!conversation.members.includes(user_id)) {
                return res
                    .status(403)
                    .json({ message: 'Bạn không phải thành viên của nhóm' })
            }

            const newMessage = new Message({
                conversation_id,
                senderId: user_id,
                content: message.content,
                contentType: message.contentType,
            })

            await newMessage.save()
            io.to(conversation_id).emit('receive-message', newMessage)
            return res.status(200).json({
                thongbao: 'Chuyển tiếp tin nhắn thành công!!!',
                message: newMessage,
            })
        } catch (err) {
            console.error('Lỗi chuyển tiếp tin nhắn mobile:', err)
            return res
                .status(500)
                .json({ message: 'Lỗi server', error: err.message })
        }
    }

    // Hàm Mobile mới: Lấy tất cả media (image)
    async getAllMediaMobile(req, res) {
        const conversation_id = req.body.conversation_id
        try {
            const media = await Message.find({
                conversation_id,
                contentType: { $in: ['image'] },
            })
            if (media.length === 0) {
                return res
                    .status(200)
                    .json({ thongbao: 'Không tìm thấy media!!!' })
            }
            const mediaLinks = media.map((m) => m.content)
            return res.status(200).json({
                thongbao: 'Tìm thấy media!!!',
                media: mediaLinks,
            })
        } catch (err) {
            console.error('Lỗi lấy media mobile:', err)
            return res
                .status(500)
                .json({ message: 'Lỗi server', error: err.message })
        }
    }

    // Hàm Mobile mới: Lấy tất cả file (file, video)
    async getAllFileMobile(req, res) {
        const conversation_id = req.body.conversation_id
        try {
            const files = await Message.find({
                conversation_id,
                contentType: { $in: ['file', 'video'] },
            })
            if (files.length === 0) {
                return res
                    .status(200)
                    .json({ thongbao: 'Không tìm thấy file!!!' })
            }
            return res.status(200).json({
                thongbao: 'Tìm thấy file!!!',
                files: files.map((f) => {
                    const fileParts = f.content.split('/')
                    const fileName = fileParts[fileParts.length - 1]
                    return { fileName, fileLink: f.content }
                }),
            })
        } catch (err) {
            console.error('Lỗi lấy file mobile:', err)
            return res
                .status(500)
                .json({ message: 'Lỗi server', error: err.message })
        }
    }
}

async function getUserName(userId) {
    const user = await User.findOne({ _id: userId })
    if (!user) {
        console.log('Không tìm thấy user!!!')
        return null
    } else {
        return user.userName
    }
}
export default new MessageController()
