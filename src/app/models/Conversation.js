import mongoose from 'mongoose'
const Schema = mongoose.Schema
import mongooseDelete from 'mongoose-delete'

const avatarOptions = [
    'https://ava-grp-talk.zadn.vn/d/f/7/2/4/360/437175156823fa97cdd9f38a46f1bb7e.jpg',
    'https://s480-ava-grp-talk.zadn.vn/7/8/5/b/6/480/437175156823fa97cdd9f38a46f1bb7e.jpg',
    'https://s480-ava-grp-talk.zadn.vn/e/6/a/9/8/480/437175156823fa97cdd9f38a46f1bb7e.jpg',
    'https://ava-grp-talk.zadn.vn/5/c/6/6/2/360/437175156823fa97cdd9f38a46f1bb7e.jpg',
]
// tạo 1 function random avatar
const randomAvatar = () => {
    return avatarOptions[Math.floor(Math.random() * avatarOptions.length)]
}

const Conversation = new Schema(
    {
        members: { type: Array, required: true },
        conversationName: { type: String, required: false },
        avatar: {
            type: String,
            default: randomAvatar(),
        },
        groupLeader: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        },
        deputyLeader: {
            type: Array,
        },
        lastMessage: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        
        deputyLeaders: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    { timestamps: true }
)
Conversation.plugin(mongooseDelete, {
    deletedAt: true,
})
export default mongoose.model('Conversation', Conversation)
