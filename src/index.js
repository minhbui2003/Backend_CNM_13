import express from 'express'
import morgan from 'morgan'
import methodOverride from 'method-override'
import cors from 'cors'
import path from 'path'
import { createServer } from 'http'
import { Server } from 'socket.io'
import bodyParser from 'body-parser'
import passport from 'passport'
import passportLocal from 'passport-local'

import route from './routes/index.js'
import db from './config/db/index.js'

const app = express()
const port = 3001
const server = createServer(app)

// Khởi tạo Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*',
    },
})
export { io } // ✅ export io để controller dùng được

// Middleware
app.use(cors())
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.set('view engine', 'ejs')
app.set('views', './src/views')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(passport.initialize())

// Unlock cors for all routes
app.use((req, res, next) => {
    const origin = req.headers['origin'] || '*'
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    next()
})
app.use(methodOverride('_method'))

// Logger
app.use(morgan('combined'))

// Routes init
route(app)

// Kết nối DB và khởi động server
db.connect()
    .then(() => {
        server.listen(port, () => {
            console.log(`✅ Backend API đang chạy tại http://localhost:${port}`)
        })
    })
    .catch((error) => {
        console.error('❌ Kết nối DB thất bại:', error)
    })
