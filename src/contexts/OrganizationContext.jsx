import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const OrganizationContext = createContext();

export function useOrganization() {
    return useContext(OrganizationContext);
}

export function OrganizationProvider({ children }) {
    const { currentUser } = useAuth();
    const [organization, setOrganization] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setOrganization(null);
            setUserProfile(null);
            setLoading(false);
            return;
        }

        setLoading(true);

        // Listen to user profile changes
        const userRef = doc(db, 'users', currentUser.uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                setUserProfile(userData);

                if (userData.orgId) {
                    // Listen to organization changes
                    const orgRef = doc(db, 'organizations', userData.orgId);
                    // We nest this subscription to ensure we always have fresh org data
                    // Ideally we might want to manage this subscription separately to avoid nesting
                    // but for now this ensures simple dependency.
                    // However, onSnapshot inside onSnapshot can be tricky with cleanup.
                    // Let's rely on a separate effect relative to userData.orgId.
                } else {
                    setOrganization(null);
                }
            } else {
                setUserProfile(null);
                setOrganization(null);
            }
            // We'll set loading false in the secondary effect or here if no org
            if (!docSnap.exists() || !docSnap.data().orgId) {
                setLoading(false);
            }
        }, (err) => {
            console.error("Error fetching user profile:", err);
            setLoading(false);
        });

        return () => unsubscribeUser();
    }, [currentUser]);

    // Separate effect for organization
    useEffect(() => {
        if (!userProfile?.orgId) {
            if (!loading && currentUser && userProfile) {
                // case where profile loaded but no org
            }
            return;
        }

        const orgRef = doc(db, 'organizations', userProfile.orgId);
        const unsubscribeOrg = onSnapshot(orgRef, (docSnap) => {
            if (docSnap.exists()) {
                setOrganization({ id: docSnap.id, ...docSnap.data() });
            } else {
                setOrganization(null);
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching organization:", err);
            setLoading(false);
        });

        return () => unsubscribeOrg();
    }, [userProfile?.orgId]);

    const value = {
        organization,
        userProfile,
        loading
    };

    return (
        <OrganizationContext.Provider value={value}>
            {children}
        </OrganizationContext.Provider>
    );
}
