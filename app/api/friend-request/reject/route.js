import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { getIO } from '@/lib/socket';
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

        const request = await prisma.friendRequest.findUnique({
            where: { id: requestId },
        });
        if (!request || request.receiverId !== userId) {
            return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
        }

        await prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: 'rejected' },
        });

        const io = getIO();
        io.to(request.senderId).emit('friendRequestRejected', { requestId, receiverId: userId });

        return NextResponse.json({ message: 'Friend request rejected' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}