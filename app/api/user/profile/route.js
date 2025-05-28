import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { retryOperation } from '@/lib/prismaUtils';

export async function GET(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const decoded = verifyToken(token);
        const userId = decoded.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, name: true, bio: true, profilePic: true, isOnline: true },
        });

        return NextResponse.json(user, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}

export async function PUT(request) {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const decoded = verifyToken(token);
        const userId = decoded.id;
        const { name, bio, profilePic } = await request.json();

        const updatedUser = await retryOperation(async () => {
            return await prisma.user.update({
                where: { id: userId },
                data: { name, bio, profilePic },
                select: { id: true, email: true, name: true, bio: true, profilePic: true, isOnline: true },
            });
        });

        return NextResponse.json({ message: 'Profile updated', user: updatedUser }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}
