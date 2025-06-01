import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export const initSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    // Test Prisma connection
    prisma.$connect()
        .then(() => console.log('MongoDB connected via Prisma'))
        .catch((err) => console.error('MongoDB connection error:', err));

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                console.error('No token provided for socket authentication');
                return next(new Error('Authentication error: No token provided'));
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                if (!decoded || !decoded.id) {
                    console.error('Invalid token payload:', decoded);
                    return next(new Error('Authentication error: Invalid token'));
                }

                // Set the userId on the socket object
                socket.userId = decoded.id;

                // Log the authenticated user
                console.log(`Socket authenticated for user: ${socket.userId}`);

                // Update user's online status
                await prisma.user.update({
                    where: { id: socket.userId },
                    data: { isOnline: true },
                });

                next();
            } catch (jwtError) {
                console.error('JWT verification error:', jwtError);
                return next(new Error(`JWT verification failed: ${jwtError.message}`));
            }
        } catch (error) {
            console.error('Socket authentication error:', error);
            next(new Error(`Authentication error: ${error.message}`));
        }
    });

    io.on('connection', (socket) => {

        socket.join(socket.userId);

        socket.on('join', (userId) => {
            socket.join(userId);
            io.emit('userStatus', { userId, isOnline: true });
        });

        socket.on('getUsers', async () => {
            try {
                const users = await prisma.user.findMany({
                    where: { id: { not: socket.userId } },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        profilePic: true,
                        isOnline: true,
                    },
                });

                const friendships = await prisma.friendship.findMany({
                    where: {
                        OR: [
                            { userAId: socket.userId },
                            { userBId: socket.userId },
                        ],
                    },
                    select: {
                        userAId: true,
                        userBId: true,
                    },
                });

                const friendIds = new Set(
                    friendships.map((f) =>
                        f.userAId === socket.userId ? f.userBId : f.userAId
                    )
                );

                const usersWithFriendStatus = users.map((user) => ({
                    ...user,
                    isFriend: friendIds.has(user.id),
                }));

                socket.emit('users', usersWithFriendStatus);
            } catch (error) {
                socket.emit('error', { message: 'Failed to fetch users' });
            }
        });

        socket.on('sendFriendRequest', async ({ receiverId }) => {
            try {
                // Log the socket authentication state for debugging
                console.log(`Processing friend request to ${receiverId}, socket.userId: ${socket.userId}`);

                // Check if socket is authenticated
                if (!socket.userId) {
                    console.error('Unauthorized: No user ID in socket');
                    socket.emit('friendRequestError', { message: 'Unauthorized: Please log in again' });
                    return;
                }

                const senderId = socket.userId;

                // Validate receiverId
                if (!receiverId) {
                    socket.emit('friendRequestError', { message: 'Receiver ID is required' });
                    return;
                }

                // Check if users exist
                const sender = await prisma.user.findUnique({ where: { id: senderId } });
                const receiver = await prisma.user.findUnique({ where: { id: receiverId } });

                if (!sender) {
                    console.error(`Sender not found: ${senderId}`);
                    socket.emit('friendRequestError', { message: 'Sender not found' });
                    return;
                }

                if (!receiver) {
                    console.error(`Receiver not found: ${receiverId}`);
                    socket.emit('friendRequestError', { message: 'Receiver not found' });
                    return;
                }

                // Check for existing request
                const existingRequest = await prisma.friendRequest.findFirst({
                    where: {
                        senderId,
                        receiverId,
                        status: 'pending',
                    },
                });

                if (existingRequest) {
                    socket.emit('friendRequestError', { message: 'Friend request already sent' });
                    return;
                }

                // Check for existing friendship
                const existingFriendship = await prisma.friendship.findFirst({
                    where: {
                        OR: [
                            { userAId: senderId, userBId: receiverId },
                            { userAId: receiverId, userBId: senderId },
                        ],
                    },
                });

                if (existingFriendship) {
                    socket.emit('friendRequestError', { message: 'Already friends' });
                    return;
                }

                // Create the friend request
                const friendRequest = await prisma.friendRequest.create({
                    data: {
                        senderId,
                        receiverId,
                        status: 'pending',
                    },
                    include: {
                        sender: { select: { id: true, name: true, email: true, profilePic: true } },
                        receiver: { select: { id: true, name: true, email: true, profilePic: true } },
                    },
                });

                console.log(`Friend request created: ${friendRequest.id} from ${senderId} to ${receiverId}`);

                // Emit events
                io.to(receiverId).emit('friendRequest', friendRequest);
                socket.emit('friendRequestSent', friendRequest);
            } catch (error) {
                console.error('Error sending friend request:', error);
                socket.emit('friendRequestError', { message: `Failed to send friend request: ${error.message}` });
            }
        });

        socket.on('acceptFriendRequest', async ({ requestId, senderId, receiverId }) => {
            try {
                if (socket.userId !== receiverId) return;

                const friendRequest = await prisma.friendRequest.findUnique({
                    where: { id: requestId },
                });

                if (!friendRequest || friendRequest.status !== 'pending') {
                    socket.emit('friendRequestError', { message: 'Invalid or already processed request' });
                    return;
                }

                await prisma.$transaction([
                    prisma.friendRequest.update({
                        where: { id: requestId },
                        data: { status: 'accepted' },
                    }),
                    prisma.friendship.create({
                        data: {
                            userAId: senderId,
                            userBId: receiverId,
                        },
                    }),
                ]);

                const friendship = { id: requestId, senderId, receiverId };
                io.to(senderId).emit('friendRequestAccepted', { requestId, senderId, friendship });
                io.to(receiverId).emit('friendRequestAccepted', { requestId, senderId, friendship });
                io.to(senderId).emit('friendshipCreated', { friendshipId: requestId, senderId });
                io.to(receiverId).emit('friendshipCreated', { friendshipId: requestId, receiverId });
            } catch (error) {
                socket.emit('friendRequestError', { message: 'Failed to accept friend request' });
            }
        });

        socket.on('rejectFriendRequest', async ({ requestId }) => {
            try {
                const friendRequest = await prisma.friendRequest.findUnique({
                    where: { id: requestId },
                });

                if (!friendRequest || friendRequest.status !== 'pending') {
                    socket.emit('friendRequestError', { message: 'Invalid or already processed request' });
                    return;
                }

                await prisma.friendRequest.update({
                    where: { id: requestId },
                    data: { status: 'rejected' },
                });

                io.to(friendRequest.senderId).emit('friendRequestRejected', { requestId });
                io.to(friendRequest.receiverId).emit('friendRequestRejected', { requestId });
            } catch (error) {
                socket.emit('friendRequestError', { message: 'Failed to reject friend request' });
            }
        });

        socket.on('cancelFriendRequest', async ({ requestId }) => {
            try {
                const friendRequest = await prisma.friendRequest.findUnique({
                    where: { id: requestId },
                });

                if (!friendRequest || friendRequest.status !== 'pending') {
                    socket.emit('friendRequestError', { message: 'Invalid or already processed request' });
                    return;
                }

                if (friendRequest.senderId !== socket.userId) {
                    socket.emit('friendRequestError', { message: 'Unauthorized' });
                    return;
                }

                await prisma.friendRequest.delete({
                    where: { id: requestId },
                });

                io.to(friendRequest.receiverId).emit('friendRequestCancelled', { requestId });
                socket.emit('friendRequestCancelled', { requestId });
            } catch (error) {
                socket.emit('friendRequestError', { message: 'Failed to cancel friend request' });
            }
        });

        socket.on('checkFriendRequests', async () => {
            try {
                const friendRequests = await prisma.friendRequest.findMany({
                    where: {
                        receiverId: socket.userId,
                        status: 'pending',
                    },
                    include: {
                        sender: { select: { id: true, name: true, email: true, profilePic: true } },
                    },
                });
                socket.emit('friendRequests', friendRequests);
            } catch (error) {
                socket.emit('friendRequestError', { message: 'Failed to check friend requests' });
            }
        });

        socket.on('checkSentFriendRequests', async () => {
            try {
                const sentFriendRequests = await prisma.friendRequest.findMany({
                    where: {
                        senderId: socket.userId,
                        status: 'pending',
                    },
                    include: {
                        receiver: { select: { id: true, name: true, email: true, profilePic: true } },
                    },
                });
                socket.emit('sentFriendRequests', sentFriendRequests);
            } catch (error) {
                socket.emit('friendRequestError', { message: 'Failed to check sent friend requests' });
            }
        });

        socket.on('sendMessage', async ({ senderId, receiverId, content }) => {
            try {
                if (senderId !== socket.userId) return;

                const sender = await prisma.user.findUnique({ where: { id: senderId } });
                const receiver = await prisma.user.findUnique({ where: { id: receiverId } });

                if (!sender || !receiver) {
                    socket.emit('error', { message: 'User not found' });
                    return;
                }

                const message = await prisma.message.create({
                    data: {
                        senderId,
                        receiverId,
                        content,
                    },
                });

                io.to(senderId).emit('receiveMessage', message);
                io.to(receiverId).emit('receiveMessage', message);
            } catch (error) {
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        socket.on('getMessages', async ({ friendId }) => {
            try {
                const messages = await prisma.message.findMany({
                    where: {
                        OR: [
                            { senderId: socket.userId, receiverId: friendId },
                            { senderId: friendId, receiverId: socket.userId },
                        ],
                    },
                    orderBy: { createdAt: 'asc' },
                });
                socket.emit('messages', messages);
            } catch (error) {
                socket.emit('error', { message: 'Failed to fetch messages' });
            }
        });

        socket.on('call-user', async ({ senderId, receiverId, signalData, callType }) => {
            try {
                if (socket.userId !== senderId) {
                    socket.emit('call-error', { message: 'Unauthorized' });
                    return;
                }

                const call = await prisma.call.create({
                    data: {
                        callerId: senderId,
                        receiverId,
                        callType,
                        status: 'outgoing',
                        startTime: new Date(),
                    },
                    include: {
                        caller: { select: { id: true, name: true } },
                        receiver: { select: { id: true, name: true } },
                    },
                });

                io.to(receiverId).emit('incoming-call', {
                    senderId,
                    receiverId,
                    signalData,
                    callType,
                    callId: call.id,
                });

                socket.emit('call-initiated', { callId: call.id });
            } catch (error) {
                socket.emit('call-error', { message: 'Failed to initiate call' });
            }
        });

        socket.on('accept-call', async ({ senderId, receiverId, signalData, callId }) => {
            try {
                if (socket.userId !== senderId) {
                    socket.emit('call-error', { message: 'Unauthorized' });
                    return;
                }

                const call = await prisma.call.update({
                    where: { id: callId },
                    data: {
                        status: 'incoming',
                        startTime: new Date(),
                    },
                    include: {
                        caller: { select: { id: true, name: true } },
                        receiver: { select: { id: true, name: true } },
                    },
                });

                io.to(receiverId).emit('accept-call', {
                    senderId,
                    signalData,
                    callId,
                });

                io.to(senderId).emit('call-updated', { call });
                io.to(receiverId).emit('call-updated', { call });
            } catch (error) {
                socket.emit('call-error', { message: 'Failed to accept call' });
            }
        });

        socket.on('reject-call', async ({ senderId, receiverId, callId }) => {
            try {
                if (socket.userId !== senderId) {
                    socket.emit('call-error', { message: 'Unauthorized' });
                    return;
                }

                const call = await prisma.call.update({
                    where: { id: callId },
                    data: {
                        status: 'missed',
                        updatedAt: new Date(),
                    },
                    include: {
                        caller: { select: { id: true, name: true } },
                        receiver: { select: { id: true, name: true } },
                    },
                });

                io.to(receiverId).emit('reject-call', { callId });

                io.to(senderId).emit('call-updated', { call });
                io.to(receiverId).emit('call-updated', { call });
            } catch (error) {
                socket.emit('call-error', { message: 'Failed to reject call' });
            }
        });

        socket.on('end-call', async ({ senderId, receiverId, callId }) => {
            try {

                if (socket.userId !== senderId) {
                    socket.emit('call-error', { message: 'Unauthorized' });
                    return;
                }

                if (!callId) {
                    socket.emit('call-error', { message: 'Invalid call ID' });
                    // Still emit end-call to clean up client-side
                    io.to(receiverId).emit('end-call', { callId: null });
                    return;
                }

                const call = await prisma.call.findUnique({
                    where: { id: callId },
                    include: {
                        caller: { select: { id: true, name: true } },
                        receiver: { select: { id: true, name: true } },
                    },
                });

                if (!call) {
                    socket.emit('call-error', { message: 'Call not found' });
                    io.to(receiverId).emit('end-call', { callId });
                    return;
                }

                let updatedCall;
                if (call.startTime && call.status === 'incoming') {
                    const duration = Math.floor((new Date() - new Date(call.startTime)) / 1000);
                    updatedCall = await prisma.call.update({
                        where: { id: callId },
                        data: {
                            duration,
                            updatedAt: new Date(),
                        },
                        include: {
                            caller: { select: { id: true, name: true } },
                            receiver: { select: { id: true, name: true } },
                        },
                    });
                } else {
                    updatedCall = await prisma.call.update({
                        where: { id: callId },
                        data: {
                            status: 'missed',
                            updatedAt: new Date(),
                        },
                        include: {
                            caller: { select: { id: true, name: true } },
                            receiver: { select: { id: true, name: true } },
                        },
                    });
                }


                io.to(receiverId).emit('end-call', { callId });

                io.to(senderId).emit('call-updated', { call: updatedCall });
                io.to(receiverId).emit('call-updated', { call: updatedCall });
            } catch (error) {
                socket.emit('call-error', { message: 'Failed to end call' });
                io.to(receiverId).emit('end-call', { callId });
            }
        });

        socket.on('getCallHistory', async ({ friendId }) => {
            try {
                const calls = await prisma.call.findMany({
                    where: {
                        OR: [
                            { callerId: socket.userId, receiverId: friendId },
                            { callerId: friendId, receiverId: socket.userId },
                        ],
                    },
                    orderBy: { createdAt: 'asc' },
                    include: {
                        caller: { select: { id: true, name: true } },
                        receiver: { select: { id: true, name: true } },
                    },
                });
                socket.emit('callHistory', calls);
            } catch (error) {
                console.error('Error fetching call history:', error.message, error.stack);
            }
        });

        socket.on('disconnect', async () => {
            try {
                await prisma.user.update({
                    where: { id: socket.userId },
                    data: { isOnline: false },
                });
                io.emit('userStatus', { userId: socket.userId, isOnline: false });
            } catch (error) {
                console.error('Error on disconnect:', error.message);
            }
        });
    });

    return io;
};