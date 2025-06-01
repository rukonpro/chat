'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { validateRegisterForm } from '@/lib/validation';

export default function Register() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [formErrors, setFormErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Handle input changes
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });

        // Clear error for this field when user starts typing
        if (formErrors[name]) {
            setFormErrors({
                ...formErrors,
                [name]: ''
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setServerError('');

        // Validate form
        const validation = validateRegisterForm(formData);
        if (!validation.isValid) {
            setFormErrors(validation.errors);
            return;
        }

        setLoading(true);

        try {
            const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
            const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Registration failed');
            }

            // Save JWT token and user data if provided
            if (data.token) {
                localStorage.setItem('token', data.token);
            }
            if (data.user) {
                localStorage.setItem('user', JSON.stringify(data.user));
            }

            // Redirect to chat page or login page based on response
            router.push(data.token ? '/chat' : '/login');
        } catch (err) {
            // Handle different types of errors
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                setServerError('Network error. Please check your connection.');
            } else {
                setServerError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
                <h2 className="text-2xl font-bold text-center mb-6 text-black">Register</h2>
                {serverError && <p className="text-red-500 text-center mb-4">{serverError}</p>}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                            Name
                        </label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className={`mt-1 p-2 w-full border rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-black ${
                                formErrors.name ? 'border-red-500' : ''
                            }`}
                            placeholder="Enter your name"
                        />
                        {formErrors.name && (
                            <p className="mt-1 text-sm text-red-500">{formErrors.name}</p>
                        )}
                    </div>
                    <div className="mb-4">
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                            Email
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className={`mt-1 p-2 w-full border rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-black${
                                formErrors.email ? 'border-red-500' : ''
                            }`}
                            placeholder="Enter your email"
                        />
                        {formErrors.email && (
                            <p className="mt-1 text-sm text-red-500">{formErrors.email}</p>
                        )}
                    </div>
                    <div className="mb-4">
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className={`mt-1 p-2 w-full border rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-black${
                                formErrors.password ? 'border-red-500' : ''
                            }`}
                            placeholder="Enter your password"
                        />
                        {formErrors.password && (
                            <p className="mt-1 text-sm text-red-500">{formErrors.password}</p>
                        )}
                    </div>
                    <div className="mb-6">
                        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                            Confirm Password
                        </label>
                        <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className={`mt-1 p-2 w-full border rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-black${
                                formErrors.confirmPassword ? 'border-red-500' : ''
                            }`}
                            placeholder="Enter password again"
                        />
                        {formErrors.confirmPassword && (
                            <p className="mt-1 text-sm text-red-500">{formErrors.confirmPassword}</p>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2 px-4 bg-sky-500 text-white rounded-md hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 text-black${
                            loading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {loading ? 'Loading...' : 'Register'}
                    </button>
                </form>
                <p className="mt-4 text-center text-sm text-gray-600">
                    Already have an account?{' '}
                    <Link href="/login" className="text-sky-500 hover:underline">
                        Login
                    </Link>
                </p>
            </div>
        </div>
    );
}
