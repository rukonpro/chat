'use client';
import { useEffect, useRef, useMemo, useState } from 'react';
import Image from 'next/image';
import CallModal from './CallModal';

const MessageSection = ({
                            messages,
                            calls,
                            userId,
                            selectedFriendId,
                            friends,
                            content,
                            setContent,
                            socket,
                            setSelectedFriendId,
                            className,
                        }) => {
    const messagesContainerRef = useRef(null);
    const [showCallModal, setShowCallModal] = useState(false);
    const [callType, setCallType] = useState(null);
    const [isCaller, setIsCaller] = useState(false);
    const [isIncoming, setIsIncoming] = useState(false);
    const [callData, setCallData] = useState(null);

    const scrollToBottom = () => {
        setTimeout(() => {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
        }, 100);
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, calls]);

    useEffect(() => {
        if (!socket) {
            return;
        }

        socket.on('incoming-call', (data) => {
            setCallData(data);
            setCallType(data.callType);
            setIsIncoming(true);
            setShowCallModal(true);
        });

        return () => {
            socket.off('incoming-call');
        };
    }, [socket]);

    const sendMessage = () => {
        if (!content.trim() || !socket || !selectedFriendId || !userId) return;
        socket.emit('sendMessage', {
            senderId: userId,
            receiverId: selectedFriendId,
            content: content.trim(),
        });
        setContent('');
    };

    const startCall = (type) => {
        if (!socket || !selectedFriendId || !userId) return;
        console.log('Starting call:', { type, selectedFriendId });
        setCallType(type);
        setIsCaller(true);
        setIsIncoming(false);
        setShowCallModal(true);
    };

    const combinedHistory = useMemo(() => {
        const filteredMessages = messages.filter(
            (msg) =>
                (msg.senderId === userId && msg.receiverId === selectedFriendId) ||
                (msg.senderId === selectedFriendId && msg.receiverId === userId)
        );
        const filteredCalls = calls.filter(
            (call) =>
                (call.callerId === userId && call.receiverId === selectedFriendId) ||
                (call.callerId === selectedFriendId && call.receiverId === userId)
        );

        const history = [...filteredMessages, ...filteredCalls]
            .map((item) => ({
                ...item,
                type: item.content ? 'message' : 'call',
            }))
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        console.log('CombinedHistory:', history);
        return history;
    }, [messages, calls, userId, selectedFriendId]);

    const formatDuration = (seconds) => {
        if (!seconds) return '0s';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
    };

    return (
        <main className={`flex-1 flex-col relative ${className || 'flex'}`}>
            {selectedFriendId ? (
                <>
                    <div className="bg-white p-4 border-b border-sky-500 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => setSelectedFriendId(null)}
                                className="md:hidden mr-2 p-1 rounded-full hover:bg-gray-200"
                                aria-label="Back to friend list"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            {(() => {
                                const selectedFriend = friends.find((f) => f.id === selectedFriendId);
                                return (
                                    <div className="flex items-center space-x-3">
                                        <div className="relative">
                                            {selectedFriend?.profilePic ? (
                                                <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden">
                                                    <Image
                                                        src={selectedFriend.profilePic}
                                                        alt={selectedFriend.name || 'Friend'}
                                                        width={40}
                                                        height={40}
                                                        className="object-cover"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        className="h-5 w-5 text-gray-500"
                                                        viewBox="0 0 20 20"
                                                        fill="currentColor"
                                                    >
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                        <h2 className="text-lg text-black font-semibold">{selectedFriend?.name || 'Unknown'}</h2>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="flex space-x-2">
                            <button
                                onClick={() => startCall('audio')}
                                className="p-2 rounded-full hover:bg-gray-200"
                                aria-label="Start audio call"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-sky-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={() => startCall('video')}
                                className="p-2 rounded-full hover:bg-gray-200"
                                aria-label="Start video call"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-6 w-6 text-sky-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div
                        ref={messagesContainerRef}
                        className="flex-1 overflow-y-auto p-2 sm:p-4 mb-36 bg-gray-50"
                        style={{ maxHeight: 'calc(100vh - 200px)' }}
                    >
                        {combinedHistory.map((item) => (
                            <div
                                key={item.id}
                                className={`mb-3 sm:mb-4 flex ${
                                    item.type === 'message'
                                        ? item.senderId === userId
                                            ? 'justify-end'
                                            : 'justify-start'
                                        : item.callerId === userId
                                            ? 'justify-end'
                                            : 'justify-start'
                                }`}
                            >
                                <div
                                    className={`max-w-[75%] sm:max-w-xs p-2 sm:p-3 rounded-lg text-sm sm:text-base ${
                                        item.type === 'message'
                                            ? item.senderId === userId
                                                ? 'bg-sky-500 text-white'
                                                : 'bg-gray-200 text-black'
                                            : item.callerId === userId
                                                ? 'bg-sky-500 text-white'
                                                : 'bg-gray-200 text-black'
                                    }`}
                                >
                                    {item.type === 'message' ? (
                                        <>
                                            <p>{item.content}</p>
                                            <p className="text-xs opacity-75 mt-1">
                                                {new Date(item.createdAt).toLocaleString('en-US', {
                                                    hour: 'numeric',
                                                    minute: 'numeric',
                                                    hour12: true,
                                                })}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p>
                                                {item.callerId === userId
                                                    ? `Outgoing ${item.callType} Call`
                                                    : `Incoming ${item.callType} Call`}{' '}
                                                {item.status === 'missed' ? '(Missed)' : ''}
                                            </p>
                                            <p className="text-xs opacity-75 mt-1">
                                                {new Date(item.createdAt).toLocaleString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: 'numeric',
                                                    minute: 'numeric',
                                                    hour12: true,
                                                })}
                                                {item.duration ? ` • Duration: ${formatDuration(item.duration)}` : ''}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-white p-2 sm:p-4 border-t border-sky-500 z-10">
                        <div className="flex space-x-2 py-2">
              <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                      }
                  }}
                  className="flex-1 p-2 border border-sky-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm sm:text-base text-black"
                  placeholder="Type a message..."
              />
                            <button
                                onClick={sendMessage}
                                disabled={!content.trim()}
                                className={`px-4 py-2 rounded-lg text-sm sm:text-base ${
                                    content.trim()
                                        ? 'bg-sky-500 text-white hover:bg-sky-600'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <p className="text-center">Select a friend to start chatting</p>
                </div>
            )}
            {showCallModal && (
                <CallModal
                    socket={socket}
                    userId={userId}
                    selectedFriendId={selectedFriendId}
                    friends={friends}
                    callType={callType}
                    isCaller={isCaller}
                    isIncoming={isIncoming}
                    onClose={() => setShowCallModal(false)}
                    callData={callData}
                />
            )}
        </main>
    );
};

export default MessageSection;