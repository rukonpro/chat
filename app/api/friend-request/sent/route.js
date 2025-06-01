import prisma from '../../../../lib/prisma';
import { verifyToken } from '@/lib/auth.js';;
import { NextResponse } from 'next/server';
import {initSocket} from "@/lib/socket.js";

export async function GET(req) {
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const decoded = verifyToken(token);
        const userId = decoded.id;

        const sentRequests = await prisma.friendRequest.findMany({
            where: { senderId: userId, status: 'pending' },
            include: {
                receiver: { select: { id: true, name: true, email: true } },
            },
        });

        // Get Socket.IO instance and emit real-time event to the user
        const io = initSocket();
        io.to(userId).emit('sentFriendRequests', sentRequests);

        return NextResponse.json(sentRequests, { status: 200 });
    } catch (error) {
        console.error('Error fetching sent friend requests:', error.message);
        return NextResponse.json(
            { message: 'Server error', error: error.message },
            { status: 500 }
        );
    }
}
