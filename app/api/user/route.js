import prisma from '../../../lib/prisma';
import { verifyToken } from '../../../lib/auth';
import { getIO } from '../../../lib/socket';
import { NextResponse } from 'next/server';

// Utility function for retrying Prisma operations that might encounter transaction conflicts
const retryOperation = async (operation, maxRetries = 3, initialDelay = 100) => {
    let retries = maxRetries;
    let delay = initialDelay;

    while (retries > 0) {
        try {
            return await operation();
        } catch (error) {
            // If it's a transaction conflict (P2034) and we have retries left
            if (error.code === 'P2034' && retries > 0) {
                console.log(`Transaction conflict. Retrying... (${retries} attempts left)`);
                // Wait for the specified delay
                await new Promise(resolve => setTimeout(resolve, delay));
                // Decrease retries and increase delay for next attempt
                retries--;
                delay *= 2; // Exponential backoff
            } else {
                // If it's not a transaction conflict or we're out of retries, throw the error
                throw error;
            }
        }
    }

    throw new Error('Operation failed after maximum retry attempts');
};

export async function GET(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const decoded = verifyToken(token);
        const userId = decoded.id;

        // Get the current user to ensure we're online
        await retryOperation(async () => {
            return await prisma.user.update({
                where: { id: userId },
                data: { isOnline: true },
            });
        });

        const users = await prisma.user.findMany({
            where: { id: { not: userId } },
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
                OR: [{ userAId: userId }, { userBId: userId }],
            },
            select: {
                userAId: true,
                userBId: true,
            },
        });

        const friendIds = friendships.map((f) =>
            f.userAId === userId ? f.userBId : f.userAId
        );

        // Add isFriend field to users and verify online status
        const usersWithFriendStatus = users.map((user) => {
            // If a socket connection exists for this user, they're online
            // Otherwise, they should be marked as offline regardless of DB state
            const socketIO = getIO();
            const sockets = socketIO.sockets?.sockets || new Map();

            // Check if any socket has this userId
            let isReallyOnline = false;

            // Initialize all users as offline by default
            // Only mark them as online if we can confirm they have an active socket connection
            if (sockets.size > 0) {
                sockets.forEach((socket) => {
                    if (socket.userId === user.id) {
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

        return NextResponse.json(usersWithFriendStatus, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}
