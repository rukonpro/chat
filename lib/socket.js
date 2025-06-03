import {Server} from 'socket.io';
import {PrismaClient} from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const activeCallRequests = new Map(); // Map to track active call requests

// Add a debug logging system
const debugLog = (message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, data);

    // Optionally log to a file or database
};

// Add a retry mechanism for database operations
const retryDatabaseOperation = async (operation, maxRetries = 3) => {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            console.error(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error);
            lastError = error;

            // Wait before retrying (exponential backoff)
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
            }
        }
    }
    throw lastError;
};

// Check if the MessageReaction model is properly set up in Prisma
const ensureReactionModelExists = async () => {
    try {
        // Try to query the collection to see if it exists and is accessible
        await prisma.messageReaction.findFirst();
        return true;
    } catch (error) {
        // Check if this is a schema validation error
        if (error.message.includes('does not exist') || 
            error.message.includes('not found') ||
            error.message.includes('unknown model')) {

            // Log the current Prisma models for debugging
            try {
                const dmmf = await prisma._getDmmf();
            } catch (dmmfError) {
                console.error('Could not retrieve Prisma models:', dmmfError);
            }

            return false;
        }
        
        // For other errors, it might be a connection issue

        return false;
    }
};

export const initSocket = async (server) => {
    // Call this function when initializing the socket server
    await ensureReactionModelExists();

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

    // Set up periodic cleanup of stale calls
    const cleanupInterval = setInterval(async () => {
        try {
            // Mark calls older than 2 minutes as missed
            const result = await prisma.call.updateMany({
                where: {
                    status: { in: ['outgoing', 'incoming'] },
                    createdAt: { lt: new Date(Date.now() - 2 * 60 * 1000) }
                },
                data: {
                    status: 'missed',
                    updatedAt: new Date()
                }
            });

            if (result.count > 0) {
                console.log(`Cleaned up ${result.count} stale calls`);
            }
        } catch (error) {
            console.error('Error during call cleanup:', error);
        }
    }, 60000); // Run every minute

    // Clean up the interval when the server is shutting down
    process.on('SIGTERM', () => {
        clearInterval(cleanupInterval);
    });

    // Ensure the authentication middleware is working correctly
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            // Verify the token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // The issue is here - your auth.js generates tokens with 'id' but you're looking for 'userId'
            // Check both properties to ensure compatibility
            const userId = decoded.id || decoded.userId;

            if (!userId) {
                debugLog('Token verification failed: No user ID in token', { decoded });
                return next(new Error('Authentication error: Invalid token format'));
            }

            // Check if user exists
            const user = await prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user) {
                debugLog('User not found', { userId });
                return next(new Error('Authentication error: User not found'));
            }

            // Attach user ID to socket
            socket.userId = userId;
            console.log(`Socket authenticated for user: ${userId}`);

            // Update user's online status
            await prisma.user.update({
                where: { id: userId },
                data: { isOnline: true },
            });

            next();
        } catch (error) {
            console.error('Socket authentication error:', error.message);
            next(new Error('Authentication error: ' + error.message));
        }
    });

    io.on('connection', (socket) => {

        socket.join(socket.userId);

        socket.on('join', (userId) => {
            if (socket.userId !== userId) {
                console.log(`Unauthorized join attempt for room ${userId} by socket ${socket.id}`);
                return;
            }

            console.log(`User ${userId} joining their own room`);
            socket.join(userId);
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
                const userId = socket.userId;
                if (!userId) {
                    return socket.emit('error', { message: 'Unauthorized: Please log in again' });
                }

                console.log(`Fetching messages between ${userId} and ${friendId}`);

                // Get messages between the two users
                const messages = await prisma.message.findMany({
                    where: {
                        OR: [
                            { senderId: userId, receiverId: friendId },
                            { senderId: friendId, receiverId: userId }
                        ]
                    },
                    orderBy: {
                        createdAt: 'asc'
                    },
                    include: {
                        reactions: true // Include reactions with the messages
                    }
                });

                console.log(`Found ${messages.length} messages with ${messages.reduce((sum, msg) => sum + (msg.reactions?.length || 0), 0)} total reactions`);

                // Mark messages as read
                const unreadMessages = messages.filter(
                    msg => msg.senderId === friendId && !msg.isRead
                );

                if (unreadMessages.length > 0) {
                    await prisma.message.updateMany({
                        where: {
                            id: { in: unreadMessages.map(msg => msg.id) }
                        },
                        data: {
                            isRead: true
                        }
                    });

                    // Notify the sender that their messages have been read
                    socket.to(friendId).emit('messagesRead', {
                        messageIds: unreadMessages.map(msg => msg.id)
                    });
                }

                socket.emit('messages', messages);
            } catch (error) {
                console.error('Error in getMessages handler:', error);
                socket.emit('error', { message: 'Failed to fetch messages' });
            }
        });

        socket.on('call-user', async ({ senderId, receiverId, signalData, callType }) => {
            try {
                debugLog('call-user event received', { senderId, receiverId, callType });

                if (socket.userId !== senderId) {
                    debugLog('Unauthorized call attempt', { socketUserId: socket.userId, senderId });
                    socket.emit('call-error', { message: 'Unauthorized' });
                    return;
                }

                console.log(`Processing call request from ${senderId} to ${receiverId}, type: ${callType}`);

                // Check if users exist and are connected
                const sender = await prisma.user.findUnique({ where: { id: senderId } });
                const receiver = await prisma.user.findUnique({ where: { id: receiverId } });

                if (!sender || !receiver) {
                    socket.emit('call-error', { message: 'User not found' });
                    return;
                }

                // Check if the receiver is online by checking if they have a socket connection
                const receiverSocket = Array.from(io.sockets.sockets.values()).find(
                    (s) => s.userId === receiverId
                );

                if (!receiverSocket) {
                    socket.emit('call-error', { message: 'User is offline' });
                    return;
                }

                // Check for existing active calls between these users
                const existingCall = await prisma.call.findFirst({
                    where: {
                        OR: [
                            { callerId: senderId, receiverId: receiverId },
                            { callerId: receiverId, receiverId: senderId }
                        ],
                        status: { in: ['outgoing', 'incoming'] }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                // If there's an existing call, reuse it instead of creating a new one
                let call;
                if (existingCall) {
                    debugLog('Found existing active call', { callId: existingCall.id });

                    // Update the existing call
                    call = await prisma.call.update({
                        where: { id: existingCall.id },
                        data: {
                            callType, // Update call type in case it changed
                            status: 'outgoing',
                            startTime: new Date(),
                            updatedAt: new Date()
                        },
                        include: {
                            caller: { select: { id: true, name: true } },
                            receiver: { select: { id: true, name: true } },
                        },
                    });

                    debugLog('Updated existing call', { callId: call.id });
                } else {
                    // Create a new call record
                    call = await prisma.call.create({
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

                    debugLog('Created new call', { callId: call.id });
                }

                // Store the call ID in the activeCallRequests map
                const callKey = `${senderId}-${receiverId}`;
                activeCallRequests.set(callKey, call.id);

                debugLog('Stored call ID in activeCallRequests', { callKey, callId: call.id });

                // Emit the incoming-call event to the receiver
                debugLog('Emitting incoming-call event', { 
                    to: receiverId, 
                    callId: call.id,
                    hasSignalData: !!signalData
                });
                
                io.to(receiverId).emit('incoming-call', {
                    senderId,
                    receiverId,
                    signalData,
                    callType,
                    callId: call.id,
                    timestamp: new Date().toISOString()
                });

                // Also emit to the caller to confirm the call was initiated
                socket.emit('call-initiated', {
                    callId: call.id,
                    receiverId
                });

                console.log(`Call initiated: ${call.id} from ${senderId} to ${receiverId}`);
            } catch (error) {
                debugLog('Error in call-user handler', { error: error.message });
                socket.emit('call-error', { message: 'Failed to initiate call: ' + error.message });
            }
        });

        socket.on('accept-call', async ({ senderId, receiverId, signalData, callId }) => {
            try {
                debugLog('accept-call event received', { senderId, receiverId, callId });
                
                if (socket.userId !== senderId) {
                    socket.emit('call-error', { message: 'Unauthorized' });
                    return;
                }

                console.log(`Processing call acceptance: ${senderId} accepting call ${callId} from ${receiverId}`);

                // If callId is not provided, try to find it from activeCallRequests
                if (!callId) {
                    const callKey = `${receiverId}-${senderId}`;
                    const storedCallId = activeCallRequests.get(callKey);
                    
                    if (storedCallId) {
                        debugLog('Found call ID in activeCallRequests', { callKey, callId: storedCallId });
                        callId = storedCallId;
                    } else {
                        // Try to find the most recent active call between these users
                        const recentCall = await prisma.call.findFirst({
                            where: {
                                callerId: receiverId,
                                receiverId: senderId,
                                status: 'outgoing'
                            },
                            orderBy: {
                                createdAt: 'desc'
                            }
                        });
                        
                        if (recentCall) {
                            debugLog('Found recent call in database', { callId: recentCall.id });
                            callId = recentCall.id;
                        } else {
                            socket.emit('call-error', { message: 'Invalid call ID' });
                            return;
                        }
                    }
                }

                const call = await prisma.call.findUnique({
                    where: { id: callId },
                    include: {
                        caller: { select: { id: true, name: true } },
                        receiver: { select: { id: true, name: true } },
                    },
                });

                if (!call) {
                    debugLog('Call not found', { callId });
                    socket.emit('call-error', { message: 'Call not found' });
                    return;
                }

                // Verify this user is the intended receiver of the call
                if (call.receiverId !== senderId) {
                    debugLog('User is not the receiver', { callReceiverId: call.receiverId, userId: senderId });
                    socket.emit('call-error', { message: 'You are not the receiver of this call' });
                    return;
                }

                // Update call status
                const updatedCall = await prisma.call.update({
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

                debugLog('Call updated', { callId, status: 'incoming' });

                // Send the accept-call signal to the caller
                io.to(receiverId).emit('accept-call', {
                    senderId,
                    signalData,
                    callId,
                });

                // Update both users with the new call status
                io.to(senderId).emit('call-updated', { call: updatedCall });
                io.to(receiverId).emit('call-updated', { call: updatedCall });
                
                console.log(`Call ${callId} accepted by ${senderId}`);
            } catch (error) {
                console.error('Error accepting call:', error);
                socket.emit('call-error', { message: 'Failed to accept call: ' + error.message });
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
                debugLog('end-call event received', { senderId, receiverId, callId });

                if (socket.userId !== senderId) {
                    socket.emit('call-error', { message: 'Unauthorized' });
                    return;
                }

                // If callId is not provided, try to find it from activeCallRequests
                if (!callId) {
                    // Try both directions since either user could be ending the call
                    const callKey1 = `${senderId}-${receiverId}`;
                    const callKey2 = `${receiverId}-${senderId}`;

                    const storedCallId = activeCallRequests.get(callKey1) || activeCallRequests.get(callKey2);

                    if (storedCallId) {
                        debugLog('Found call ID in activeCallRequests', { callKey: callKey1, callId: storedCallId });
                        callId = storedCallId;
                    } else {
                        // Try to find the most recent active call between these users
                        const recentCall = await prisma.call.findFirst({
                            where: {
                                OR: [
                                    { callerId: senderId, receiverId: receiverId },
                                    { callerId: receiverId, receiverId: senderId }
                                ],
                                status: { in: ['outgoing', 'incoming'] }
                            },
                            orderBy: {
                                createdAt: 'desc'
                            }
                        });

                        if (recentCall) {
                            debugLog('Found recent call in database', { callId: recentCall.id });
                            callId = recentCall.id;
                        } else {
                            // If we still can't find a call ID, just emit end-call to clean up client-side
                            debugLog('No call ID found, emitting end-call anyway', { senderId, receiverId });
                            io.to(receiverId).emit('end-call', { callId: null });
                            return;
                        }
                    }
                }

                const call = await prisma.call.findUnique({
                    where: { id: callId },
                    include: {
                        caller: { select: { id: true, name: true } },
                        receiver: { select: { id: true, name: true } },
                    },
                });

                if (!call) {
                    debugLog('Call not found', { callId });
                    socket.emit('call-error', { message: 'Call not found' });
                    io.to(receiverId).emit('end-call', { callId });
                    return;
                }

                // Calculate call duration
                let duration = null;
                if (call.startTime) {
                    duration = Math.floor((new Date() - new Date(call.startTime)) / 1000);
                }

                // Update call status
                const updatedCall = await prisma.call.update({
                    where: { id: callId },
                    data: {
                        status: 'ended',
                        duration,
                        updatedAt: new Date(),
                    },
                    include: {
                        caller: { select: { id: true, name: true } },
                        receiver: { select: { id: true, name: true } },
                    },
                });

                debugLog('Call updated', { callId, status: 'ended', duration });

                // Clean up the activeCallRequests map
                const callKey1 = `${call.callerId}-${call.receiverId}`;
                const callKey2 = `${call.receiverId}-${call.callerId}`;
                activeCallRequests.delete(callKey1);
                activeCallRequests.delete(callKey2);

                // Make sure to emit to the correct user
                io.to(receiverId).emit('end-call', { callId });

                // Update both users with the new call status
                io.to(senderId).emit('call-updated', { call: updatedCall });
                io.to(receiverId).emit('call-updated', { call: updatedCall });

                console.log(`Call ${callId} ended by ${senderId}`);
            } catch (error) {
                console.error('Error ending call:', error);
                socket.emit('call-error', { message: 'Failed to end call' });
                // Still try to emit end-call to clean up client-side
                if (receiverId) {
                    io.to(receiverId).emit('end-call', { callId });
                }
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

        socket.on('unfriend', async ({ friendId }) => {
            try {
                if (!socket.userId) {
                    socket.emit('error', { message: 'Unauthorized: Please log in again' });
                    return;
                }

                const userId = socket.userId;

                // Check if friendship exists
                const friendship = await prisma.friendship.findFirst({
                    where: {
                        OR: [
                            { userAId: userId, userBId: friendId },
                            { userAId: friendId, userBId: userId },
                        ],
                    },
                });

                if (!friendship) {
                    socket.emit('error', { message: 'Friendship not found' });
                    return;
                }

                // Delete the friendship
                await prisma.friendship.delete({
                    where: { id: friendship.id },
                });

                // Emit events to both users
                io.to(friendId).emit('unfriended', { userId });
                socket.emit('unfriended', { userId: friendId });
            } catch (error) {
                console.error('Error unfriending user:', error);
                socket.emit('error', { message: 'Failed to unfriend user' });
            }
        });

        socket.on('disconnect', async () => {
            try {
                // Update user's online status
                await prisma.user.update({
                    where: { id: socket.userId },
                    data: { isOnline: false },
                });
                io.emit('userStatus', { userId: socket.userId, isOnline: false });

                // Clean up any active calls for this user
                await prisma.call.updateMany({
                    where: {
                        OR: [
                            { callerId: socket.userId },
                            { receiverId: socket.userId }
                        ],
                        status: { in: ['outgoing', 'incoming'] }
                    },
                    data: {
                        status: 'missed',
                        updatedAt: new Date()
                    }
                });

                // Clean up any active call requests for this user
                for (const [key, value] of activeCallRequests.entries()) {
                    if (key.includes(socket.userId)) {
                        activeCallRequests.delete(key);
                    }
                }
            } catch (error) {
                console.error('Error on disconnect:', error.message);
            }
        });

        socket.on('addReaction', async ({ messageId, emoji }) => {
            try {
                const userId = socket.userId;
                if (!userId) {
                    return socket.emit('error', { message: 'Unauthorized: Please log in again' });
                }

                if (!messageId || !emoji) {
                    return socket.emit('error', { message: 'Message ID and emoji are required' });
                }

                console.log(`User ${userId} adding reaction ${emoji} to message ${messageId}`);

                // Find the message first to verify it exists
                const message = await prisma.message.findUnique({
                    where: { id: messageId }
                });

                if (!message) {
                    console.error(`Message not found: ${messageId}`);
                    return socket.emit('error', { message: 'Message not found' });
                }

                // Check if user already has any reaction on this message
                const existingReaction = await prisma.messageReaction.findFirst({
                    where: {
                        messageId,
                        userId
                    }
                });

                let reaction;
                
                if (existingReaction) {
                    console.log(`User ${userId} already has a reaction on message ${messageId}, updating it`);
                    // Update the existing reaction instead of creating a new one
                    reaction = await prisma.messageReaction.update({
                        where: { id: existingReaction.id },
                        data: { emoji }
                    });
                } else {
                    // Create the reaction
                    reaction = await prisma.messageReaction.create({
                        data: {
                            messageId,
                            userId,
                            emoji
                        }
                    });
                }

                console.log(`Reaction saved: ${reaction.id}`);

                // Emit to both sender and receiver
                const reactionData = {
                    messageId,
                    reaction: {
                        id: reaction.id,
                        userId,
                        emoji,
                        createdAt: reaction.createdAt
                    }
                };

                // Emit to both users
                io.to(userId).emit('messageReaction', reactionData);
                io.to(message.senderId === userId ? message.receiverId : message.senderId)
                    .emit('messageReaction', reactionData);
            } catch (error) {
                console.error('Error in addReaction handler:', error);
                socket.emit('error', { message: 'Failed to add reaction' });
            }
        });

        socket.on('removeReaction', async ({ messageId, emoji }) => {
            try {
                const userId = socket.userId;
                if (!userId) {
                    return socket.emit('error', { message: 'Unauthorized: Please log in again' });
                }

                if (!messageId) {
                    return socket.emit('error', { message: 'Message ID is required' });
                }

                console.log(`User ${userId} removing reaction from message ${messageId}`);

                // Find the message first to verify it exists
                const message = await prisma.message.findUnique({
                    where: { id: messageId }
                });

                if (!message) {
                    console.error(`Message not found: ${messageId}`);
                    return socket.emit('error', { message: 'Message not found' });
                }

                // Find the user's reaction
                const existingReaction = await prisma.messageReaction.findFirst({
                    where: {
                        messageId,
                        userId
                    }
                });

                if (!existingReaction) {
                    console.log(`No reaction found for user ${userId} on message ${messageId}`);
                    return; // No reaction to remove
                }

                // Delete the reaction
                await prisma.messageReaction.delete({
                    where: {
                        id: existingReaction.id
                    }
                });

                console.log(`Reaction deleted for message ${messageId}`);

                // Emit to both sender and receiver
                const reactionData = {
                    messageId,
                    userId,
                    emoji: existingReaction.emoji
                };

                // Emit to both users
                io.to(userId).emit('messageReactionRemoved', reactionData);
                io.to(message.senderId === userId ? message.receiverId : message.senderId)
                    .emit('messageReactionRemoved', reactionData);
            } catch (error) {
                console.error('Error in removeReaction handler:', error);
                socket.emit('error', { message: 'Failed to remove reaction' });
            }
        });

        socket.on('replaceReaction', async ({ messageId, oldEmoji, newEmoji }) => {
            try {
                const userId = socket.userId;
                if (!userId) {
                    return socket.emit('error', { message: 'Unauthorized: Please log in again' });
                }

                if (!messageId || !newEmoji) {
                    return socket.emit('error', { message: 'Message ID and new emoji are required' });
                }

                console.log(`User ${userId} replacing reaction on message ${messageId} from ${oldEmoji} to ${newEmoji}`);

                // Find the message first to verify it exists
                const message = await prisma.message.findUnique({
                    where: { id: messageId }
                });

                if (!message) {
                    console.error(`Message not found: ${messageId}`);
                    return socket.emit('error', { message: 'Message not found' });
                }

                // Find the user's existing reaction
                const existingReaction = await prisma.messageReaction.findFirst({
                    where: {
                        messageId,
                        userId
                    }
                });

                if (!existingReaction) {
                    console.log(`No reaction found for user ${userId} on message ${messageId}, creating new one`);

                    // Create a new reaction
                    const newReaction = await prisma.messageReaction.create({
                        data: {
                            messageId,
                            userId,
                            emoji: newEmoji
                        }
                    });

                    // Emit the new reaction
                    const reactionData = {
                        messageId,
                        reaction: {
                            id: newReaction.id,
                            userId,
                            emoji: newEmoji,
                            createdAt: newReaction.createdAt
                        }
                    };

                    // Emit to both users
                    io.to(userId).emit('messageReaction', reactionData);
                    io.to(message.senderId === userId ? message.receiverId : message.senderId)
                        .emit('messageReaction', reactionData);

                    return;
                }

                // Update the reaction with the new emoji
                const updatedReaction = await prisma.messageReaction.update({
                    where: {
                        id: existingReaction.id
                    },
                    data: {
                        emoji: newEmoji
                    }
                });

                console.log(`Reaction updated for message ${messageId}`);

                // Emit the updated reaction
                const reactionData = {
                    messageId,
                    reaction: {
                        id: updatedReaction.id,
                        userId,
                        emoji: newEmoji,
                        createdAt: updatedReaction.createdAt
                    }
                };

                // Emit to both users
                io.to(userId).emit('messageReaction', reactionData);
                io.to(message.senderId === userId ? message.receiverId : message.senderId)
                    .emit('messageReaction', reactionData);
            } catch (error) {
                console.error('Error in replaceReaction handler:', error);
                socket.emit('error', { message: 'Failed to replace reaction' });
            }
        });

        socket.on('typing', ({ receiverId }) => {
            // Emit typing event to the receiver
            io.to(receiverId).emit('userTyping', { userId: socket.userId });
        });

        socket.on('stopTyping', ({ receiverId }) => {
            // Emit stop typing event to the receiver
            io.to(receiverId).emit('userStoppedTyping', { userId: socket.userId });
        });

        socket.on('markMessagesAsRead', async ({ senderId }) => {
            try {
                const userId = socket.userId;

                // Update all unread messages from this sender
                const updatedMessages = await prisma.message.updateMany({
                    where: {
                        senderId: senderId,
                        receiverId: userId,
                        isRead: false
                    },
                    data: {
                        isRead: true,
                        readAt: new Date()
                    }
                });

                // Get the updated messages to send back
                const messages = await prisma.message.findMany({
                    where: {
                        senderId: senderId,
                        receiverId: userId,
                        isRead: true
                    }
                });

                // Notify the sender that their messages were read
                io.to(senderId).emit('messagesRead', {
                    readBy: userId,
                    messages: messages.map(m => m.id)
                });
            } catch (error) {
                socket.emit('error', { message: 'Failed to mark messages as read' });
            }
        });

        socket.on('editMessage', async ({ messageId, content }) => {
            try {
                // Validate inputs
                if (!messageId || !content) {
                    console.error('Edit message failed: Missing required fields', { messageId, contentExists: !!content });
                    return socket.emit('error', { message: 'Message ID and content are required' });
                }

                const userId = socket.userId;
                if (!userId) {
                    console.error('Edit message failed: No authenticated user');
                    return socket.emit('error', { message: 'Unauthorized: Please log in again' });
                }

                // Debug logging
                console.log(`Attempting to edit message ${messageId} by user ${userId}`);

                // Find the message
                let message;
                try {
                    message = await prisma.message.findUnique({
                        where: { id: messageId }
                    });
                } catch (findError) {
                    console.error(`Database error finding message ${messageId}:`, findError);
                    return socket.emit('error', { message: 'Failed to find message' });
                }

                if (!message) {
                    console.error(`Message not found: ${messageId}`);
                    return socket.emit('error', { message: 'Message not found' });
                }

                // Check permissions
                if (message.senderId !== userId) {
                    console.error(`Permission denied: User ${userId} attempted to edit message ${messageId} owned by ${message.senderId}`);
                    return socket.emit('error', { message: 'You can only edit your own messages' });
                }

                // Update the message
                let updatedMessage;
                try {
                    updatedMessage = await prisma.message.update({
                        where: { id: messageId },
                        data: {
                            content,
                            isEdited: true
                        }
                    });
                } catch (updateError) {
                    console.error(`Database error updating message ${messageId}:`, updateError);
                    return socket.emit('error', { message: 'Failed to update message in database' });
                }

                console.log(`Message ${messageId} successfully edited by user ${userId}`);

                // Emit to both sender and receiver
                socket.emit('messageUpdated', updatedMessage);
                socket.to(message.receiverId).emit('messageUpdated', updatedMessage);
            } catch (error) {
                console.error('Unexpected error in editMessage handler:', error);
                socket.emit('error', { message: 'Failed to edit message' });
            }
        });

        socket.on('deleteMessage', async ({ messageId }) => {
            try {
                const userId = socket.userId;

                const message = await prisma.message.findUnique({
                    where: { id: messageId }
                });

                if (!message || message.senderId !== userId) {
                    return socket.emit('error', { message: 'Cannot delete this message' });
                }

                await prisma.message.delete({
                    where: { id: messageId }
                });

                // Emit to both sender and receiver
                io.to(message.senderId).emit('messageDeleted', { messageId });
                io.to(message.receiverId).emit('messageDeleted', { messageId });
            } catch (error) {
                socket.emit('error', { message: 'Failed to delete message' });
            }
        });
    });

    // Create a function to get socket info
    // Attach the function to io for external access
    io.getSocketInfo = () => {
        try {
            return Array.from(io.sockets.sockets.values()).map(socket => ({
                id: socket.id,
                userId: socket.userId,
                rooms: Array.from(socket.rooms)
            }));
        } catch (error) {
            console.error('Error getting socket info:', error);
            return [];
        }
    };

    return io;
};
