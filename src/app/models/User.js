// model/User.js
import mongoose from 'mongoose'

const Schema = mongoose.Schema

const FriendRequests = new Schema({
    friend_id: { type: String },
    friendName: { type: String },
    avatar: { type: String },
    phoneNumber: { type: String },
})

const Friend = new Schema({
    friend_id: { type: String },
})
const Conversation = new Schema({
    conversation_id: { type: String },
})


const User = new Schema(
    {
        account_id: { type: String, required: true, unique: true },
        conversation_id: [Conversation],
        userName: { type: String, required: true },
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        phoneNumber: { type: String, required: true, unique: true },
        dateOfBirth: { type: String, required: true },
        gender: { type: String, required: true },
        avatar: { type: String, required: true },
        coverImage: { type: String },
        //Mobile
        sentFriendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
        friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
        //Mobile
        friend: [Friend],
        deleteFriend: [Friend],
        deleted: { type: Boolean, default: false },
        deletedAt: { type: Date },
        isOnline: { type: Boolean, default: false },
        
        
    },
    { timestamps: true }
)

export default mongoose.model('User', User)
