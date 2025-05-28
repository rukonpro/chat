import prisma from '@/lib/prisma';
import { verifyPassword, generateToken } from '@/lib/auth';
import { badRequestResponse, serverErrorResponse, successResponse } from '@/lib/errors';

export async function POST(request) {
    const { email, password } = await request.json();

    if (!email || !password) {
        return badRequestResponse('All fields are required');
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return badRequestResponse('Invalid credentials');
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
            return badRequestResponse('Invalid credentials');
        }

        const token = generateToken(user);
        return successResponse(
            { token, user: { id: user.id, email: user.email, name: user.name } },
            'Login successful'
        );
    } catch (error) {
        return serverErrorResponse('Server error', error);
    }
}
