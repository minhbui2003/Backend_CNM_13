import mongoose from 'mongoose'
const Schema = mongoose.Schema

const Account = new Schema({
    phoneNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true },
})
// const Account = new Schema({
//     // viết đầy đủ thông tin firstname, lastname, numberphone, date of birth , Gender, password, confirm password
//     firstName: { type: String, required: true },
//     lastName: { type: String, required: true },
//     phoneNumber: { type: String, required: true, unique: true },
//     dateOfBirth: { type: String, required: true },
//     gender: { type: String, required: true },
//     password: { type: String, required: true },
// })

export default mongoose.model('Account', Account)
