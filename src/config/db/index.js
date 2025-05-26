import mongoose from 'mongoose'

async function connect() {
    try {
        await mongoose.connect('mongodb+srv://zola:sapassword@cluster0.zidv2ja.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000, // Tăng lên 30 giây
            socketTimeoutMS: 45000,
        })
        console.log('Connect to Database successfully!!!')
    } catch (err) {
        console.log('Connect failure!!!')
        console.error(err)
    }
}

export default { connect }