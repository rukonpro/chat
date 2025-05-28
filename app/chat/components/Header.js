'use client';

const Header = ({
    user,
    socketConnected,
    pendingRequests,
    setNotificationDrawerOpen,
    notificationDrawerOpen,
    setLeftSidebarOpen,
    leftSidebarOpen,
    handleLogout
}) => {
    return (
        <header className="bg-sky-500 text-white p-4 flex flex-col sm:flex-row justify-between items-center">
            <div className="flex items-center w-full sm:w-auto justify-between sm:justify-start">
                <button 
                    className="md:hidden text-white mr-4" 
                    onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
                <h1 className="text-xl font-bold mb-2 sm:mb-0">Chat App</h1>
            </div>
            <div className="flex flex-wrap items-center space-x-2 sm:space-x-4">
                <span className="mr-2">{user?.name || 'Unnamed'}</span>
                <span
                    className={`text-xs ${socketConnected ? 'text-green-200' : 'text-red-200'} mr-2`}
                >
                    {socketConnected ? 'Online' : 'Offline'}
                </span>
                <div className="relative cursor-pointer mr-2" onClick={() => setNotificationDrawerOpen(!notificationDrawerOpen)}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {pendingRequests.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                            {pendingRequests.length}
                        </span>
                    )}
                </div>
                <button
                    onClick={handleLogout}
                    className="p-2 rounded  mt-2 sm:mt-0 flex items-center justify-center cursor-pointer"
                    title="Logout"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>
        </header>
    );
};

export default Header;
