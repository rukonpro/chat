import prisma from '../../../../lib/prisma';
import { verifyToken } from '../../../../lib/auth';
import { getIO } from '../../../../lib/socket';
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
        if (!friendRequest || friendRequest.senderId !== userId) {
            return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
        }

        await prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: 'canceled' },
        });

        const io = getIO();
        io.to(friendRequest.receiverId).emit('friendRequestCanceled', { 
            requestId, 
            senderId: userId 
        });

        // Also emit to the sender for real-time updates across multiple tabs/devices
        io.to(userId).emit('friendRequestCanceled', { 
            requestId, 
            senderId: userId 
        });

        return NextResponse.json({ message: 'Friend request canceled' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}
