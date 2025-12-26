import React, { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useOrganization } from '../contexts/OrganizationContext';
import { db } from '../lib/firebase';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Warehouse, Edit2, AlertTriangle } from 'lucide-react';
import { Modal } from '../components/common/Modal';

export default function Inventory() {
    const { data: inventory, loading, error } = useFirestore('inventory_items');
    const { organization } = useOrganization();

    const [isAdjustOpen, setIsAdjustOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [adjustment, setAdjustment] = useState({ type: 'add', quantity: 0, reason: '' });
    const [actionLoading, setActionLoading] = useState(false);

    // Derive total inventory value
    const totalInventoryValue = inventory.reduce((sum, item) => sum + ((item.quantity || 0) * (item.averageCost || 0)), 0);

    async function handleadjustment(e) {
        e.preventDefault();
        if (!selectedItem || !organization) return;

        const qtyChange = parseFloat(adjustment.quantity);
        if (qtyChange <= 0) return;

        const actualChange = adjustment.type === 'add' ? qtyChange : -qtyChange;

        setActionLoading(true);
        try {
            await runTransaction(db, async (transaction) => {
                const itemRef = doc(db, 'inventory_items', selectedItem.id);
                const itemDoc = await transaction.get(itemRef);
                if (!itemDoc.exists()) throw "Item not found";

                const currentQty = itemDoc.data().quantity || 0;
                const newQty = currentQty + actualChange;

                if (newQty < 0) throw "Insufficient stock for deduction";

                transaction.update(itemRef, {
                    quantity: newQty,
                    lastUpdated: serverTimestamp()
                });

                // Log
                const logRef = doc(collection(db, 'inventory_logs'));
                transaction.set(logRef, {
                    itemId: selectedItem.id,
                    type: adjustment.type === 'add' ? 'manual_add' : 'manual_deduct',
                    quantityChange: actualChange,
                    reason: adjustment.reason,
                    orgId: organization.id,
                    timestamp: new Date().toISOString()
                });
            });

            setIsAdjustOpen(false);
            setAdjustment({ type: 'add', quantity: 0, reason: '' });
        } catch (err) {
            console.error(err);
            alert("Adjustment failed: " + err);
        }
        setActionLoading(false);
    }

    if (loading) return <div className="p-4">Loading inventory...</div>;
    if (error) return <div className="p-4 text-red-600">Error loading inventory</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Finished Goods Inventory</h1>
                <div className="bg-indigo-50 px-4 py-2 rounded-md">
                    <span className="text-indigo-700 font-medium">Total Value: </span>
                    <span className="text-indigo-900 font-bold">₹{totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Qty</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Cost</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
                            <th scope="col" className="relative px-6 py-3">
                                <span className="sr-only">Adjust</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {inventory.map((item) => (
                            <tr key={item.id}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-gray-100 rounded-full">
                                            <Warehouse className="h-5 w-5 text-gray-500" />
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-gray-900">{item.productName || item.id}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.quantity > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {item.quantity?.toFixed(2)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    ₹{item.averageCost?.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                    ₹{((item.quantity || 0) * (item.averageCost || 0)).toFixed(2)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => {
                                            setSelectedItem(item);
                                            setIsAdjustOpen(true);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-900 flex items-center ml-auto"
                                    >
                                        <Edit2 className="w-4 h-4 mr-1" /> Adjust
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {inventory.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                                    No finished goods in stock. Run production to add items.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Adjustment Modal */}
            <Modal isOpen={isAdjustOpen} onClose={() => setIsAdjustOpen(false)} title={`Adjust Stock: ${selectedItem?.productName}`}>
                <form onSubmit={handleadjustment}>
                    <div className="bg-yellow-50 p-4 rounded-md mb-4 flex items-start">
                        <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 mr-2" />
                        <p className="text-sm text-yellow-700">
                            Manual adjustments should only be used for corrections (e.g. theft, damage, data entry error).
                            For sales or production, use the respective modules.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Action</label>
                            <select
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={adjustment.type}
                                onChange={e => setAdjustment({ ...adjustment, type: e.target.value })}
                            >
                                <option value="add">Add Stock (+)</option>
                                <option value="deduct">Deduct Stock (-)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Quantity</label>
                            <input
                                type="number" step="0.01" required min="0.01"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={adjustment.quantity}
                                onChange={e => setAdjustment({ ...adjustment, quantity: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Reason</label>
                            <input
                                type="text" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                placeholder="e.g. Broken item found"
                                value={adjustment.reason}
                                onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="mt-5 sm:mt-6">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:text-sm disabled:opacity-50"
                        >
                            {actionLoading ? 'Saving...' : 'Confirm Adjustment'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
