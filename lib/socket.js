const { Server } = require('socket.io');
const prisma = require('@/lib/prisma');
const { verifyToken } = require('@/lib/auth');

let io;

module.exports = {
    initSocket: (server) => {
        io = new Server(server, {
            cors: {
                origin: ['http://localhost:3000'], // ফ্রন্টএন্ডের URL
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });

        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error: Token missing'));
            }
            try {
                const decoded = verifyToken(token);
                socket.userId = decoded.id;
                next();
            } catch (error) {
                next(new Error('Authentication error: Invalid token'));
            }
        });

        io.on('connection', (socket) => {
            console.log(`User connected: ${socket.id}, UserID: ${socket.userId}`);

            socket.on('join', async (userId) => {
                if (socket.userId !== userId) return;

                socket.join(userId);
                console.log(`User ${userId} joined room`);

                await prisma.user.update({
                    where: { id: userId },
                    data: { isOnline: true },
                });

                const friendships = await prisma.friendship.findMany({
                    where: {
                        OR: [{ userAId: userId }, { userBId: userId }],
                    },
                    select: {
                        userA: { select: { id: true } },
                        userB: { select: { id: true } },
                    },
                });

                const friendIds = friendships.map((f) =>
                    f.userA.id === userId ? f.userB.id : f.userA.id
                );

                friendIds.forEach((friendId) => {
                    io.to(friendId).emit('userStatus', { userId, isOnline: true });
                });
            });

            socket.on('sendMessage', async ({ senderId, receiverId, content }) => {
                if (socket.userId !== senderId) return;

                try {
                    const message = await prisma.message.create({
                        data: { senderId, receiverId, content },
                    });

                    io.to(receiverId).emit('receiveMessage', {
                        id: message.id,
                        senderId,
                        receiverId,
                        content,
                        createdAt: message.createdAt,
                    });

                    socket.emit('receiveMessage', {
                        id: message.id,
                        senderId,
                        receiverId,
                        content,
                        createdAt: message.createdAt,
                    });
                } catch (error) {
                    console.error('Error sending message:', error);
                }
            });

            socket.on('disconnect', async () => {
                console.log(`User disconnected: ${socket.id}`);

                if (socket.userId) {
                    await prisma.user.update({
                        where: { id: socket.userId },
                        data: { isOnline: false },
                    });

                    const friendships = await prisma.friendship.findMany({
                        where: {
                            OR: [{ userAId: socket.userId }, { userBId: socket.userId }],
                        },
                        select: {
                            userA: { select: { id: true } },
                            userB: { select: { id: true } },
                        },
                    });

                    const friendIds = friendships.map((f) =>
                        f.userA.id === socket.userId ? f.userB.id : f.userA.id
                    );

                    friendIds.forEach((friendId) => {
                        io.to(friendId).emit('userStatus', { userId: socket.userId, isOnline: false });
                    });
                }
            });
        });

        return io;
    },

    getIO: () => {
        if (!io) {
            throw new Error('Socket.IO not initialized');
        }
        return io;
    },
};