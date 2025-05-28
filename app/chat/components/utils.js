// Constants
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
// For Socket.IO, we need to use a different approach for Vercel deployment
// In development, we use localhost
// In production, we need to use a separate Socket.IO server that supports WebSockets
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 
  (typeof window !== 'undefined' && window.location.hostname === 'chat-rukon.vercel.app' 
    ? 'https://chat-rukon.vercel.app' // Replace with your actual Socket.IO server URL
    : 'http://localhost:3000');

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
