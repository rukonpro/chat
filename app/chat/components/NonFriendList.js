'use client';
import { useState, useEffect } from 'react';

const NonFriendList = ({ nonFriends, pendingSentRequests, token, setError, fetchData, setPendingSentRequests, socket }) => {
    const [sending, setSending] = useState(null);
    const [canceling, setCanceling] = useState(null);

    // Listen for socket events related to friend requests
    useEffect(() => {
        if (!socket) return;

        // Listen for sent friend requests
        const handleFriendRequestSent = (request) => {
            setPendingSentRequests((prev) => {
                if (prev.some((req) => req.id === request.id)) return prev;
                return [...prev, request];
            });
        };

        // Listen for canceled friend requests
        const handleFriendRequestCanceled = ({ requestId }) => {
            setPendingSentRequests((prev) => prev.filter((req) => req.id !== requestId));
        };

        socket.on('friendRequestSent', handleFriendRequestSent);
        socket.on('friendRequestCancelled', handleFriendRequestCanceled);

        return () => {
            socket.off('friendRequestSent', handleFriendRequestSent);
            socket.off('friendRequestCancelled', handleFriendRequestCanceled);
        };
    }, [socket, setPendingSentRequests]);

    const sendFriendRequest = (receiverId) => {
        if (pendingSentRequests.some((req) => req.receiverId === receiverId)) {
            return;
        }

        if (!socket || !socket.connected) {
            setError('Not connected to server');
            return;
        }

        setSending(receiverId);

        // Emit the sendFriendRequest event
        socket.emit('sendFriendRequest', { receiverId });

        // Set a timeout to clear the sending state in case of no response
        setTimeout(() => {
            if (sending === receiverId) {
                setSending(null);
                setError('Friend request timed out');
            }
        }, 5000);
    };

    const cancelFriendRequest = (requestId) => {
        if (!socket || !socket.connected) {
            setError('Not connected to server');
            return;
        }

        setCanceling(requestId);

        // Emit the cancelFriendRequest event
        socket.emit('cancelFriendRequest', { requestId });

        // Set a timeout to clear the canceling state in case of no response
        setTimeout(() => {
            if (canceling === requestId) {
                setCanceling(null);
                setError('Cancel request timed out');
            }
        }, 5000);
    };

    return (
        <div className="p-2 sm:p-4">
            <h2 className="text-base sm:text-lg font-semibold mb-2">Add New Friends</h2>
            {nonFriends.length > 0 ? (
                nonFriends.map((user) => {
                    const pendingRequest = pendingSentRequests.find((req) => req.receiverId === user.id);
                    const isPending = !!pendingRequest;
                    return (
                        <div
                            key={user.id}
                            className="p-2 sm:p-3 rounded mb-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100"
                        >
                            <div className="flex items-center space-x-2">
                                <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${user.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                                <span className="text-sm sm:text-base">{user.name || 'Unnamed'}</span>
                            </div>
                            {isPending ? (
                                <button
                                    onClick={() => cancelFriendRequest(pendingRequest.id)}
                                    disabled={canceling === pendingRequest.id}
                                    className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm ${
                                        canceling === pendingRequest.id
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-red-500 hover:bg-red-600'
                                    } text-white`}
                                >
                                    {canceling === pendingRequest.id ? 'Canceling...' : 'Cancel'}
                                </button>
                            ) : (
                                <button
                                    onClick={() => sendFriendRequest(user.id)}
                                    disabled={sending === user.id}
                                    className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm ${
                                        sending === user.id
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-sky-500 hover:bg-sky-600'
                                    } text-white`}
                                >
                                    {sending === user.id ? 'Sending...' : 'Send'}
                                </button>
                            )}
                        </div>
                    );
                })
            ) : (
                <p className="text-gray-500">No new users found</p>
            )}
        </div>
    );
};

export default NonFriendList;
