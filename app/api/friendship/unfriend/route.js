import prisma from '../../../../lib/prisma';
import { verifyToken } from '@/lib/auth.js';
import { NextResponse } from 'next/server';
import {initSocket} from "@/lib/socket.js";

export async function POST(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { friendId } = await request.json();

    try {
        const decoded = verifyToken(token);
        const userId = decoded.id;

        if (!friendId) {
            return NextResponse.json({ message: 'Friend ID is required' }, { status: 400 });
        }

        // Find the friendship record (checking both directions)
        const friendship = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { userAId: userId, userBId: friendId },
                    { userAId: friendId, userBId: userId },
                ],
            },
        });

        if (!friendship) {
            return NextResponse.json({ message: 'Friendship not found' }, { status: 404 });
        }

        // Delete the friendship
        await prisma.friendship.delete({
            where: { id: friendship.id },
        });

        // Emit socket events to both users
        const io = initSocket();
        io.to(friendId).emit('unfriended', { userId });
        io.to(userId).emit('unfriended', { userId: friendId });

        return NextResponse.json({ message: 'Friend removed successfully' }, { status: 200 });
    } catch (error) {
        console.error('Error unfriending user:', error.message);
        return NextResponse.json(
            { message: 'Server error', error: error.message },
            { status: 500 }
        );
    }
}
