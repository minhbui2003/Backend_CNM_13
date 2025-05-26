import { io } from 'socket.io-client';

const socket = io('https://77bc-171-250-162-139.ngrok-free.app', {
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
