'use client';

import { fetchWithAuth, API_BASE_URL } from './utils';

const Notification = ({
    pendingRequests,
    token,
    setError,
    fetchData,
    setPendingRequests,
    setNotificationDrawerOpen,
    notificationDrawerOpen,
    processing,
    setProcessing,
    isMobile = false
}) => {
    const handleAcceptRequest = (requestId) => {
        setProcessing(requestId);
        fetchWithAuth(`${API_BASE_URL}/api/friend-request/accept`, token, {
            method: 'POST',
            body: JSON.stringify({ requestId }),
        })
        .then(() => {
            setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
            fetchData();
        })
        .catch(err => {
            setError(err.message || 'Failed to accept request');
        })
        .finally(() => {
            setProcessing(null);
        });
    };

    const handleRejectRequest = (requestId) => {
        setProcessing(requestId);
        fetchWithAuth(`${API_BASE_URL}/api/friend-request/reject`, token, {
            method: 'POST',
            body: JSON.stringify({ requestId }),
        })
        .then(() => {
            setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        })
        .catch(err => {
            setError(err.message || 'Failed to reject request');
        })
        .finally(() => {
            setProcessing(null);
        });
    };

    return (
        <div className={isMobile ? "fixed inset-0 bg-black/10 bg-opacity-50 z-50 flex justify-end lg:hidden" : ""}>
            <div className={isMobile ? "bg-white w-full sm:w-96 md:w-80 h-full shadow-lg overflow-y-auto" : ""}>
                <div className="p-4  text-sky-500 flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Notifications</h2>
                    {notificationDrawerOpen && (
                        <button
                            onClick={() => setNotificationDrawerOpen(false)}
                            className="text-white hover:text-gray-200"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
                <div className="p-2 sm:p-4">
                    <h3 className="text-base sm:text-lg font-semibold mb-2">Friend Requests</h3>
                    {pendingRequests.length > 0 ? (
                        pendingRequests.map((req) => (
                            <div
                                key={req.id}
                                className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded mb-2"
                            >
                                <span className="text-sm sm:text-base">{req.sender.name || 'Unnamed'}</span>
                                <div className="flex space-x-1 sm:space-x-2">
                                    <button
                                        onClick={() => handleAcceptRequest(req.id)}
                                        className="px-2 py-1 rounded text-xs sm:text-sm bg-green-500 hover:bg-green-600 text-white"
                                    >
                                        Accept
                                    </button>
                                    <button
                                        onClick={() => handleRejectRequest(req.id)}
                                        className="px-2 py-1 rounded text-xs sm:text-sm bg-red-500 hover:bg-red-600 text-white"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm sm:text-base text-gray-500">No pending requests</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Notification;
