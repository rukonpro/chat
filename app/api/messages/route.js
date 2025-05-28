import prisma from '../../../lib/prisma';
import { verifyToken } from '../../../lib/auth';
import { NextResponse } from 'next/server';
import { getIO } from '../../../lib/socket';

export async function GET(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const decoded = verifyToken(token);
        const userId = decoded.id;

        const { searchParams } = new URL(request.url);
        const friendId = searchParams.get('friendId');

        if (!friendId) {
            return NextResponse.json({ message: 'friendId is required' }, { status: 400 });
        }

        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: friendId },
                    { senderId: friendId, receiverId: userId },
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

        return NextResponse.json(messages, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const decoded = verifyToken(token);
        const senderId = decoded.id;

        const { receiverId, content } = await request.json();

        if (!receiverId || !content) {
            return NextResponse.json({ message: 'receiverId and content are required' }, { status: 400 });
        }

        const message = await prisma.message.create({
            data: {
                senderId,
                receiverId,
                content,
            },
        });

        // Emit Socket.IO event
        const io = getIO();
        io.to(receiverId).emit('receiveMessage', {
            id: message.id,
            senderId,
            receiverId,
            content,
            createdAt: message.createdAt,
        });
        io.to(senderId).emit('receiveMessage', {
            id: message.id,
            senderId,
            receiverId,
            content,
            createdAt: message.createdAt,
        });

        return NextResponse.json({ message: 'Message sent', data: message }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}
