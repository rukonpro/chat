import { NextResponse } from 'next/server';
import { initSocket } from '@/lib/socket.js';

export async function GET() {
    try {
        const io = initSocket();
        
        // If io has the getSocketInfo method we added
        if (io && typeof io.getSocketInfo === 'function') {
            const connectedSockets = io.getSocketInfo();
            
            return NextResponse.json({
                connectedSockets,
                count: connectedSockets.length
            });
        } else {
            // Fallback if method not available
            const connectedSockets = [];
            if (io && io.sockets && io.sockets.sockets) {
                const sockets = Array.from(io.sockets.sockets.values());
                for (const socket of sockets) {
                    connectedSockets.push({
                        id: socket.id,
                        userId: socket.userId,
                        rooms: Array.from(socket.rooms)
                    });
                }
            }
            
            return NextResponse.json({
                connectedSockets,
                count: connectedSockets.length
            });
        }
    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}