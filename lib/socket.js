import { Server } from 'socket.io';
import prisma from './prisma.js';
import { verifyToken } from './auth.js';
import { retryOperation } from './prismaUtils.js';

// Global singleton instance
let io;

const socketModule = {
    initSocket: (server) => {
        if (io) return io; // Return existing instance if already initialized

        io = new Server(server, {
            cors: {
                origin: process.env.NEXT_PUBLIC_FRONTEND_URL || "*", // Frontend URL with fallback
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
            if (process.env.NODE_ENV !== 'production') {
                console.log(`User connected: ${socket.id}, UserID: ${socket.userId}`);
            }

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
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`User ${userId} joined room`);
                }

                try {
                    await retryOperation(async () => {
                        return await prisma.user.update({
                            where: { id: userId },
                            data: { isOnline: true },
                        });
                    });
                } catch (error) {
                    console.error('Error updating user online status:', error);
                }

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

            // Get user data and friends list
            socket.on('getUsers', async () => {
                if (!socket.userId) return;

                try {
                    // Get the current user to ensure we're online
                    await retryOperation(async () => {
                        return await prisma.user.update({
                            where: { id: socket.userId },
                            data: { isOnline: true },
                        });
                    });

                    const users = await prisma.user.findMany({
                        where: { id: { not: socket.userId } },
                        select: {
                            id: true,
                            email: true,
                            name: true,
                            profilePic: true,
                            isOnline: true,
                        },
                    });

                    // Get friendships for the current user
                    const friendships = await prisma.friendship.findMany({
                        where: {
                            OR: [{ userAId: socket.userId }, { userBId: socket.userId }],
                        },
                        select: {
                            userAId: true,
                            userBId: true,
                        },
                    });

                    const friendIds = friendships.map((f) =>
                        f.userAId === socket.userId ? f.userBId : f.userAId
                    );

                    // Add isFriend field to users and verify online status
                    const usersWithFriendStatus = users.map((user) => {
                        // If a socket connection exists for this user, they're online
                        // Otherwise, they should be marked as offline regardless of DB state
                        let isReallyOnline = false;

                        // Initialize all users as offline by default
                        // Only mark them as online if we can confirm they have an active socket connection
                        if (io.sockets.sockets.size > 0) {
                            io.sockets.sockets.forEach((s) => {
                                if (s.userId === user.id) {
                                    isReallyOnline = true;
                                }
                            });
                        }

                        return {
                            ...user,
                            isOnline: isReallyOnline, // Override with the real status
                            isFriend: friendIds.includes(user.id),
                        };
                    });

                    socket.emit('users', usersWithFriendStatus);
                } catch (error) {
                    console.error('Error getting users:', error);
                }
            });

            // Get user profile
            socket.on('getUserProfile', async () => {
                if (!socket.userId) return;

                try {
                    const user = await prisma.user.findUnique({
                        where: { id: socket.userId },
                        select: { id: true, email: true, name: true, bio: true, profilePic: true, isOnline: true },
                    });

                    socket.emit('userProfile', user);
                } catch (error) {
                    console.error('Error getting user profile:', error);
                }
            });

            // Update user profile
            socket.on('updateUserProfile', async ({ name, bio, profilePic }) => {
                if (!socket.userId) return;

                try {
                    const updatedUser = await retryOperation(async () => {
                        return await prisma.user.update({
                            where: { id: socket.userId },
                            data: { name, bio, profilePic },
                            select: { id: true, email: true, name: true, bio: true, profilePic: true, isOnline: true },
                        });
                    });

                    socket.emit('userProfileUpdated', { message: 'Profile updated', user: updatedUser });
                } catch (error) {
                    console.error('Error updating user profile:', error);
                }
            });

            // Get messages for a specific friend
            socket.on('getMessages', async ({ friendId }) => {
                if (!socket.userId) return;

                try {
                    const messages = await prisma.message.findMany({
                        where: {
                            OR: [
                                { senderId: socket.userId, receiverId: friendId },
                                { senderId: friendId, receiverId: socket.userId },
                            ],
                        },
                        select: {
                            id: true,
                            senderId: true,
                            receiverId: true,
                            content: true,
                            createdAt: true,
                        },
                        orderBy: { createdAt: 'asc' },
                    });

                    socket.emit('messages', messages);
                } catch (error) {
                    console.error('Error getting messages:', error);
                }
            });

            // Send friend request
            socket.on('sendFriendRequest', async ({ receiverId }) => {
                if (!socket.userId) return;

                try {
                    const existingRequest = await prisma.friendRequest.findFirst({
                        where: { senderId: socket.userId, receiverId, status: 'pending' },
                    });
                    if (existingRequest) {
                        socket.emit('friendRequestError', { message: 'Request already sent' });
                        return;
                    }

                    const friendRequest = await prisma.friendRequest.create({
                        data: { senderId: socket.userId, receiverId, status: 'pending' },
                    });

                    io.to(receiverId).emit('friendRequest', {
                        id: friendRequest.id,
                        senderId: socket.userId,
                        receiverId,
                        status: friendRequest.status,
                        createdAt: friendRequest.createdAt,
                    });

                    // Also emit to the sender for real-time updates across multiple tabs/devices
                    socket.emit('friendRequestSent', {
                        id: friendRequest.id,
                        senderId: socket.userId,
                        receiverId,
                        status: friendRequest.status,
                        createdAt: friendRequest.createdAt,
                    });
                } catch (error) {
                    console.error('Error sending friend request:', error);
                    socket.emit('friendRequestError', { message: 'Server error' });
                }
            });

            // Accept friend request
            socket.on('acceptFriendRequest', async ({ requestId }) => {
                if (!socket.userId) return;

                try {
                    const request = await prisma.friendRequest.findUnique({
                        where: { id: requestId },
                    });

                    if (!request || request.receiverId !== socket.userId) {
                        socket.emit('friendRequestError', { message: 'Invalid request' });
                        return;
                    }

                    // Update request status
                    await prisma.friendRequest.update({
                        where: { id: requestId },
                        data: { status: 'accepted' },
                    });

                    // Create friendship
                    const friendship = await prisma.friendship.create({
                        data: {
                            userAId: request.senderId,
                            userBId: request.receiverId,
                        },
                    });

                    // Notify both users
                    io.to(request.senderId).emit('friendRequestAccepted', {
                        requestId,
                        receiverId: socket.userId,
                        friendship,
                    });
                    socket.emit('friendRequestAccepted', {
                        requestId,
                        senderId: request.senderId,
                        friendship,
                    });

                    // Emit friendship created event
                    io.to(request.senderId).emit('friendshipCreated', {
                        friendshipId: friendship.id,
                        senderId: socket.userId,
                    });
                    socket.emit('friendshipCreated', {
                        friendshipId: friendship.id,
                        senderId: request.senderId,
                    });
                } catch (error) {
                    console.error('Error accepting friend request:', error);
                    socket.emit('friendRequestError', { message: 'Server error' });
                }
            });

            // Reject friend request
            socket.on('rejectFriendRequest', async ({ requestId }) => {
                if (!socket.userId) return;

                try {
                    const request = await prisma.friendRequest.findUnique({
                        where: { id: requestId },
                    });

                    if (!request || request.receiverId !== socket.userId) {
                        socket.emit('friendRequestError', { message: 'Invalid request' });
                        return;
                    }

                    // Update request status
                    await prisma.friendRequest.update({
                        where: { id: requestId },
                        data: { status: 'rejected' },
                    });

                    // Notify both users
                    io.to(request.senderId).emit('friendRequestRejected', { requestId });
                    socket.emit('friendRequestRejected', { requestId });
                } catch (error) {
                    console.error('Error rejecting friend request:', error);
                    socket.emit('friendRequestError', { message: 'Server error' });
                }
            });

            // Cancel friend request
            socket.on('cancelFriendRequest', async ({ requestId }) => {
                if (!socket.userId) return;

                try {
                    const request = await prisma.friendRequest.findUnique({
                        where: { id: requestId },
                    });

                    if (!request || request.senderId !== socket.userId) {
                        socket.emit('friendRequestError', { message: 'Invalid request' });
                        return;
                    }

                    // Delete the request
                    await prisma.friendRequest.delete({
                        where: { id: requestId },
                    });

                    // Notify both users
                    io.to(request.receiverId).emit('friendRequestCancelled', { requestId });
                    socket.emit('friendRequestCancelled', { requestId });
                } catch (error) {
                    console.error('Error cancelling friend request:', error);
                    socket.emit('friendRequestError', { message: 'Server error' });
                }
            });

            socket.on('disconnect', async () => {
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`User disconnected: ${socket.id}`);
                }

                if (socket.userId) {
                    // Check if the user has other active connections before marking as offline
                    let hasOtherConnections = false;
                    io.sockets.sockets.forEach((s) => {
                        if (s.id !== socket.id && s.userId === socket.userId) {
                            hasOtherConnections = true;
                        }
                    });

                    // Only mark as offline if this was their last connection
                    if (!hasOtherConnections) {
                        try {
                            await retryOperation(async () => {
                                return await prisma.user.update({
                                    where: { id: socket.userId },
                                    data: { isOnline: false },
                                });
                            });
                        } catch (error) {
                            console.error('Failed to update user offline status:', error);
                        }

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
                }
            });
        });

        return io;
    },

    getIO: () => {
        // Return a dummy IO object if not initialized to prevent errors
        if (!io) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('Socket.IO not initialized, returning dummy IO object');
            }
            return {
                to: () => ({
                    emit: () => {
                        if (process.env.NODE_ENV !== 'production') {
                            console.warn('Socket.IO emit called but not initialized');
                        }
                    }
                })
            };
        }
        return io;
    },
};

export const initSocket = socketModule.initSocket;
export const getIO = socketModule.getIO;
