'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import io from 'socket.io-client';

// কনস্ট্যান্ট
const API_BASE_URL = 'http://localhost:3000';
const SOCKET_URL = 'http://localhost:3000';

// ইউটিলিটি ফাংশন
const fetchWithAuth = async (url, token, options = {}) => {
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
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(`Invalid response: ${text || 'Empty response'}`);
        }

        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }
        return data;
    } catch (err) {
        throw err;
    }
};

// Friend List Component
const FriendList = ({ friends, selectedFriendId, setSelectedFriendId }) => (
    <div className="p-4">
        <h2 className="text-lg font-semibold mb-2">ফ্রেন্ড লিস্ট</h2>
        {friends.length > 0 ? (
            friends.map((friend) => (
                <div
                    key={friend.id}
                    onClick={() => setSelectedFriendId(friend.id)}
                    className={`p-3 rounded mb-2 cursor-pointer flex items-center space-x-2 ${
                        selectedFriendId === friend.id ? 'bg-blue-100' : 'bg-gray-50'
                    } hover:bg-blue-50`}
                >
                    <div className={`w-3 h-3 rounded-full ${friend.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                    <span>{friend.name}</span>
                </div>
            ))
        ) : (
            <p className="text-gray-500">কোনো ফ্রেন্ড নেই</p>
        )}
    </div>
);

// Non-Friend List Component
const NonFriendList = ({ nonFriends, token, setError }) => {
    console.log('NonFriendList রেন্ডার, nonFriends:', nonFriends);
    const sendFriendRequest = async (receiverId) => {
        try {
            await fetchWithAuth(`${API_BASE_URL}/api/friend-request`, token, {
                method: 'POST',
                body: JSON.stringify({ receiverId }),
            });
            alert('ফ্রেন্ড রিকোয়েস্ট পাঠানো হয়েছে');
        } catch (err) {
            setError(err.message || 'রিকোয়েস্ট পাঠাতে ব্যর্থ');
        }
    };

    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-2">নতুন ফ্রেন্ড যোগ করুন</h2>
            {nonFriends.length > 0 ? (
                nonFriends.map((user) => (
                    <div
                        key={user.id}
                        className="p-3 rounded mb-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100"
                    >
                        <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full ${user.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                            <span>{user.name}</span>
                        </div>
                        <button
                            onClick={() => sendFriendRequest(user.id)}
                            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                        >
                            রিকোয়েস্ট পাঠান
                        </button>
                    </div>
                ))
            ) : (
                <p className="text-gray-500">কোনো নতুন ইউজার নেই</p>
            )}
        </div>
    );
};

// Pending Requests Component
const PendingRequests = ({ pendingRequests, token, fetchFriends, setPendingRequests, setError }) => {
    const acceptFriendRequest = async (requestId) => {
        try {
            await fetchWithAuth(`${API_BASE_URL}/api/friend-request/accept`, token, {
                method: 'POST',
                body: JSON.stringify({ requestId }),
            });
            setPendingRequests(pendingRequests.filter((req) => req.id !== requestId));
            await fetchFriends();
        } catch (err) {
            setError(err.message || 'অ্যাকসেপ্ট ফেইলড');
        }
    };

    const rejectFriendRequest = async (requestId) => {
        try {
            await fetchWithAuth(`${API_BASE_URL}/api/friend-request/reject`, token, {
                method: 'POST',
                body: JSON.stringify({ requestId }),
            });
            setPendingRequests(pendingRequests.filter((req) => req.id !== requestId));
        } catch (err) {
            setError(err.message || 'রিজেক্ট ফেইলড');
        }
    };

    return (
        <div className="p-4">
            <h2 className="text-lg font-semibold mb-2">ফ্রেন্ড রিকোয়েস্ট</h2>
            {pendingRequests.length > 0 ? (
                pendingRequests.map((req) => (
                    <div
                        key={req.id}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded mb-2"
                    >
                        <span>{req.sender.name}</span>
                        <div>
                            <button
                                onClick={() => acceptFriendRequest(req.id)}
                                className="bg-green-500 text-white px-2 py-1 rounded mr-2 hover:bg-green-600"
                            >
                                গ্রহণ
                            </button>
                            <button
                                onClick={() => rejectFriendRequest(req.id)}
                                className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                            >
                                রিজেক্ট
                            </button>
                        </div>
                    </div>
                ))
            ) : (
                <p className="text-gray-500">কোনো পেন্ডিং রিকোয়েস্ট নেই</p>
            )}
        </div>
    );
};

// Message Section Component
const MessageSection = ({
                            messages,
                            userId,
                            selectedFriendId,
                            friends,
                            content,
                            setContent,
                            socket,
                        }) => {
    const messagesRef = useRef(null);

    const scrollToBottom = () => {
        messagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = () => {
        if (!content || !socket || !selectedFriendId || !userId) return;
        socket.emit('sendMessage', {
            senderId: userId,
            receiverId: selectedFriendId,
            content,
        });
        setContent('');
    };

    return (
        <main className="flex-1 flex flex-col">
            {selectedFriendId ? (
                <>
                    <div className="bg-white p-4 border-b">
                        <h2 className="text-lg font-semibold">
                            {friends.find((f) => f.id === selectedFriendId)?.name}
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                        {messages
                            .filter(
                                (msg) =>
                                    (msg.senderId === userId && msg.receiverId === selectedFriendId) ||
                                    (msg.senderId === selectedFriendId && msg.receiverId === userId)
                            )
                            .map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`mb-4 flex ${
                                        msg.senderId === userId ? 'justify-end' : 'justify-start'
                                    }`}
                                >
                                    <div
                                        className={`max-w-xs p-3 rounded-lg ${
                                            msg.senderId === userId
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-gray-200 text-black'
                                        }`}
                                    >
                                        <p>{msg.content}</p>
                                        <p className="text-xs opacity-75 mt-1">
                                            {new Date(msg.createdAt).toLocaleTimeString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        <div ref={messagesRef} />
                    </div>
                    <div className="bg-white p-4 border-t">
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="মেসেজ লিখুন..."
                            />
                            <button
                                onClick={sendMessage}
                                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                            >
                                পাঠান
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    একজন ফ্রেন্ড সিলেক্ট করুন
                </div>
            )}
        </main>
    );
};

// Main Component
export default function Chat() {
    const [socket, setSocket] = useState(null);
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [friends, setFriends] = useState([]);
    const [nonFriends, setNonFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [messages, setMessages] = useState([]);
    const [selectedFriendId, setSelectedFriendId] = useState(null);
    const [content, setContent] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const fetchFriends = async () => {
        if (!token) {
            console.log('টোকেন নেই, ফ্রেন্ড ফেচ স্কিপ');
            return;
        }
        setLoading(true);
        try {
            console.log('ফ্রেন্ড ফেচ করা হচ্ছে...');
            const users = await fetchWithAuth(`${API_BASE_URL}/api/user`, token);
            console.log('ফ্রেন্ড ডেটা:', users);
            setFriends(users.filter((user) => user.isFriend));
        } catch (err) {
            console.error('ফ্রেন্ড ফেচ এরর:', err.message);
            setError(err.message || 'ফ্রেন্ড ফেচ ফেইলড');
        } finally {
            setLoading(false);
        }
    };

    const fetchNonFriends = async () => {
        if (!token) {
            console.log('টোকেন নেই, নন-ফ্রেন্ড ফেচ স্কিপ');
            return;
        }
        try {
            console.log('নন-ফ্রেন্ড ফেচ করা হচ্ছে...');
            const users = await fetchWithAuth(`${API_BASE_URL}/api/user`, token);
            console.log('নন-ফ্রেন্ড ডেটা:', users);
            setNonFriends(users.filter((user) => !user.isFriend));
        } catch (err) {
            console.error('নন-ফ্রেন্ড ফেচ এরর:', err.message);
            setError(err.message || 'নন-ফ্রেন্ড ফেচ ফেইলড');
        }
    };

    const fetchPendingRequests = async () => {
        if (!token) {
            console.log('টোকেন নেই, পেন্ডিং রিকোয়েস্ট ফেচ স্কিপ');
            return;
        }
        try {
            console.log('পেন্ডিং রিকোয়েস্ট ফেচ করা হচ্ছে...');
            const requests = await fetchWithAuth(`${API_BASE_URL}/api/friend-request`, token);
            console.log('পেন্ডিং রিকোয়েস্ট ডেটা:', requests);
            setPendingRequests(requests);
        } catch (err) {
            console.error('পেন্ডিং রিকোয়েস্ট ফেচ এরর:', err.message);
            setError(err.message || 'রিকোয়েস্ট ফেচ ফেইলড');
        }
    };

    const fetchMessages = async (friendId) => {
        if (!token || !friendId) return;
        try {
            console.log(`মেসেজ ফেচ করা হচ্ছে, friendId: ${friendId}`);
            const messages = await fetchWithAuth(
                `${API_BASE_URL}/api/messages?friendId=${friendId}`,
                token
            );
            console.log('মেসেজ ডেটা:', messages);
            setMessages(messages);
        } catch (err) {
            console.error('মেসেজ ফেচ এরর:', err.message);
            setError(err.message || 'মেসেজ ফেচ ফেইলড');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        socket?.disconnect();
        router.push('/login');
    };

    useEffect(() => {
        console.log('useEffect চলছে...');
        const storedToken = localStorage.getItem('token');
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

        console.log('Stored Token:', storedToken);
        console.log('Stored User:', storedUser);

        if (!storedToken || !storedUser?.id) {
            setError('লগইন করুন');
            router.push('/login');
            return;
        }

        setToken(storedToken);
        setUser(storedUser);
    }, [router]);

    useEffect(() => {
        if (!token || !user) return;

        console.log('টোকেন সেট হয়েছে, ফেচ ফাংশন কল হচ্ছে...');
        const initializeData = async () => {
            setLoading(true);
            try {
                await Promise.all([fetchFriends(), fetchNonFriends(), fetchPendingRequests()]);
            } catch (err) {
                console.error('ডেটা ফেচ এরর:', err.message);
                setError('ডেটা লোড করতে ব্যর্থ');
            } finally {
                setLoading(false);
            }
        };

        initializeData();

        // Socket.IO কানেকশন
        const newSocket = io(SOCKET_URL, {
            auth: { token },
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Socket.IO কানেক্টেড');
            newSocket.emit('join', user.id);
        });

        newSocket.on('connect_error', (err) => {
            console.error('Socket.IO এরর:', err.message);
            setError('রিয়েল-টাইম সার্ভারে কানেক্ট ফেইলড');
        });

        newSocket.on('receiveMessage', (message) => {
            console.log('নতুন মেসেজ:', message);
            setMessages((prev) => [...prev, message]);
        });

        newSocket.on('friendRequest', (request) => {
            console.log('নতুন ফ্রেন্ড রিকোয়েস্ট:', request);
            setPendingRequests((prev) => [...prev, request]);
        });

        newSocket.on('friendRequestAccepted', () => {
            console.log('ফ্রেন্ড রিকোয়েস্ট অ্যাকসেপ্টেড');
            fetchFriends();
        });

        newSocket.on('userStatus', ({ userId, isOnline }) => {
            console.log(`ইউজার স্ট্যাটাস আপডেট: ${userId}, Online: ${isOnline}`);
            setFriends((prev) =>
                prev.map((friend) =>
                    friend.id === userId ? { ...friend, isOnline } : friend
                )
            );
        });

        return () => {
            newSocket.disconnect();
        };
    }, [token, user]);

    useEffect(() => {
        if (selectedFriendId) {
            fetchMessages(selectedFriendId);
        }
    }, [selectedFriendId, token]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-gray-900">
                লোডিং...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* হেডার */}
            <header className="bg-blue-500 text-white p-4 flex justify-between items-center">
                <h1 className="text-xl font-bold">চ্যাট অ্যাপ</h1>
                <div className="flex items-center space-x-4">
                    <span>{user?.name}</span>
                    <button
                        onClick={handleLogout}
                        className="bg-red-600 px-4 py-2 rounded hover:bg-red-700"
                    >
                        লগআউট
                    </button>
                </div>
            </header>

            {/* মেইন কনটেন্ট */}
            <div className="flex flex-1 overflow-hidden">
                {/* সাইডবার */}
                <aside className="w-80 bg-white border-r overflow-y-auto">
                    <PendingRequests
                        pendingRequests={pendingRequests}
                        token={token}
                        fetchFriends={fetchFriends}
                        setPendingRequests={setPendingRequests}
                        setError={setError}
                    />
                    <NonFriendList nonFriends={nonFriends} token={token} setError={setError} />
                    <FriendList
                        friends={friends}
                        selectedFriendId={selectedFriendId}
                        setSelectedFriendId={setSelectedFriendId}
                    />
                </aside>

                {/* মেসেজ সেকশন */}
                <MessageSection
                    messages={messages}
                    userId={user?.id}
                    selectedFriendId={selectedFriendId}
                    friends={friends}
                    content={content}
                    setContent={setContent}
                    socket={socket}
                />
            </div>

            {/* এরর মেসেজ */}
            {error && (
                <div className="fixed top-4 right-4 bg-red-500 text-white p-3 rounded-lg flex items-center space-x-2">
                    <span>{error}</span>
                    <button
                        onClick={() => setError('')}
                        className="bg-gray-200 text-red-500 px-2 py-1 rounded"
                    >
                        বন্ধ
                    </button>
                </div>
            )}
        </div>
    );
}