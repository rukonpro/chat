import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
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
