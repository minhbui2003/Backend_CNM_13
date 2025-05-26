import { io } from 'socket.io-client';

const socket = io('https://socket-cnm-13.onrender.com', {
    transports: ['websocket'],
    reconnection: true,
});

export const emitGroupEvent = (conversation_id, event, data) => {
    socket.emit('group-event-from-backend', {
        conversation_id,
        event,
        data,
    });
};
