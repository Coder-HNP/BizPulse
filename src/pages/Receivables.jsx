import React, { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useOrganization } from '../contexts/OrganizationContext';
import { db } from '../lib/firebase';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
// Icons removed - not currently used in this component
import { Modal } from '../components/common/Modal';

export default function Receivables() {
    const { data: receivables, loading, error } = useFirestore('receivables');
    const { organization } = useOrganization();

    const [isCollectOpen, setIsCollectOpen] = useState(false);
    const [selectedReceivable, setSelectedReceivable] = useState(null);
    const [collectionAmount, setCollectionAmount] = useState(0);
    const [actionLoading, setActionLoading] = useState(false);

    // Statistics
    const totalReceivables = receivables.reduce((sum, r) => sum + (r.dueAmount || 0), 0);
    const overdueReceivables = receivables.filter(r => new Date(r.dueDate) < new Date() && r.status !== 'paid').reduce((sum, r) => sum + (r.dueAmount || 0), 0);

    async function handleCollection(e) {
        e.preventDefault();
        if (!selectedReceivable || collectionAmount <= 0) return;

        const amount = parseFloat(collectionAmount);
        if (amount > selectedReceivable.dueAmount) {
            alert(`Amount exceeds due amount of ₹${selectedReceivable.dueAmount}`);
            return;
        }

        setActionLoading(true);
        try {
            await runTransaction(db, async (transaction) => {
                const recRef = doc(db, 'receivables', selectedReceivable.id);
                const recDoc = await transaction.get(recRef);
                if (!recDoc.exists()) throw "Receivable not found";

                const data = recDoc.data();
                const newPaid = (data.paidAmount || 0) + amount;
                const newDue = data.totalAmount - newPaid;
                const newStatus = newDue <= 0.01 ? 'paid' : 'partial';

                transaction.update(recRef, {
                    paidAmount: newPaid,
                    dueAmount: newDue,
                    status: newStatus,
                    lastPaymentDate: serverTimestamp()
                });

                // Log Collection
                const collRef = doc(collection(db, 'collections'));
                transaction.set(collRef, {
                    orgId: organization.id,
                    receivableId: selectedReceivable.id,
                    orderId: selectedReceivable.orderId,
                    amount: amount,
                    customerName: selectedReceivable.customerName,
                    timestamp: new Date().toISOString()
                });

                // We could also log cash flow here if we had a dedicated cashflow collection
                const cfRef = doc(collection(db, 'cashflow_entries'));
                transaction.set(cfRef, {
                    orgId: organization.id,
                    type: 'inflow',
                    category: 'collection',
                    amount: amount,
                    description: `Collection from ${selectedReceivable.customerName} for Order ${selectedReceivable.orderId}`,
                    timestamp: new Date().toISOString()
                });
            });

            setIsCollectOpen(false);
            setCollectionAmount(0);
            alert("Payment Recorded!");
        } catch (err) {
            console.error(err);
            alert("Collection failed: " + err);
        }
        setActionLoading(false);
    }

    // Calculate Aging Bucket (simple version)
    const getAging = (dueDate) => {
        const diffTime = new Date() - new Date(dueDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return 'Current';
        if (diffDays <= 30) return '1-30 Days';
        if (diffDays <= 60) return '31-60 Days';
        if (diffDays <= 90) return '61-90 Days';
        return '90+ Days';
    };

    if (loading) return <div className="p-4">Loading receivables...</div>;
    if (error) return <div className="p-4 text-red-600">Error loading receivables</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Receivables & Collections</h1>
                <div className="flex space-x-4">
                    <div className="bg-red-50 px-4 py-2 rounded-md">
                        <span className="text-red-700 font-medium">Overdue: </span>
                        <span className="text-red-900 font-bold">₹{overdueReceivables.toLocaleString()}</span>
                    </div>
                    <div className="bg-indigo-50 px-4 py-2 rounded-md">
                        <span className="text-indigo-700 font-medium">Total Due: </span>
                        <span className="text-indigo-900 font-bold">₹{totalReceivables.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer / Order</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date (Age)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="relative px-6 py-3">
                                <span className="sr-only">Collect</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {receivables.map((rec) => {
                            const isOverdue = new Date(rec.dueDate) < new Date() && rec.status !== 'paid';
                            return (
                                <tr key={rec.id} className={isOverdue ? 'bg-red-50' : ''}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{rec.customerName}</div>
                                        <div className="text-sm text-gray-500">Order #{rec.orderId?.slice(0, 6)}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">{new Date(rec.dueDate).toLocaleDateString()}</div>
                                        <div className={`text-xs ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                            {rec.status !== 'paid' ? getAging(rec.dueDate) : '-'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">₹{rec.totalAmount}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">₹{rec.paidAmount || 0}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹{rec.dueAmount}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${rec.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {rec.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {rec.status !== 'paid' && (
                                            <button
                                                onClick={() => {
                                                    setSelectedReceivable(rec);
                                                    setIsCollectOpen(true);
                                                }}
                                                className="text-indigo-600 hover:text-indigo-900"
                                            >
                                                Collect Payment
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {receivables.length === 0 && <tr><td colSpan="7" className="p-4 text-center text-gray-500">No receivables found.</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Collection Modal */}
            <Modal isOpen={isCollectOpen} onClose={() => setIsCollectOpen(false)} title={`Record Payment: ${selectedReceivable?.customerName}`}>
                <form onSubmit={handleCollection}>
                    <div className="space-y-4">
                        <div className="bg-indigo-50 p-4 rounded text-sm text-indigo-700">
                            <p>Total Due: ₹{selectedReceivable?.dueAmount}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Payment Amount (₹)</label>
                            <input
                                type="number" step="0.01" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={collectionAmount}
                                onChange={e => setCollectionAmount(e.target.value)}
                                max={selectedReceivable?.dueAmount}
                            />
                        </div>
                    </div>
                    <div className="mt-5 sm:mt-6">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 sm:text-sm disabled:opacity-50"
                        >
                            {actionLoading ? 'Recording...' : 'Record Payment'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
