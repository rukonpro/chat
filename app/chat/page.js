'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import io from 'socket.io-client';

// Import components
import FriendList from './components/FriendList';
import NonFriendList from './components/NonFriendList';
import MessageSection from './components/MessageSection';
import Notification from './components/Notification';
import Header from './components/Header';
import { SOCKET_URL } from './components/utils';

// Main Component
export default function Chat() {
    const [socket, setSocket] = useState(null);
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [friends, setFriends] = useState([]);
    const [nonFriends, setNonFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [pendingSentRequests, setPendingSentRequests] = useState([]);
    const [messages, setMessages] = useState([]);
    const [selectedFriendId, setSelectedFriendId] = useState(null);
    const [content, setContent] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [socketConnected, setSocketConnected] = useState(false);
    const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
    const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
    const [processing, setProcessing] = useState(null);
    const router = useRouter();

    const fetchData = useCallback(() => {
        if (!socket || !socket.connected) return;

        // Only set loading to true if it's not already true
        // This prevents unnecessary state updates that could trigger re-renders
        setLoading(prevLoading => {
            if (!prevLoading) return true;
            return prevLoading;
        });

        // Request user data
        socket.emit('getUsers');

        // Request friend requests
        socket.emit('checkFriendRequests');

        // Request sent friend requests
        socket.emit('checkSentFriendRequests');
    }, [socket]);

    const fetchMessages = useCallback((friendId) => {
        if (!socket || !socket.connected || !friendId) return;
        socket.emit('getMessages', { friendId });
    }, [socket]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        socket?.disconnect();
        router.push('/login');
    };

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

        if (!storedToken || !storedUser?.id) {
            setError('Please log in');
            router.push('/login');
            return;
        }

        setToken(storedToken);
        setUser(storedUser);
    }, [router]);

    useEffect(() => {
        if (!token || !user) return;

        const newSocket = io(SOCKET_URL, {
            auth: { token },
            reconnectionAttempts: 3,
            reconnectionDelay: 1000,
        });

        newSocket.on('connect', () => {
            setSocketConnected(true);
            newSocket.emit('join', user.id);
            // Fetch data when connected
            if (newSocket.connected) {
                // Request user data
                newSocket.emit('getUsers');
                // Request friend requests
                newSocket.emit('checkFriendRequests');
                // Request sent friend requests
                newSocket.emit('checkSentFriendRequests');
            }
        });

        newSocket.on('connect_error', (err) => {
            setSocketConnected(false);
            setError('Failed to connect to real-time server');
        });

        // Listen for user data updates
        newSocket.on('users', (users) => {
            setFriends(users.filter((user) => user.isFriend));
            setNonFriends(users.filter((user) => !user.isFriend));
            setLoading(false);
        });

        // Listen for messages
        newSocket.on('messages', (messages) => {
            setMessages(messages);
        });

        newSocket.on('receiveMessage', (message) => {
            setMessages((prev) => {
                if (prev.some((msg) => msg.id === message.id)) return prev;
                return [...prev, message];
            });
        });

        // Listen for a new friend request and show notification
        newSocket.on('friendRequest', (request) => {
            // Show notification
            setError(`New friend request from ${request.sender?.name || 'someone'}!`);

            // Play notification sound if available
            const audio = new Audio('/notification.mp3');
            audio.play().catch(e => console.log('Error playing notification sound:', e));

            // If the request doesn't include sender details, add a placeholder
            if (!request.sender) {
                request.sender = {
                    id: request.senderId,
                    name: 'New Request',
                    email: ''
                };

                // Trigger a data refresh to get complete user details
                if (newSocket.connected) {
                    // Request user data
                    newSocket.emit('getUsers');
                    // Request friend requests
                    newSocket.emit('checkFriendRequests');
                    // Request sent friend requests
                    newSocket.emit('checkSentFriendRequests');
                }
            }

            // Update the pending requests list
            setPendingRequests((prev) => {
                if (prev.some((req) => req.id === request.id)) return prev;
                return [...prev, request];
            });
        });

        newSocket.on('friendRequestAccepted', ({ requestId, senderId, friendship }) => {
            // Fetch updated user data
            newSocket.emit('getUsers');

            if (selectedFriendId === senderId) {
                newSocket.emit('getMessages', { friendId: senderId });
            }

            // Update a pending requests list by removing the accepted request
            setPendingRequests(prev => prev.filter(req => req.id !== requestId));
        });

        // Listen for rejected friend requests
        newSocket.on('friendRequestRejected', ({ requestId }) => {
            // Update a pending requests list by removing the rejected request
            setPendingRequests(prev => prev.filter(req => req.id !== requestId));
        });

        // Listen for cancelled friend requests
        newSocket.on('friendRequestCancelled', ({ requestId }) => {
            // Update sent requests list
            newSocket.emit('checkSentFriendRequests');
        });

        newSocket.on('friendshipCreated', ({ friendshipId, senderId }) => {
            // Fetch updated user data
            newSocket.emit('getUsers');

            if (selectedFriendId === senderId) {
                newSocket.emit('getMessages', { friendId: senderId });
            }
        });

        newSocket.on('userStatus', ({ userId, isOnline }) => {
            setFriends((prev) =>
                prev.map((friend) =>
                    friend.id === userId ? { ...friend, isOnline } : friend
                )
            );
        });

        // Listen for friend requests list updates
        newSocket.on('friendRequests', (requests) => {
            setPendingRequests(requests);
        });

        // Listen for sent friend requests list updates
        newSocket.on('sentFriendRequests', (requests) => {
            setPendingSentRequests(requests);
        });

        // Listen for friend request errors
        newSocket.on('friendRequestError', ({ message }) => {
            setError(message);
        });

        setSocket(newSocket);

        return () => {
            newSocket.off('users');
            newSocket.off('messages');
            newSocket.off('receiveMessage');
            newSocket.off('friendRequest');
            newSocket.off('friendRequests');
            newSocket.off('sentFriendRequests');
            newSocket.off('friendRequestAccepted');
            newSocket.off('friendRequestRejected');
            newSocket.off('friendRequestCancelled');
            newSocket.off('friendshipCreated');
            newSocket.off('userStatus');
            newSocket.off('friendRequestError');
            newSocket.disconnect();
        };
    }, [token, user, selectedFriendId]);

    useEffect(() => {
        if (selectedFriendId && socket && socket.connected) {
            socket.emit('getMessages', { friendId: selectedFriendId });
        }
    }, [selectedFriendId, socket]);

    // Set default selectedFriendId to the first friend in the list when friends are loaded
    useEffect(() => {
        if (friends.length > 0 && selectedFriendId === null) {
            setSelectedFriendId(friends[0].id);
        }
    }, [friends, selectedFriendId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-gray-900">
                Loading...
            </div>
        );
    }

    return (
        <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
            <Header 
                user={user}
                socketConnected={socketConnected}
                pendingRequests={pendingRequests}
                setNotificationDrawerOpen={setNotificationDrawerOpen}
                notificationDrawerOpen={notificationDrawerOpen}
                setLeftSidebarOpen={setLeftSidebarOpen}
                leftSidebarOpen={leftSidebarOpen}
                handleLogout={handleLogout}
            />

            <div className="flex  flex-row flex-1 overflow-hidden">
                {/* Left Sidebar - Desktop (always visible on md and larger screens) */}
                <aside className="hidden md:block w-80 bg-white border-r overflow-y-auto">

                    <FriendList
                        friends={friends}
                        selectedFriendId={selectedFriendId}
                        setSelectedFriendId={setSelectedFriendId}
                        token={token}
                        setError={setError}
                        fetchData={fetchData}
                        socket={socket}
                    />
                    <NonFriendList
                        nonFriends={nonFriends}
                        pendingSentRequests={pendingSentRequests}
                        token={token}
                        setError={setError}
                        fetchData={fetchData}
                        setPendingSentRequests={setPendingSentRequests}
                        socket={socket}
                    />
                </aside>

                {/* Main Content - Message Section */}
                <div className="flex-1 flex justify-center">
                    {/* On mobile: Show a friend list when no friend is selected, otherwise show messages */}
                    {!selectedFriendId && (
                        <div className="md:hidden w-full bg-white overflow-y-auto">

                            <FriendList
                                friends={friends}
                                selectedFriendId={selectedFriendId}
                                setSelectedFriendId={setSelectedFriendId}
                                token={token}
                                setError={setError}
                                fetchData={fetchData}
                                socket={socket}
                            />
                            <NonFriendList
                                nonFriends={nonFriends}
                                pendingSentRequests={pendingSentRequests}
                                token={token}
                                setError={setError}
                                fetchData={fetchData}
                                setPendingSentRequests={setPendingSentRequests}
                                socket={socket}
                            />
                        </div>
                    )}
                    <MessageSection
                        messages={messages}
                        userId={user?.id}
                        selectedFriendId={selectedFriendId}
                        friends={friends}
                        content={content}
                        setContent={setContent}
                        socket={socket}
                        setSelectedFriendId={setSelectedFriendId}
                        className={!selectedFriendId ? 'hidden md:flex' : 'flex'}
                    />
                </div>

                {/* Right Sidebar - Notification Drawer (always visible on large screens) */}
                <aside className="hidden lg:block w-80 bg-white border-l overflow-y-auto">
                    <Notification 
                        pendingRequests={pendingRequests}
                        token={token}
                        setError={setError}
                        fetchData={fetchData}
                        setPendingRequests={setPendingRequests}
                        processing={processing}
                        setProcessing={setProcessing}
                        socket={socket}
                    />
                </aside>
            </div>

            {error && (
                <div className="fixed top-4 right-4 bg-sky-500 text-white p-3 rounded-lg flex items-center space-x-2 shadow-lg z-50">
                    <span>{error}</span>
                    <button
                        onClick={() => setError('')}
                        className="bg-white text-sky-500 px-2 py-1 rounded ml-2"
                    >
                        Close
                    </button>
                </div>
            )}

            {/* Mobile Notification Drawer (overlay for small screens) */}
            {notificationDrawerOpen && (
                <Notification 
                    pendingRequests={pendingRequests}
                    token={token}
                    setError={setError}
                    fetchData={fetchData}
                    setPendingRequests={setPendingRequests}
                    setNotificationDrawerOpen={setNotificationDrawerOpen}
                    notificationDrawerOpen={notificationDrawerOpen}
                    processing={processing}
                    setProcessing={setProcessing}
                    socket={socket}
                    isMobile={true}
                />
            )}

            {/* Mobile Left Sidebar (overlay for small screens) */}
            {leftSidebarOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-start md:hidden">
                    <div className="bg-white w-full sm:w-80 h-full shadow-lg overflow-y-auto">
                        <div className="p-4 bg-sky-500 text-white flex justify-between items-center">
                            <h2 className="text-lg font-semibold">Menu</h2>
                            <button
                                onClick={() => setLeftSidebarOpen(false)}
                                className="text-white hover:text-gray-200"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <NonFriendList
                            nonFriends={nonFriends}
                            pendingSentRequests={pendingSentRequests}
                            token={token}
                            setError={setError}
                            fetchData={fetchData}
                            setPendingSentRequests={setPendingSentRequests}
                            socket={socket}
                        />
                        <FriendList
                            friends={friends}
                            selectedFriendId={selectedFriendId}
                            setSelectedFriendId={setSelectedFriendId}
                            token={token}
                            setError={setError}
                            fetchData={fetchData}
                            socket={socket}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
