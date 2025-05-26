// model/Message.js
import mongoose from 'mongoose'
const Schema = mongoose.Schema

const Message = new Schema(
    {
        conversation_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        /* receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },*/
        contentType: {
            type: String,
            enum: ['text', 'image', 'video', 'audio', 'file', 'notify', 'image_gallery'],
        },
        content: {
            type: Schema.Types.Mixed,
        },
        recalled: {
            type: Boolean,
            default: false,
        },
        deletedBy: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        // thêm reply
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
        },
        //thêm
        forwardFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        //thêm
        isForwarded: {
            type: Boolean,
            default: false,
        },
        //thêm
        forwardedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        // thêm
        forwardedAt: {
            type: Date,
            default: null,
        },
        //thêm
        originalSender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

    },
    { timestamps: true }
)
export default mongoose.model('Message', Message)
