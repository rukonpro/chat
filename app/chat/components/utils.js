// Constants
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
// For Socket.IO, we need to use a different approach for Vercel deployment
// In development, we use localhost
// In production, we need to use a separate Socket.IO server that supports WebSockets
// Determine the Socket.IO server URL
let SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

// If no environment variable is set, use a fallback
if (!SOCKET_URL) {
    if (typeof window !== 'undefined' && window.location.hostname === 'chat-rukon.vercel.app' || "chat-rukonpro.vercel.app") {
        // Using the same URL for both frontend and Socket.IO server
        SOCKET_URL = 'https://chat-rukonpro.onrender.com';
    } else {
        // For local development
        SOCKET_URL = 'http://localhost:3000';
    }
}

// Utility Function
export const fetchWithAuth = async (url, token, options = {}) => {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        const contentType = response.headers.get('content-type');
        let data;
        if (contentType?.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(`Invalid response: ${text || 'Empty response'}`);
        }

        if (!response.ok) {
            throw new Error(data.message || `Request failed: ${response.status}`);
        }
        return data;
    } catch (err) {
        throw err;
    }
};

export { API_BASE_URL, SOCKET_URL };