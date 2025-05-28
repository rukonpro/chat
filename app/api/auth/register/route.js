import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
        return NextResponse.json({ message: 'All fields are required' }, { status: 400 });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ message: 'User already exists' }, { status: 400 });
        }

        const hashedPassword = await hashPassword(password);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, name },
        });

        return NextResponse.json(
            { message: 'User created', user: { id: user.id, email: user.email, name: user.name } },
            { status: 201 }
        );
    } catch (error) {
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}
