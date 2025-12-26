import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useOrganization } from '../contexts/OrganizationContext';

export function useFirestore(collectionName, queryConstraints = []) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { organization } = useOrganization();

    // Use ref to prevent infinite loop if queryConstraints is a new array every render
    const constraintsRef = useRef(queryConstraints);
    // Simple deep compare or just length check could be enough for basic usage
    if (JSON.stringify(constraintsRef.current) !== JSON.stringify(queryConstraints)) {
        constraintsRef.current = queryConstraints;
    }

    useEffect(() => {
        if (!organization?.id) {
            setData([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const q = query(
                collection(db, collectionName),
                where('orgId', '==', organization.id),
                ...constraintsRef.current
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const documents = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setData(documents);
                setLoading(false);
            }, (err) => {
                console.error("Firestore Error:", err);
                setError(err);
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (err) {
            console.error("Setup Error:", err);
            setError(err);
            setLoading(false);
        }
    }, [collectionName, organization?.id, constraintsRef.current]);

    return { data, loading, error };
}
