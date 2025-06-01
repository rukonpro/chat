import prisma from '../../../lib/prisma';
import { verifyToken } from '@/lib/auth.js';
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

        const requests = await prisma.friendRequest.findMany({
            where: { receiverId: userId, status: 'pending' },
            include: {
                sender: { select: { id: true, name: true, email: true } },
            },
        });

        // Get Socket.IO instance and emit real-time event to the user
        const io = initSocket();
        io.to(userId).emit('friendRequests', requests);

        return NextResponse.json(requests, { status: 200 });
    } catch (error) {
        console.error('Error fetching friend requests:', error.message);
        return NextResponse.json(
            { message: 'Server error', error: error.message },
            { status: 500 }
        );
    }
}


export async function POST(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { receiverId } = await request.json();

    try {
        const decoded = verifyToken(token);
        const senderId = decoded.id;

        const existingRequest = await prisma.friendRequest.findFirst({
            where: { senderId, receiverId, status: 'pending' },
        });
        if (existingRequest) {
            return NextResponse.json({ message: 'Request already sent' }, { status: 400 });
        }

        const friendRequest = await prisma.friendRequest.create({
            data: { senderId, receiverId, status: 'pending' },
        });

        const io = initSocket();
        io.to(receiverId).emit('friendRequest', {
            id: friendRequest.id,
            senderId,
            receiverId,
            status: friendRequest.status,
            createdAt: friendRequest.createdAt,
        });

        // Also emit to the sender for real-time updates across multiple tabs/devices
        io.to(senderId).emit('friendRequestSent', {
            id: friendRequest.id,
            senderId,
            receiverId,
            status: friendRequest.status,
            createdAt: friendRequest.createdAt,
        });

        return NextResponse.json({ message: 'Friend request sent', friendRequest }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}
