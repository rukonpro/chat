import prisma from '../../../lib/prisma';
import { verifyToken } from '../../../lib/auth';
import { getIO } from '../../../lib/socket';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const decoded = verifyToken(token);
        const userId = decoded.id;

        // Get the current user to ensure we're online
        await prisma.user.update({
            where: { id: userId },
            data: { isOnline: true },
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
            sockets.forEach((socket) => {
                if (socket.userId === user.id) {
                    isReallyOnline = true;
                }
            });

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
