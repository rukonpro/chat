import prisma from '../../../../lib/prisma';
import { verifyToken } from '@/lib/auth.js';
import { getIO } from '@/lib/socket.js';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { requestId } = await request.json();

    try {
        const decoded = verifyToken(token);
        const userId = decoded.id;

        const friendRequest = await prisma.friendRequest.findUnique({
            where: { id: requestId },
        });
        if (!friendRequest || friendRequest.receiverId !== userId) {
            return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
        }

        await prisma.$transaction([
            prisma.friendRequest.update({
                where: { id: requestId },
                data: { status: 'accepted' },
            }),
            prisma.friendship.create({
                data: {
                    userAId: friendRequest.senderId,
                    userBId: userId,
                },
            }),
        ]);

        const io = getIO();
        io.to(friendRequest.senderId).emit('friendRequestAccepted', {
            requestId,
            receiverId: userId,
        });

        // Also emit to the receiver for real-time updates across multiple tabs/devices
        io.to(userId).emit('friendRequestAccepted', {
            requestId,
            receiverId: userId,
        });

        return NextResponse.json({ message: 'Friend request accepted' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}
