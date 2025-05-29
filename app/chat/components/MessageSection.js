'use client';
import { useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';

const MessageSection = ({
    messages,
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

    const scrollToBottom = () => {
        // Use setTimeout to ensure DOM has updated before scrolling
        setTimeout(() => {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
        }, 0);
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, selectedFriendId]);

    // Also scroll to bottom when the component mounts
    useEffect(() => {
        scrollToBottom();
    }, []);

    const sendMessage = () => {
        if (!content.trim() || !socket || !selectedFriendId || !userId) return;
        socket.emit('sendMessage', {
            senderId: userId,
            receiverId: selectedFriendId,
            content: content.trim(),
        });
        setContent('');
    };

    const filteredMessages = useMemo(
        () =>
            messages.filter(
                (msg) =>
                    (msg.senderId === userId && msg.receiverId === selectedFriendId) ||
                    (msg.senderId === selectedFriendId && msg.receiverId === userId)
            ),
        [messages, userId, selectedFriendId]
    );

    return (
        <main className={`flex-1 flex-col relative ${className || 'flex'}`}>
            {selectedFriendId ? (
                <>
                    <div className="bg-white p-4 border-b border-sky-500 flex items-center">
                        <button 
                            onClick={() => setSelectedFriendId(null)} 
                            className="md:hidden mr-2 p-1 rounded-full hover:bg-gray-200"
                            aria-label="Back to friend list"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <h2 className="text-lg font-semibold">
                                        {selectedFriend?.name || 'Unknown'}
                                    </h2>
                                </div>
                            );
                        })()}
                    </div>
                    <div 
                        ref={messagesContainerRef} 
                        className="flex-1 overflow-y-auto p-2 sm:p-4 mb-36 bg-gray-50"
                        style={{ maxHeight: 'calc(100vh - 200px)' }}
                    >
                            {filteredMessages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`mb-3 sm:mb-4 flex ${
                                        msg.senderId === userId ? 'justify-end' : 'justify-start'
                                    }`}
                                >
                                    <div
                                        className={`max-w-[75%] sm:max-w-xs p-2 sm:p-3 rounded-lg text-sm sm:text-base ${
                                            msg.senderId === userId
                                                ? 'bg-sky-500 text-white'
                                                : 'bg-gray-200 text-black'
                                        }`}
                                    >
                                        <p>{msg.content}</p>
                                        <p className="text-xs opacity-75 mt-1">
                                            {new Date(msg.createdAt).toLocaleString('en-US', {
                                                hour: 'numeric',
                                                minute: 'numeric',
                                                hour12: true,
                                            })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-white p-2 sm:p-4 border-t border-sky-500 z-10">
                        <div className="flex space-x-2 py-8">
                            <textarea
                                type="text"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                className="flex-1 p-2 border border-sky-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm sm:text-base"
                                placeholder="Type a message..."
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!content.trim()}
                                className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base ${
                                    content.trim()
                                        ? 'bg-sky-500 text-white hover:bg-sky-600'
                                        : 'bg-sky-100 text-sky-500 cursor-not-allowed'
                                } `}
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    Select a friend to start chatting
                </div>
            )}
        </main>
    );
};

export default MessageSection;
