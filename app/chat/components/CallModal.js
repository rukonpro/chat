'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import SimplePeer from 'simple-peer';

// Reusable CallButton component
const CallButton = ({ onClick, bgColor, hoverColor, svgPath, size = 'w-16 h-16' }) => (
    <button
        onClick={onClick}
        className={`${size} ${bgColor} rounded-full flex items-center justify-center ${hoverColor} transition-colors`}
    >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="white">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={svgPath} />
        </svg>
    </button>
);

// SVG paths for reuse
const SVG_PATHS = {
    reject: 'M6 18L18 6M6 6l12 12',
    accept: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
};

// Option button SVGs (simplified for reuse)
const OPTION_SVGS = [
    { path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z', fill: true },
    { path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v4h2zm0 6h-2v2h2z', fill: true },
    { path: 'M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7V5h10v14zm-4-4h-2v-2h2zm0-4h-2V7h2v4z', fill: true },
    { path: 'M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0-4c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2z', fill: true },
];

const CallModal = ({
                       socket,
                       userId,
                       selectedFriendId,
                       friends,
                       callType,
                       isCaller,
                       isIncoming,
                       onClose,
                       callData,
                   }) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callStatus, setCallStatus] = useState(isIncoming ? 'incoming' : 'calling');
    const [callId, setCallId] = useState(callData?.callId || null);
    const [error, setError] = useState(null);
    const [timer, setTimer] = useState(0);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerRef = useRef(null);
    const signalProcessed = useRef(false);
    const timerRef = useRef(null);
    const ringtoneRef = useRef(null);

    // Memoize friend to avoid repeated array searches
    const friend = useMemo(() => friends.find((f) => f.id === selectedFriendId), [friends, selectedFriendId]);

    const formatTimer = (seconds) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const renderFriendImage = () => (
        <div className="relative w-20 h-20">
            {friend?.profilePic ? (
                <div className="w-full h-full rounded-full overflow-hidden shadow-md">
                    <Image
                        src={friend.profilePic}
                        alt={friend.name || 'Friend'}
                        width={80}
                        height={80}
                        className="object-cover"
                    />
                </div>
            ) : (
                <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center shadow-md">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-10 w-10 text-gray-500"
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
    );

    // Consolidated cleanup function
    const cleanupResources = () => {
        if (localStream) {
            localStream.getTracks().forEach((track) => track.stop());
            setLocalStream(null);
        }
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (ringtoneRef.current) {
            ringtoneRef.current.pause();
            ringtoneRef.current = null;
        }
        setRemoteStream(null);
        signalProcessed.current = false;
    };

    // Handle media initialization and WebRTC setup
    useEffect(() => {
        const initMedia = async () => {
            try {
                const constraints = { audio: true, video: callType === 'video' };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                setLocalStream(stream);
                if (localVideoRef.current && callType === 'video') {
                    localVideoRef.current.srcObject = stream;
                }

                const peer = new SimplePeer({
                    initiator: isCaller,
                    trickle: false,
                    stream,
                });

                peerRef.current = peer;

                peer.on('signal', (data) => {
                    const event = isCaller ? 'call-user' : 'accept-call';
                    const payload = isCaller
                        ? { senderId: userId, receiverId: selectedFriendId, signalData: data, callType }
                        : { signalData: data, senderId: userId, receiverId: callData.senderId, callId: callData.callId };
                    socket.emit(event, payload);
                });

                peer.on('stream', (remoteStream) => {
                    setRemoteStream(remoteStream);
                    if (remoteVideoRef.current && callType === 'video') {
                        remoteVideoRef.current.srcObject = remoteStream;
                    }
                    setCallStatus('connected');
                });

                peer.on('error', (err) => {
                    console.error('Peer error:', err.message);
                    setCallStatus('error');
                    setError('WebRTC connection failed');
                });

                if (!isCaller && callData) {
                    try {
                        peer.signal(callData.signalData);
                    } catch (err) {
                        setCallStatus('error');
                        setError('Failed to process incoming call');
                    }
                }
            } catch (err) {
                setCallStatus('error');
                setError('Failed to access microphone or camera');
            }
        };

        if (['incoming', 'calling', 'connecting'].includes(callStatus)) {
            initMedia();
        }

        return cleanupResources;
    }, [socket, userId, selectedFriendId, callType, isCaller, isIncoming, callData, callStatus]);

    // Timer logic
    useEffect(() => {
        if (callStatus === 'connected') {
            setTimer(0);
            timerRef.current = setInterval(() => setTimer((prev) => prev + 1), 1000);
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [callStatus]);

    // Socket event handlers
    useEffect(() => {
        if (!socket) return;

        const handleCallInitiated = ({ callId }) => setCallId(callId);
        const handleAcceptCall = (data) => {
            if (isCaller && peerRef.current && !signalProcessed.current) {
                try {
                    signalProcessed.current = true;
                    peerRef.current.signal(data.signalData);
                    setCallStatus('connected');
                } catch (err) {
                    setCallStatus('error');
                    setError('Failed to connect call');
                }
            }
        };
        const handleRejectCall = () => {
            setCallStatus('rejected');
            cleanup();
        };
        const handleEndCall = () => {
            setCallStatus('ended');
            cleanup();
        };
        const handleCallError = ({ message }) => {
            setCallStatus('error');
            setError(message);
        };

        if (isCaller) socket.on('call-initiated', handleCallInitiated);
        socket.on('accept-call', handleAcceptCall);
        socket.on('reject-call', handleRejectCall);
        socket.on('end-call', handleEndCall);
        socket.on('call-error', handleCallError);

        return () => {
            if (isCaller) socket.off('call-initiated', handleCallInitiated);
            socket.off('accept-call', handleAcceptCall);
            socket.off('reject-call', handleRejectCall);
            socket.off('end-call', handleEndCall);
            socket.off('call-error', handleCallError);
        };
    }, [socket, isCaller]);

    // Ringtone logic (consolidated)
    useEffect(() => {
        let ringtoneFile = null;
        if (isIncoming && callStatus === 'incoming') {
            ringtoneFile = '/call-ringtone.mp3';
        } else if (isCaller && callStatus === 'calling') {
            ringtoneFile = '/calling-sound.mp3';
        }

        if (ringtoneFile) {
            const audio = new Audio(ringtoneFile);
            ringtoneRef.current = audio;
            audio.loop = true;
            audio.play().catch((e) => console.log('Error playing ringtone:', e));
        }

        return () => {
            if (ringtoneRef.current) {
                ringtoneRef.current.pause();
                ringtoneRef.current = null;
            }
        };
    }, [callStatus, isCaller, isIncoming]);

    const cleanup = () => {
        cleanupResources();
        onClose();
    };

    const handleAcceptCall = () => setCallStatus('connecting');
    const handleRejectCall = () => {
        socket.emit('reject-call', { senderId: userId, receiverId: callData.senderId, callId });
        cleanup();
    };
    const handleEndCall = () => {
        socket.emit('end-call', { senderId: userId, receiverId: selectedFriendId, callId: callId || null });
        cleanup();
    };

    const renderCommonHeader = (title) => (
        <div className="flex flex-col items-center mb-8">
            {renderFriendImage()}
            <h2 className="text-3xl font-bold mt-4">{title}</h2>
            <p className="text-xl">{friend?.name || 'Unknown'}</p>
        </div>
    );

    const renderOptionButtons = () => (
        <div className="flex flex-col items-center space-y-4">
            {[0, 1].map((row) => (
                <div key={row} className="flex space-x-4">
                    {OPTION_SVGS.slice(row * 3, (row + 1) * 3).map((svg, idx) => (
                        <button
                            key={idx}
                            className="w-12 h-12 bg-sky-700/50 rounded-full flex items-center justify-center hover:bg-sky-800 transition-colors"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                fill={svg.fill ? 'white' : 'none'}
                                viewBox="0 0 24 24"
                            >
                                <path d={svg.path} />
                            </svg>
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );

    const renderCloseButton = () => (
        <div className="flex justify-center">
            <CallButton
                onClick={cleanup}
                bgColor="bg-sky-700/50"
                hoverColor="hover:bg-sky-800"
                svgPath={SVG_PATHS.reject}
            />
        </div>
    );

    return (
        <div className="fixed inset-0 bg-transparent flex items-center justify-center z-50">
            <div className="bg-gradient-to-b from-sky-500 to-sky-600 rounded-2xl w-[300px] h-[500px] p-4 flex flex-col items-center justify-center text-white relative overflow-hidden">
                <div className="absolute top-4 right-4 text-sm">
                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
                {callStatus === 'incoming' && (
                    <>
                        {renderCommonHeader(`Incoming ${callType === 'video' ? 'Video' : 'Audio'} Call`)}
                        <div className="flex space-x-8">
                            <CallButton
                                onClick={handleRejectCall}
                                bgColor="bg-red-600"
                                hoverColor="hover:bg-red-700"
                                svgPath={SVG_PATHS.reject}
                            />
                            <CallButton
                                onClick={handleAcceptCall}
                                bgColor="bg-green-600"
                                hoverColor="hover:bg-green-700"
                                svgPath={SVG_PATHS.accept}
                            />
                        </div>
                    </>
                )}
                {callStatus === 'calling' && (
                    <>
                        {renderCommonHeader('Calling...')}
                        <div className="flex justify-center">
                            <CallButton
                                onClick={handleEndCall}
                                bgColor="bg-red-600"
                                hoverColor="hover:bg-red-700"
                                svgPath={SVG_PATHS.reject}
                            />
                        </div>
                    </>
                )}
                {callStatus === 'connecting' && (
                    <>
                        {renderCommonHeader('Connecting...')}
                    </>
                )}
                {callStatus === 'connected' && (
                    <>
                        <div className="flex flex-col items-center mb-8">
                            {renderFriendImage()}
                            <p className="text-2xl font-mono mb-4">{formatTimer(timer)}</p>
                            <h2 className="text-3xl font-bold mt-4">Call with {friend?.name || 'Unknown'}</h2>
                        </div>
                        {renderOptionButtons()}
                        <div className="mt-8">
                            <CallButton
                                onClick={handleEndCall}
                                bgColor="bg-red-600"
                                hoverColor="hover:bg-red-700"
                                svgPath={SVG_PATHS.reject}
                            />
                        </div>
                    </>
                )}
                {callStatus === 'rejected' && (
                    <>
                        {renderCommonHeader('Call Rejected')}
                        {renderCloseButton()}
                    </>
                )}
                {callStatus === 'ended' && (
                    <>
                        {renderCommonHeader('Call Ended')}
                        {renderCloseButton()}
                    </>
                )}
                {callStatus === 'error' && (
                    <>
                        <div className="flex flex-col items-center mb-8">
                            {renderFriendImage()}
                            <h2 className="text-3xl font-bold mt-4">Error in Call</h2>
                            <p className="text-xl text-red-200">{error || 'Something went wrong. Please try again.'}</p>
                        </div>
                        {renderCloseButton()}
                    </>
                )}
            </div>
        </div>
    );
};

export default CallModal;