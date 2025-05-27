"use client"
import React, {useEffect, useState} from 'react';
import {useRouter} from "next/navigation";

const Friends = () => {
    const [error, setError] = useState('');
    const [token, setToken] = useState(null);
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState(null);
    const router = useRouter();
    useEffect(() => {
        // লগইন ডেটা লোড
        const storedToken = localStorage.getItem('token');
        const storedUser = JSON.parse(localStorage.getItem('user'));

        if (!storedToken || !storedUser?.id) {
            setError('লগইন করুন');
            router.push('/login');
            return;
        }

        setToken(storedToken);
        setUser(storedUser);
    },[]);

    useEffect(() => {
        // ফ্রেন্ড লিস্ট ফেচ
        const fetchFriends = async () => {
            if (!token) return;
            setLoading(true);
            try {
                const res = await fetch('http://localhost:3000/api/user', {
                    headers: { Authorization: `Bearer ${token}` },
                });


                if (!res.ok) throw new Error('ফ্রেন্ড ফেচ ফেইলড');
                const users = await res.json();
                console.log(users);
                setFriends(users.filter((user) => user.isFriend));
            } catch (err) {
                console.log(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchFriends()
    }, [token]);
    return (
        <div>
<h1>Friends</h1>
        </div>
    );
};

export default Friends;