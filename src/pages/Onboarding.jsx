import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';

export default function Onboarding() {
    const [orgName, setOrgName] = useState('');
    const [loading, setLoading] = useState(false);
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        if (!orgName.trim()) return;

        setLoading(true);
        try {
            // Create new organization
            // We'll use a transaction or simple batch if needed, but sequential is fine for now
            // Actually, we should probably generate an ID or use auto-id.
            // Let's use auto-generated ID from doc()

            const orgId = crypto.randomUUID();

            await setDoc(doc(db, 'organizations', orgId), {
                name: orgName,
                createdAt: new Date().toISOString(),
                ownerId: currentUser.uid,
                members: [currentUser.uid]
            });

            // Update user profile
            await setDoc(doc(db, 'users', currentUser.uid), {
                email: currentUser.email,
                orgId: orgId,
                role: 'admin',
                createdAt: new Date().toISOString()
            }, { merge: true });

            // Identify that we are done?
            // OrganizationContext will pick up the change automatically
            // But we might need to wait for it.
            // We can force navigate, but PrivateRoute checks loading.

            navigate('/');
        } catch (error) {
            console.error("Error creating organization:", error);
            alert("Failed to create organization. Please try again.");
        }
        setLoading(false);
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="mx-auto h-12 w-12 bg-indigo-100 rounded-full flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-indigo-600" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Setup your Organization
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Create a new workspace for your manufacturing business
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="orgName" className="block text-sm font-medium text-gray-700">
                                Organization Name
                            </label>
                            <div className="mt-1">
                                <input
                                    id="orgName"
                                    name="orgName"
                                    type="text"
                                    required
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    placeholder="e.g. Acme Manufacturing"
                                    value={orgName}
                                    onChange={(e) => setOrgName(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                                {loading ? 'Creating...' : 'Create Organization'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
