'use client';
import { useState, useEffect } from 'react';
import { fetchWithAuth, API_BASE_URL } from './utils';

const PendingRequests = ({ pendingRequests, token, fetchData, setPendingRequests, setError, socket }) => {
    const [processing, setProcessing] = useState(null);

    // Listen for socket events related to friend requests
    useEffect(() => {
        if (!socket) return;

        // Listen for accepted friend requests
        const handleFriendRequestAccepted = ({ requestId }) => {
            setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
        };

        // Listen for rejected friend requests
        const handleFriendRequestRejected = ({ requestId }) => {
            setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
        };

        // Note: 'friendRequest' event is now handled at the top level component
        // to provide notifications across the entire app

        socket.on('friendRequestAccepted', handleFriendRequestAccepted);
        socket.on('friendRequestRejected', handleFriendRequestRejected);

        return () => {
            socket.off('friendRequestAccepted', handleFriendRequestAccepted);
            socket.off('friendRequestRejected', handleFriendRequestRejected);
        };
    }, [socket, setPendingRequests]);

    const acceptFriendRequest = async (requestId) => {
        setProcessing(requestId);
        try {
            await fetchWithAuth(`${API_BASE_URL}/api/friend-request/accept`, token, {
                method: 'POST',
                body: JSON.stringify({ requestId }),
            });
            // The UI will be updated by the socket event, but we'll also update it here for immediate feedback
            setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
            // Fetch data to update the friends list
            await fetchData();
        } catch (err) {
            setError(err.message || 'Failed to accept request');
        } finally {
            setProcessing(null);
        }
    };

    const rejectFriendRequest = async (requestId) => {
        setProcessing(requestId);
        try {
            await fetchWithAuth(`${API_BASE_URL}/api/friend-request/reject`, token, {
                method: 'POST',
                body: JSON.stringify({ requestId }),
            });
            // The UI will be updated by the socket event, but we'll also update it here for immediate feedback
            setPendingRequests((prev) => prev.filter((req) => req.id !== requestId));
        } catch (err) {
            setError(err.message || 'Failed to reject request');
        } finally {
            setProcessing(null);
        }
    };

    return (
        <div className="p-2 sm:p-4">
            <h2 className="text-base sm:text-lg font-semibold mb-2">Pending Requests</h2>
            {pendingRequests.length > 0 ? (
                pendingRequests.map((req) => (
                    <div
                        key={req.id}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded mb-2"
                    >
                        <span className="text-sm sm:text-base">{req.sender.name || 'Unnamed'}</span>
                        <div className="flex space-x-1 sm:space-x-2">
                            <button
                                onClick={() => acceptFriendRequest(req.id)}
                                disabled={processing === req.id}
                                className={`px-2 py-1 rounded text-xs sm:text-sm ${
                                    processing === req.id
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-green-500 hover:bg-green-600'
                                } text-white`}
                            >
                                {processing === req.id ? 'Processing...' : 'Accept'}
                            </button>
                            <button
                                onClick={() => rejectFriendRequest(req.id)}
                                disabled={processing === req.id}
                                className={`px-2 py-1 rounded text-xs sm:text-sm ${
                                    processing === req.id
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-red-500 hover:bg-red-600'
                                } text-white`}
                            >
                                {processing === req.id ? 'Processing...' : 'Reject'}
                            </button>
                        </div>
                    </div>
                ))
            ) : (
                <p className="text-sm sm:text-base text-gray-500">No pending requests</p>
            )}
        </div>
    );
};

export default PendingRequests;