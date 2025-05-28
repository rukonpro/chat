import { Server } from 'socket.io';
import prisma from './prisma.js';
import { verifyToken } from './auth.js';

// Global singleton instance
let io;

const socketModule = {
    initSocket: (server) => {
        if (io) return io; // Return existing instance if already initialized

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

            // Listen for unfriend events
            socket.on('unfriend', async ({ friendId }) => {
                if (!socket.userId) return;

                try {
                    // Find the friendship
                    const friendship = await prisma.friendship.findFirst({
                        where: {
                            OR: [
                                { userAId: socket.userId, userBId: friendId },
                                { userAId: friendId, userBId: socket.userId },
                            ],
                        },
                    });

                    if (friendship) {
                        // Delete the friendship
                        await prisma.friendship.delete({
                            where: { id: friendship.id },
                        });

                        // Notify both users
                        io.to(friendId).emit('unfriended', { userId: socket.userId });
                        socket.emit('unfriended', { userId: friendId });
                    }
                } catch (error) {
                    console.error('Error in unfriend socket event:', error);
                }
            });

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

            // Listen for friend request events
            socket.on('checkFriendRequests', async () => {
                if (!socket.userId) return;

                try {
                    // Get pending friend requests for the user
                    const pendingRequests = await prisma.friendRequest.findMany({
                        where: { receiverId: socket.userId, status: 'pending' },
                        include: {
                            sender: { select: { id: true, name: true, email: true } },
                        },
                    });

                    // Emit the pending requests to the user
                    socket.emit('friendRequests', pendingRequests);
                } catch (error) {
                    console.error('Error checking friend requests:', error);
                }
            });

            // Listen for sent friend requests
            socket.on('checkSentFriendRequests', async () => {
                if (!socket.userId) return;

                try {
                    // Get sent friend requests by the user
                    const sentRequests = await prisma.friendRequest.findMany({
                        where: { senderId: socket.userId, status: 'pending' },
                        include: {
                            receiver: { select: { id: true, name: true, email: true } },
                        },
                    });

                    // Emit the sent requests to the user
                    socket.emit('sentFriendRequests', sentRequests);
                } catch (error) {
                    console.error('Error checking sent friend requests:', error);
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
        // Return a dummy IO object if not initialized to prevent errors
        if (!io) {
            console.warn('Socket.IO not initialized, returning dummy IO object');
            return {
                to: () => ({
                    emit: () => console.warn('Socket.IO emit called but not initialized')
                })
            };
        }
        return io;
    },
};

export const initSocket = socketModule.initSocket;
export const getIO = socketModule.getIO;
