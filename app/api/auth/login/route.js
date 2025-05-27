import prisma from '@/lib/prisma';
import { verifyPassword, generateToken } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { email, password } = await request.json();

    if (!email || !password) {
        return NextResponse.json({ message: 'All fields are required' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return NextResponse.json({ message: 'Invalid credentials' }, { status: 400 });
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
            return NextResponse.json({ message: 'Invalid credentials' }, { status: 400 });
        }

        const token = generateToken(user);
        return NextResponse.json(
            { message: 'Login successful', token, user: { id: user.id, email: user.email, name: user.name } },
            { status: 200 }
        );
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}